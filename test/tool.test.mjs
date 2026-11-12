/**
 * Tool-definition tests: the model-facing contract, the schema subset the
 * registry accepts, and the action dispatch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../lib/store.js';
import { createMemory } from '../lib/memory.js';
import { createMemoryTool } from '../lib/index.js';

/** One tool bound to one temp project. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-agent-memory-tool-'));
  const project = join(root, 'project');
  mkdirSync(project, { recursive: true });
  const store = createStore({ home: join(root, 'home') });
  const memory = createMemory({ store });
  const tool = createMemoryTool({ memory, projectOf: () => project });
  const exec = { agent: {} };
  return { root, project, memory, tool, exec };
}

/**
 * Walk a schema and assert it belongs to the registry's supported subset:
 * `required` is always an array of declared property names, never a boolean.
 * @param schema - schema node.
 * @param path - diagnostic path.
 */
function assertSupportedSchema(schema, path = 'schema') {
  assert.equal(typeof schema, 'object');
  if (Object.hasOwn(schema, 'required')) {
    assert.ok(Array.isArray(schema.required), `${path}.required must be an array`);
    for (const key of schema.required) assert.ok(Object.hasOwn(schema.properties ?? {}, key), `${path}.required names unknown property ${key}`);
  }
  for (const [key, child] of Object.entries(schema.properties ?? {})) assertSupportedSchema(child, `${path}.properties.${key}`);
  if (schema.items !== undefined) assertSupportedSchema(schema.items, `${path}.items`);
}

test('the parameters and output schemas use the registry-supported subset', () => {
  const { tool } = fixture();
  assertSupportedSchema(tool.parameters);
  assertSupportedSchema(tool.output.schema);
  assert.equal(tool.parameters.type, 'object');
  assert.deepEqual(tool.parameters.required, ['action']);
  assert.deepEqual(tool.parameters.properties.action.enum, ['add', 'list', 'search', 'update', 'remove']);
  assert.equal(typeof tool.output.render, 'function');
});

test('add defaults to project scope when a working directory is known', async () => {
  const { tool, exec } = fixture();
  const value = await tool.execute({ action: 'add', text: 'Run tests with pnpm test.' }, exec);
  assert.equal(value.ok, true);
  assert.equal(value.action, 'add');
  assert.equal(value.scope, 'project');
  assert.equal(value.memory.scope, 'project');
  assert.equal(value.total, 1);
  assert.equal(value.memories[0].text, 'Run tests with pnpm test.');
});

test('add defaults to global scope when no working directory is known', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-agent-memory-tool-'));
  const store = createStore({ home: join(root, 'home') });
  const tool = createMemoryTool({ memory: createMemory({ store }), projectOf: () => undefined });
  const value = await tool.execute({ action: 'add', text: 'Prefers zh-TW.' }, {});
  assert.equal(value.scope, 'global');
  assert.equal(value.memory.scope, 'global');
});

test('list, search, update and remove work on the declared ids', async () => {
  const { tool, exec } = fixture();
  const first = await tool.execute({ action: 'add', text: 'Prefers dark mode', scope: 'global' }, exec);
  await tool.execute({ action: 'add', text: 'Build with pnpm', scope: 'global' }, exec);

  const listed = await tool.execute({ action: 'list' }, exec);
  assert.equal(listed.total, 2);

  const searched = await tool.execute({ action: 'search', query: 'DARK' }, exec);
  assert.equal(searched.total, 1);
  assert.equal(searched.memories[0].id, first.memory.id);

  const updated = await tool.execute({ action: 'update', id: first.memory.id, text: 'Prefers light mode', scope: 'global' }, exec);
  assert.equal(updated.memory.text, 'Prefers light mode');

  const removed = await tool.execute({ action: 'remove', id: first.memory.id, scope: 'global' }, exec);
  assert.equal(removed.memory.id, first.memory.id);
  assert.equal(removed.total, 1);
});

test('search without a query and unknown actions fail with a readable message', async () => {
  const { tool, exec } = fixture();
  await assert.rejects(() => tool.execute({ action: 'search' }, exec), /requires a query/);
  await assert.rejects(() => tool.execute({ action: 'sing' }, exec), /unknown action/);
});

test('presentation metadata is lossless JSON for every action shape', async () => {
  const { tool, exec } = fixture();
  const added = await tool.execute({ action: 'add', text: 'Prefers short answers' }, exec);
  const listed = await tool.execute({ action: 'list' }, exec);
  const searched = await tool.execute({ action: 'search', query: 'short' }, exec);
  for (const value of [added, listed, searched]) {
    const meta = tool.output.presentationMeta({}, value);
    // The executor rejects non-lossless JSON (undefined fields), so round-trip
    // equality is the contract this projection must satisfy.
    assert.deepEqual(JSON.parse(JSON.stringify(meta)), meta);
    assert.equal(typeof meta.action, 'string');
    assert.equal(typeof meta.total, 'number');
    assert.ok(Array.isArray(meta.preview));
  }
});

test('model-facing content is text and the UI card describes the action', async () => {
  const { tool, exec } = fixture();
  const value = await tool.execute({ action: 'add', text: 'Prefers concise replies' }, exec);
  const content = tool.output.render({}, value);
  assert.equal(content[0].type, 'text');
  assert.match(content[0].text, /Saved to project memory/);
  assert.match(content[0].text, /Prefers concise replies/);

  const callView = tool.presentCall({ action: 'add', text: 'Prefers concise replies' });
  assert.equal(callView.card, 'generic');
  assert.match(callView.title, /^Remember: /);

  const meta = tool.output.presentationMeta({}, value);
  const resultView = tool.presentResult({}, { isError: false, content, meta });
  assert.equal(resultView.card, 'generic');
  assert.equal(resultView.title, 'Memory saved');
  assert.equal(tool.presentResult({}, { isError: true, content, meta }), undefined);
});
