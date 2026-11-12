/**
 * Host wiring integration test: mount the plugin on a fake cordis context the
 * same way the loader does, then exercise every registration it makes —
 * prompt section, prompt context, tool, and HTTP handler.
 *
 * This is the test that would have caught the resource-vs-handler routing bug
 * and the non-lossless presentation meta: it goes through `apply()` instead of
 * importing the helpers directly.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { apply } from '../lib/index.js';

/** One isolated home + project pair. */
function fixture(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-agent-memory-host-'));
  const home = join(root, 'home');
  const project = join(root, 'project');
  mkdirSync(project, { recursive: true });
  return { root, home, project };
}

/**
 * Mount the plugin on a minimal cordis-shaped context and collect what it
 * registers. `ctx.inject(['webServer'])` receives a host whose `webServer`
 * records routes, mirroring the real service.
 */
function mount(home, project) {
  const captured = { sections: [], contexts: [], tools: [], routes: [] };
  const makeContext = () => ({
    effect(fn) {
      return fn();
    },
    systemPrompt: {
      section(section) {
        captured.sections.push(section);
        return () => {};
      },
      context(context) {
        captured.contexts.push(context);
        return () => {};
      },
    },
    tools: {
      register(tool) {
        captured.tools.push(tool);
        return () => {};
      },
    },
    logger: { info() {}, warn() {} },
    get(service) {
      if (service !== 'workingDirectory') return undefined;
      return { get: () => project };
    },
    inject(_services, callback) {
      callback({
        effect(fn) {
          return fn();
        },
        webServer: {
          register(route) {
            captured.routes.push(route);
            return () => {};
          },
        },
      });
    },
  });
  apply(makeContext(), { home });
  return captured;
}

/** Invoke a node:http handler with a synthetic request and response. */
async function callHandler(handler, { method = 'GET', url, body }) {
  const request = Readable.from(body === undefined ? [] : [Buffer.from(body)]);
  request.method = method;
  request.url = url;
  const response = {
    status: undefined,
    headers: undefined,
    body: undefined,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(text) {
      this.body = text;
    },
  };
  await handler(request, response);
  return { status: response.status, headers: response.headers, json: JSON.parse(response.body) };
}

test('apply registers exactly one instructions section and one snapshot context', () => {
  const { home, project } = fixture();
  const captured = mount(home, project);
  assert.equal(captured.sections.length, 1);
  assert.equal(captured.sections[0].name, 'memory:instructions');
  assert.equal(captured.sections[0].order, 700);
  assert.match(captured.sections[0].text, /Memory/);
  assert.match(captured.sections[0].text, /secrets/i);

  assert.equal(captured.contexts.length, 1);
  assert.equal(captured.contexts[0].name, 'memory:snapshot');
  assert.equal(captured.contexts[0].order, 300);
  assert.equal(captured.contexts[0].required, true);
  assert.equal(typeof captured.contexts[0].text, 'function');
});

test('apply registers one web route and one tool', () => {
  const { home, project } = fixture();
  const captured = mount(home, project);
  assert.equal(captured.routes.length, 1);
  assert.equal(captured.routes[0].kind, 'prefix');
  assert.equal(captured.routes[0].path, '/dsh-agent-memory');
  assert.equal(typeof captured.routes[0].handler, 'function');
  assert.equal(captured.tools.length, 1);
  assert.equal(captured.tools[0].name, 'memory');
});

test('the snapshot context renders enabled global and project memory with ids', async () => {
  const { home, project } = fixture();
  const captured = mount(home, project);
  const tool = captured.tools[0];
  const exec = { agent: { session: {} } };
  await tool.execute({ action: 'add', scope: 'global', text: 'Prefers zh-TW replies' }, exec);
  await tool.execute({ action: 'add', scope: 'project', text: 'Tests run with npm test' }, exec);

  const text = captured.contexts[0].text({ agent: { session: {} } });
  assert.match(text, /<user-memory>/);
  assert.match(text, /Global memory \(all sessions\):/);
  assert.match(text, /Prefers zh-TW replies/);
  assert.match(text, new RegExp(`Project memory for ${project.replaceAll('\\', '\\\\')}`));
  assert.match(text, /Tests run with npm test/);
  assert.match(text, /- \[m_[a-z0-9_]+\]/);

  // Disabling an entry removes it from the snapshot without deleting it.
  const listed = await tool.execute({ action: 'list', scope: 'global' }, exec);
  await tool.execute({ action: 'update', scope: 'global', id: listed.memories[0].id, enabled: false }, exec);
  const after = captured.contexts[0].text({ agent: { session: {} } });
  assert.doesNotMatch(after, /Prefers zh-TW replies/);
  assert.match(after, /Tests run with npm test/);
});

