/**
 * dsh-agent-memory — memory operations.
 *
 * The one place that validates a memory mutation, so the agent tool and the
 * Settings page cannot drift: both call these methods, both get the same errors,
 * the same limits, and the same canonical entry shape back.
 *
 * @module dsh-agent-memory/memory
 */
import { statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { mintId } from './store.js';

/** The two scopes a memory can live in. */
export const SCOPES = Object.freeze(['global', 'project']);

/** The sources a memory can come from. */
export const SOURCES = Object.freeze(['agent', 'user']);

/**
 * Coerce a requested scope.
 * @param scope - caller-supplied scope; omitted means `project`.
 * @returns `"global"` or `"project"`.
 * @throws when the scope is not one of {@link SCOPES}.
 */
export function readScope(scope) {
  const value = scope ?? 'project';
  if (value !== 'global' && value !== 'project') {
    throw new Error(`scope must be "global" or "project" (got ${JSON.stringify(scope)})`);
  }
  return value;
}

/**
 * Validate one memory text: trimmed, non-empty, bounded.
 * @param text - caller-supplied text.
 * @param maxChars - maximum length in characters.
 * @returns the trimmed text.
 * @throws when the text is missing, empty, or too long.
 */
export function readText(text, maxChars) {
  if (typeof text !== 'string') throw new Error('text is required and must be a string');
  const trimmed = text.trim();
  if (trimmed.length === 0) throw new Error('text must not be empty');
  if (trimmed.length > maxChars) throw new Error(`text is too long (${trimmed.length} > ${maxChars} characters)`);
  return trimmed;
}

/**
 * Build the memory operations over one store.
 * @param options - `store` (required) and `limits` (`maxEntries`, `maxEntryChars`).
 * @returns validated read/write operations for both scopes.
 */
export function createMemory({ store, limits = {} }) {
  const maxEntries = Number.isInteger(limits.maxEntries) && limits.maxEntries > 0 ? limits.maxEntries : store.quota.maxEntries;
  const maxEntryChars = Number.isInteger(limits.maxEntryChars) && limits.maxEntryChars > 0 ? limits.maxEntryChars : store.quota.maxEntryChars;

  /**
   * Resolve the document one scope writes to.
   * @param input - `{scope, project}`; `project` is required for project scope and
   *   must be an absolute path to an existing directory.
   * @returns the scope, canonical project path (when project), and file.
   */
  function locate(input = {}) {
    const scope = readScope(input.scope);
    if (scope === 'global') return { scope, project: undefined, file: store.globalFile() };
    if (typeof input.project !== 'string' || input.project.trim().length === 0) {
      throw new Error('project scope requires a project directory path');
    }
    const project = resolve(input.project.trim());
    if (!isAbsolute(input.project.trim())) throw new Error(`project path must be absolute: ${input.project}`);
    const info = statSync(project, { throwIfNoEntry: false });
    if (info === undefined || !info.isDirectory()) throw new Error(`project directory does not exist: ${project}`);
    return { scope, project, file: store.projectFile(project) };
  }

  /**
   * Read one scope's memories, newest activity first for display.
   * @param input - `{scope, project}`.
   * @returns scope state: file, memories, counts, and any file parse error.
   */
  function state(input = {}) {
    const { scope, project, file } = locate(input);
    const doc = store.readDocument(file);
    return {
      scope,
      ...(project === undefined ? {} : { project }),
      file,
      memories: sortForDisplay(doc.memories),
      counts: countMemories(doc.memories),
      ...(doc.error === undefined ? {} : { error: doc.error }),
    };
  }

  /**
   * Add one memory.
   * @param input - `{scope, project, text, source}`.
   * @returns the created memory and the scope's new state.
   */
  async function add(input = {}) {
    const { scope, project, file } = locate(input);
    const text = readText(input.text, maxEntryChars);
    const source = SOURCES.includes(input.source) ? input.source : 'agent';
    const stamp = store.now();
    const created = await store.updateDocument(file, (doc) => {
      if (doc.memories.length >= maxEntries) throw new Error(`memory file is full (${maxEntries} entries); remove or merge entries first`);
      const duplicate = doc.memories.find((entry) => entry.text.toLowerCase() === text.toLowerCase());
      if (duplicate !== undefined) {
        // Saving the same sentence twice is a mistake, not a request for two
        // copies: return the existing entry and refresh its timestamp instead.
        duplicate.updatedAt = stamp;
        return { ...duplicate };
      }
      const entry = { id: mintId(Date.parse(stamp) || Date.now()), text, enabled: true, source, createdAt: stamp, updatedAt: stamp };
      doc.memories.push(entry);
      return { ...entry };
    });
    if (project !== undefined) await store.touchProject(project);
    return { memory: created, state: state({ scope, project }) };
  }

  /**
   * Update one memory's text and/or enabled flag.
   * @param input - `{scope, project, id, text?, enabled?}`.
   * @returns the updated memory and the scope's new state.
   */
  async function update(input = {}) {
    const { scope, project, file } = locate(input);
    const id = typeof input.id === 'string' ? input.id.trim() : '';
    if (id.length === 0) throw new Error('id is required');
    if (input.text === undefined && input.enabled === undefined) throw new Error('nothing to update: pass text and/or enabled');
    const text = input.text === undefined ? undefined : readText(input.text, maxEntryChars);
    if (input.enabled !== undefined && typeof input.enabled !== 'boolean') throw new Error('enabled must be a boolean');
    const stamp = store.now();
    const updated = await store.updateDocument(file, (doc) => {
      const entry = doc.memories.find((candidate) => candidate.id === id);
      if (entry === undefined) throw new Error(`no memory with id ${id}`);
      if (text !== undefined) entry.text = text;
      if (input.enabled !== undefined) entry.enabled = input.enabled;
      entry.updatedAt = stamp;
      return { ...entry };
    });
    if (project !== undefined) await store.touchProject(project);
    return { memory: updated, state: state({ scope, project }) };
  }

  /**
   * Remove one memory.
   * @param input - `{scope, project, id}`.
   * @returns the removed entry and the scope's new state.
   */
  async function remove(input = {}) {
    const { scope, project, file } = locate(input);
    const id = typeof input.id === 'string' ? input.id.trim() : '';
    if (id.length === 0) throw new Error('id is required');
    const removed = await store.updateDocument(file, (doc) => {
      const index = doc.memories.findIndex((candidate) => candidate.id === id);
      if (index < 0) throw new Error(`no memory with id ${id}`);
      const [entry] = doc.memories.splice(index, 1);
      return { ...entry };
    });
    if (project !== undefined) await store.touchProject(project);
    return { memory: removed, state: state({ scope, project }) };
  }

  /**
   * Read every scope at once, for the model tool's `list` and `search` actions.
   * @param options - `project` (the session cwd), optional `query` filter.
   * @returns combined rows carrying their own scope, plus per-scope totals.
   */
  function listEverywhere(options = {}) {
    const rows = [];
    const addScope = (scope, project) => {
      const loaded = state({ scope, project });
      for (const entry of loaded.memories) rows.push({ ...entry, scope });
      return loaded;
    };
    const global = addScope('global');
    const project = options.project === undefined ? undefined : addScope('project', options.project);
    const query = typeof options.query === 'string' ? options.query.trim().toLowerCase() : '';
    const filtered = query.length === 0
      ? rows
      : rows.filter((entry) => entry.text.toLowerCase().includes(query));
    return { rows: filtered, global, project };
  }

  /**
   * Read the enabled memories that belong in one session's prompt.
   *
   * Never throws: a broken file means that scope contributes nothing this turn,
   * because a memory plugin that breaks the prompt is worse than no memory.
   * @param project - the session's current working directory, when known.
   * @returns enabled global entries, enabled project entries, and the project path.
   */
  function snapshot(project) {
    const readEnabled = (file) => {
      try {
        return store.readDocument(file).memories.filter((entry) => entry.enabled);
      } catch {
        return [];
      }
    };
    const global = readEnabled(store.globalFile());
    const projectEntries = project === undefined ? [] : readEnabled(store.projectFile(project));
    return { global, project: projectEntries, projectPath: project };
  }

  /** The harness home the two files live under. */
  const home = store.home;
  /** The global document path, shown in the UI. */
  const globalFile = store.globalFile();
  /** Register a project for the picker without writing a memory. */
  const touch = (project) => store.touchProject(project);
  /** Every project the plugin knows about. */
  const listProjects = () => store.projects();

  return {
    home,
    globalFile,
    locate,
    state,
    add,
    update,
    remove,
    listEverywhere,
    snapshot,
    touch,
    listProjects,
    limits: { maxEntries, maxEntryChars },
  };
}

/** Display order: newest update first, so a just-saved entry is at the top. */
function sortForDisplay(memories) {
  return [...memories].sort((left, right) => {
    const leftAt = Date.parse(left.updatedAt);
    const rightAt = Date.parse(right.updatedAt);
    if (Number.isFinite(leftAt) && Number.isFinite(rightAt) && leftAt !== rightAt) return rightAt - leftAt;
    return String(left.id).localeCompare(String(right.id));
  });
}

/** Counts the UI shows next to each tab. */
function countMemories(memories) {
  return { total: memories.length, enabled: memories.filter((entry) => entry.enabled).length };
}
