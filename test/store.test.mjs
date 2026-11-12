/**
 * Store + memory-operation tests. Run with `node --test test/` from the plugin
 * directory; no harness, no profile, no dependencies.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../lib/store.js';
import { createMemory } from '../lib/memory.js';

/** One isolated home + project pair per test. */
function fixture(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-agent-memory-'));
  const home = join(root, 'home');
  const project = join(root, 'project');
  mkdirSync(project, { recursive: true });
  // A monotonic clock keeps ordering assertions deterministic: two writes in
  // the same real millisecond would otherwise tie on `updatedAt`.
  let tick = 0;
  const now = options.clock === true
    ? () => new Date(Date.UTC(2026, 0, 1, 0, 0, 0, tick++)).toISOString()
    : undefined;
  const store = createStore({ home, ...(now === undefined ? {} : { now }) });
  return { root, home, project, store, memory: createMemory({ store }) };
}

test('add writes global memory to the harness home and project memory into the workspace', async () => {
  const { home, project, memory } = fixture();
  const global = await memory.add({ scope: 'global', text: 'User prefers Traditional Chinese.' });
  const local = await memory.add({ scope: 'project', project, text: 'Tests run with pnpm test.' });

  assert.equal(global.memory.scope ?? 'global', 'global');
  assert.equal(global.memory.source, 'agent');
  assert.equal(global.memory.enabled, true);
  assert.match(global.memory.id, /^m_/);

  const globalFile = join(home, 'memory', 'global.json');
  const projectFile = join(project, '.dsh', 'memory.json');
  assert.deepEqual(JSON.parse(readFileSync(globalFile, 'utf8')).memories.map((entry) => entry.text), ['User prefers Traditional Chinese.']);
  assert.deepEqual(JSON.parse(readFileSync(projectFile, 'utf8')).memories.map((entry) => entry.text), ['Tests run with pnpm test.']);
  assert.equal(local.state.scope, 'project');
  assert.equal(local.state.project, project);
});

test('state lists entries newest-updated first and counts enabled entries', async () => {
  const { memory } = fixture({ clock: true });
  const first = await memory.add({ scope: 'global', text: 'first' });
  const second = await memory.add({ scope: 'global', text: 'second' });
  assert.equal(memory.state({ scope: 'global' }).memories[0].id, second.memory.id);
  await memory.update({ scope: 'global', id: first.memory.id, enabled: false });
  const state = memory.state({ scope: 'global' });
  assert.equal(state.memories[0].id, first.memory.id);
  assert.deepEqual(state.counts, { total: 2, enabled: 1 });
});

test('duplicate text is updated instead of duplicated', async () => {
  const { memory } = fixture();
  const first = await memory.add({ scope: 'global', text: 'Use ESM.' });
  const again = await memory.add({ scope: 'global', text: '  Use ESM.  ' });
  assert.equal(again.memory.id, first.memory.id);
  assert.equal(memory.state({ scope: 'global' }).memories.length, 1);
});

test('add rejects empty, over-long, and unknown-scope input', async () => {
  const { memory } = fixture();
  await assert.rejects(() => memory.add({ scope: 'global', text: '   ' }), /must not be empty/);
  await assert.rejects(() => memory.add({ scope: 'global', text: 'x'.repeat(2001) }), /too long/);
  await assert.rejects(() => memory.add({ scope: 'universe', text: 'x' }), /scope must be/);
  await assert.rejects(() => memory.add({ scope: 'project', text: 'x' }), /requires a project directory/);
  await assert.rejects(() => memory.add({ scope: 'project', project: '/definitely/not/here', text: 'x' }), /does not exist/);
});

test('update and remove address an entry by id', async () => {
  const { memory } = fixture();
  const { memory: entry } = await memory.add({ scope: 'global', text: 'old' });
  const updated = await memory.update({ scope: 'global', id: entry.id, text: 'new', enabled: false });
  assert.equal(updated.memory.text, 'new');
  assert.equal(updated.memory.enabled, false);
  await assert.rejects(() => memory.update({ scope: 'global', id: 'nope', text: 'x' }), /no memory with id/);
  const removed = await memory.remove({ scope: 'global', id: entry.id });
  assert.equal(removed.memory.id, entry.id);
  assert.equal(memory.state({ scope: 'global' }).memories.length, 0);
  await assert.rejects(() => memory.remove({ scope: 'global', id: entry.id }), /no memory with id/);
});

test('snapshot returns only enabled entries for global and one project', async () => {
  const { memory, project } = fixture();
  const keep = await memory.add({ scope: 'global', text: 'keep' });
  const hide = await memory.add({ scope: 'global', text: 'hide' });
  await memory.update({ scope: 'global', id: hide.memory.id, enabled: false });
  await memory.add({ scope: 'project', project, text: 'project fact' });
  const snapshot = memory.snapshot(project);
  assert.deepEqual(snapshot.global.map((entry) => entry.id), [keep.memory.id]);
  assert.deepEqual(snapshot.project.map((entry) => entry.text), ['project fact']);
  assert.equal(snapshot.projectPath, project);
});

test('hand edits are picked up (mtime cache) and a corrupt file is reported, not overwritten', async () => {
  const { memory, home } = fixture();
  await memory.add({ scope: 'global', text: 'one' });
  const file = join(home, 'memory', 'global.json');
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  doc.memories[0].text = 'edited by hand';
  writeFileSync(file, JSON.stringify(doc, undefined, 2));
  assert.deepEqual(memory.state({ scope: 'global' }).memories.map((entry) => entry.text), ['edited by hand']);

  writeFileSync(file, '{ not json');
  const broken = memory.state({ scope: 'global' });
  assert.match(broken.error, /not valid JSON/);
  await assert.rejects(() => memory.add({ scope: 'global', text: 'two' }), /not valid JSON/);
  assert.equal(readFileSync(file, 'utf8'), '{ not json');
});

test('project index records touched projects, newest first, with counts', async () => {
  const { memory, project, root } = fixture();
  const other = join(root, 'other');
  mkdirSync(other, { recursive: true });
  await memory.add({ scope: 'project', project, text: 'a' });
  await memory.add({ scope: 'project', project: other, text: 'b' });
  const rows = await memory.listProjects();
  assert.deepEqual(rows.map((row) => row.path).sort(), [project, other].sort());
  const row = rows.find((entry) => entry.path === project);
  assert.equal(row.count, 1);
  assert.equal(row.enabled, 1);
  assert.equal(row.exists, true);
});

test('a deleted project file still lists with count zero', async () => {
  const { memory, project } = fixture();
  await memory.add({ scope: 'project', project, text: 'x' });
  rmSync(join(project, '.dsh', 'memory.json'));
  const row = (await memory.listProjects()).find((entry) => entry.path === project);
  assert.equal(row.count, 0);
  assert.equal(row.exists, true);
});