test('the tool writes through the same files the HTTP route reads', async () => {
  const { home, project } = fixture();
  const captured = mount(home, project);
  const exec = { agent: { session: {} } };

  const value = await captured.tools[0].execute({ action: 'add', text: 'Use atomic writes' }, exec);
  assert.equal(value.ok, true);
  assert.equal(value.scope, 'project');

  const projectFile = join(project, '.dsh', 'memory.json');
  const stored = JSON.parse(readFileSync(projectFile, 'utf8'));
  assert.deepEqual(stored.memories.map((entry) => entry.text), ['Use atomic writes']);

  const state = await callHandler(captured.routes[0].handler, {
    url: `/dsh-agent-memory/state?scope=project&project=${encodeURIComponent(project)}`,
  });
  assert.equal(state.status, 200);
  assert.equal(state.json.memories[0].text, 'Use atomic writes');
});

test('the HTTP route supports GET state and POST mutations, and answers JSON errors', async () => {
  const { home, project } = fixture();
  const captured = mount(home, project);
  const handler = captured.routes[0].handler;

  const added = await callHandler(handler, {
    method: 'POST',
    url: '/dsh-agent-memory/add',
    body: JSON.stringify({ scope: 'global', text: 'from the settings page' }),
  });
  assert.equal(added.status, 200);
  assert.equal(added.json.ok, true);
  assert.equal(added.json.memories[0].text, 'from the settings page');
  const id = added.json.memory.id;

  const globalFile = join(home, 'memory', 'global.json');
  assert.equal(JSON.parse(readFileSync(globalFile, 'utf8')).memories.length, 1);

  const disabled = await callHandler(handler, {
    method: 'POST',
    url: '/dsh-agent-memory/update',
    body: JSON.stringify({ scope: 'global', id, enabled: false }),
  });
  assert.equal(disabled.json.memory.enabled, false);

  const removed = await callHandler(handler, {
    method: 'POST',
    url: '/dsh-agent-memory/remove',
    body: JSON.stringify({ scope: 'global', id }),
  });
  assert.equal(removed.json.ok, true);

  const notFound = await callHandler(handler, { url: '/dsh-agent-memory/nope' });
  assert.equal(notFound.status, 404);

  const wrongMethod = await callHandler(handler, {
    method: 'POST',
    url: '/dsh-agent-memory/state',
    body: '{}',
  });
  assert.equal(wrongMethod.status, 400);
  assert.match(wrongMethod.json.error, /not allowed/);

  const badProject = await callHandler(handler, {
    url: '/dsh-agent-memory/state?scope=project',
  });
  assert.equal(badProject.status, 400);
});

test('project-scoped requests register the project for the settings picker', async () => {
  const { home, project } = fixture();
  const captured = mount(home, project);
  await captured.tools[0].execute({ action: 'add', text: 'project fact' }, { agent: { session: {} } });
  const projects = await callHandler(captured.routes[0].handler, { url: '/dsh-agent-memory/projects' });
  assert.equal(projects.status, 200);
  assert.equal(projects.json.projects.some((row) => row.path === project && row.count === 1), true);
  assert.match(projects.json.globalFile, /global\.json$/);
});

test('the registered tool definition is registry-ready', () => {
  const { home, project } = fixture();
  const captured = mount(home, project);
  const tool = captured.tools[0];
  assert.equal(tool.parameters.type, 'object');
  assert.deepEqual(tool.parameters.required, ['action']);
  assert.equal(typeof tool.output.render, 'function');
  assert.equal(typeof tool.execute, 'function');
  assert.equal(typeof tool.presentCall, 'function');
  // The executor validates the canonical value against this schema.
  assert.equal(tool.output.schema.type, 'object');
  assert.deepEqual(tool.output.schema.required, ['ok', 'action', 'total', 'memories']);
});
