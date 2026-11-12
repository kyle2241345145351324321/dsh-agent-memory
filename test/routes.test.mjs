/**
 * HTTP-surface tests: the Settings page's contract, exercised through
 * `dispatchMemoryRequest` — the exact function the node handler calls.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../lib/store.js';
import { createMemory } from '../lib/memory.js';
import { dispatchMemoryRequest, BASE_PATH } from '../lib/routes.js';

/** One isolated memory surface with a readable request helper. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-agent-memory-routes-'));
  const project = join(root, 'project');
  mkdirSync(project, { recursive: true });
  const store = createStore({ home: join(root, 'home') });
  const memory = createMemory({ store });
  const call = async (method, path, body) => {
    const url = new URL(`http://dsh.test${BASE_PATH}${path}`);
    return dispatchMemoryRequest({ memory }, {
      method,
      url,
      bodyText: body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body),
    });
  };
  return {
    root,
    project,
    memory,
    get: (path) => call('GET', path),
    post: (path, body) => call('POST', path, body),
  };
}

test('GET /state returns the global document with counts and its file path', async () => {
  const { get, memory } = fixture();
  await memory.add({ scope: 'global', text: 'hello' });
  const { status, payload } = await get('/state?scope=global');
  assert.equal(status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.scope, 'global');
  assert.match(payload.file, /global\.json$/);
  assert.deepEqual(payload.counts, { total: 1, enabled: 1 });
  assert.equal(payload.memories[0].text, 'hello');
});

test('POST /add, /update and /remove mutate through the same path the UI uses', async () => {
  const { get, post } = fixture();
  const added = await post('/add', { scope: 'global', text: 'from the page' });
  assert.equal(added.status, 200);
  assert.equal(added.payload.memory.source, 'user');
  const id = added.payload.memory.id;

  const updated = await post('/update', { scope: 'global', id, enabled: false });
  assert.equal(updated.payload.memory.enabled, false);
  assert.equal(updated.payload.counts.enabled, 0);

  const removed = await post('/remove', { scope: 'global', id });
  assert.equal(removed.payload.removed.id, id);
  const state = await get('/state?scope=global');
  assert.equal(state.payload.memories.length, 0);
});

test('a project write registers the project and GET /projects reports it', async () => {
  const { project, get, post } = fixture();
  const added = await post('/add', { scope: 'project', project, text: 'project fact' });
  assert.equal(added.payload.ok, true);
  assert.equal(added.payload.project, project);

  const touched = await post('/touch-project', { project });
  assert.equal(touched.payload.ok, true);
  assert.equal(touched.payload.projects.some((row) => row.path === project && row.count === 1), true);

  const projects = await get('/projects');
  assert.equal(projects.payload.ok, true);
  assert.match(projects.payload.globalFile, /global\.json$/);
  assert.equal(projects.payload.projects.some((row) => row.path === project && row.enabled === 1), true);
});

test('bad requests answer ok:false instead of throwing', async () => {
  const { get, post } = fixture();
  const missing = await get('/state?scope=project');
  assert.equal(missing.status, 400);
  assert.equal(missing.payload.ok, false);

  assert.equal((await get('/state?scope=nope')).status, 400);

  const malformed = await post('/add', '{ not json');
  assert.equal(malformed.status, 400);
  assert.match(malformed.payload.error, /not valid JSON/);

  const notObject = await post('/add', '["nope"]');
  assert.equal(notObject.status, 400);
  assert.match(notObject.payload.error, /must be a JSON object/);

  const emptyText = await post('/add', { scope: 'global', text: '   ' });
  assert.equal(emptyText.payload.ok, false);
});

test('unknown routes are 404 and wrong methods are reported', async () => {
  const { get, post } = fixture();
  assert.equal((await get('/nope')).status, 404);
  const wrongMethod = await post('/state', {});
  assert.equal(wrongMethod.status, 400);
  assert.match(wrongMethod.payload.error, /not allowed/);
});

test('the dispatcher ignores a foreign path prefix', async () => {
  const { memory } = fixture();
  const result = await dispatchMemoryRequest({ memory }, {
    method: 'GET',
    url: new URL('http://dsh.test/other/state?scope=global'),
  });
  assert.equal(result.status, 404);
});
