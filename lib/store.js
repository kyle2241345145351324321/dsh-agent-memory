/**
 * dsh-agent-memory — file store.
 *
 * Three plain JSON documents, all hand-editable:
 *   - `$DSH_HOME/memory/global.json`   — memory about the user, every session
 *   - `<project>/.dsh/memory.json`     — memory about one workspace
 *   - `$DSH_HOME/memory/projects.json` — which project files exist (for the UI)
 *
 * The store is intentionally dependency-free (node builtins only) so the plugin
 * resolves from a profile's own `node_modules` with no build step, exactly like
 * every other out-of-tree DSH plugin.
 *
 * Every write is atomic (same-directory temp file + rename) and serialized per
 * file, so the agent tool, the Settings page, and a hand edit in an editor cannot
 * interleave into a torn file. Reads are cached on mtime + size, which is what
 * lets a hand edit show up in the prompt without a restart.
 *
 * @module dsh-agent-memory/store
 */
import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { homedir } from 'node:os';

/** The harness home directory, honoring `$DSH_HOME` like every other DSH consumer. */
export function resolveHome(environment = process.env) {
  const configured = typeof environment.DSH_HOME === 'string' ? environment.DSH_HOME.trim() : '';
  return resolve(configured.length > 0 ? configured : join(homedir(), '.dsh'));
}

/** Directory name a project uses for its own harness data. */
export const PROJECT_DIR_NAME = '.dsh';
/** File name of one memory document inside its directory. */
export const MEMORY_FILE_NAME = 'memory.json';
/** Current document shape version. */
export const DOCUMENT_VERSION = 1;

/** One empty memory document, always freshly created (callers may mutate it). */
function emptyDocument() {
  return { version: DOCUMENT_VERSION, memories: [] };
}

/**
 * Coerce stored JSON into the memory shape the rest of the plugin relies on.
 * Unknown fields are dropped; a missing or invalid `memories` array is empty.
 * A parse/shape failure is reported through `error` (not thrown) so callers can
 * surface it rather than silently treating the file as empty.
 * @param raw - parsed JSON value, or undefined when the file is absent.
 * @param file - absolute path, used in the error message.
 * @returns a normalized memory document.
 */
export function normalizeDocument(raw, file = 'memory file') {
  if (raw === undefined || raw === null) return emptyDocument();
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...emptyDocument(), error: `${file} is not a JSON object` };
  }
  const memories = Array.isArray(raw.memories) ? raw.memories : [];
  return {
    version: Number.isInteger(raw.version) ? raw.version : DOCUMENT_VERSION,
    memories: memories.map(normalizeMemory).filter((entry) => entry !== undefined),
  };
}

/**
 * Normalize one stored entry. Entries without usable text or an id are dropped:
 * an entry the model cannot cite or the UI cannot edit is not a memory.
 * @param raw - one element of the `memories` array.
 * @returns a normalized entry, or undefined when the entry is unusable.
 */
export function normalizeMemory(raw) {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const text = typeof raw.text === 'string' ? raw.text.trim() : '';
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (text.length === 0 || id.length === 0) return undefined;
  const createdAt = validIso(raw.createdAt) ? raw.createdAt : new Date(0).toISOString();
  const updatedAt = validIso(raw.updatedAt) ? raw.updatedAt : createdAt;
  return {
    id,
    text,
    enabled: raw.enabled !== false,
    source: raw.source === 'user' ? 'user' : 'agent',
    createdAt,
    updatedAt,
  };
}

/** Whether a value is an ISO-8601 timestamp JSON round-trips unchanged. */
export function validIso(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

/** Mint a stable, sortable, collision-resistant entry id. */
export function mintId(now = Date.now()) {
  return `m_${now.toString(36)}_${randomBytes(3).toString('hex')}`;
}

/**
 * Create the document store.
 * @param options - `home` overrides the harness home (tests), `now` overrides the
 *   clock (tests), `maxEntries` / `maxEntryChars` bound one document.
 * @returns the store's file paths and document operations.
 */
export function createStore(options = {}) {
  const home = resolve(options.home ?? resolveHome());
  const now = typeof options.now === 'function' ? options.now : () => new Date().toISOString();
  const quota = {
    maxEntries: positive(options.maxEntries, 200),
    maxEntryChars: positive(options.maxEntryChars, 2000),
  };

  /** path → { mtimeMs, size, raw } cache shared by sync and async readers. */
  const cache = new Map();
  /** path → promise of the most recent queued write, so writes serialize. */
  const queues = new Map();

  const globalFile = join(home, 'memory', 'global.json');
  const indexFile = join(home, 'memory', 'projects.json');
  const projectFile = (project) => join(resolve(project), PROJECT_DIR_NAME, MEMORY_FILE_NAME);

  /**
   * Parse a JSON body without throwing.
   * @returns `{ value }` on success, `{ error }` otherwise.
   */
  function parse(text, file) {
    try {
      return { value: JSON.parse(text) };
    } catch (error) {
      return { error: `${file} is not valid JSON: ${error.message}` };
    }
  }

  /** Read one raw JSON file synchronously through the cache. */
  function readRawSync(file) {
    const info = statSync(file, { throwIfNoEntry: false });
    if (info === undefined) {
      cache.delete(file);
      return { value: undefined, file };
    }
    const cached = cache.get(file);
    if (cached !== undefined && cached.mtimeMs === info.mtimeMs && cached.size === info.size) {
      return { ...cached.parsed, file };
    }
    const parsed = parse(readFileSync(file, 'utf8'), file);
    cache.set(file, { mtimeMs: info.mtimeMs, size: info.size, parsed });
    return { ...parsed, file };
  }

  /**
   * Write one raw JSON value atomically, then refresh the cache entry.
   * @param file - absolute path.
   * @param value - JSON-serializable document.
   */
  function writeRawSync(file, value) {
    mkdirSync(dirname(file), { recursive: true });
    const temporary = `${file}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
    const body = `${JSON.stringify(value, undefined, 2)}\n`;
    try {
      writeFileSync(temporary, body, 'utf8');
      renameSync(temporary, file);
    } catch (error) {
      try { unlinkSync(temporary); } catch { /* the temp file never existed */ }
      throw error;
    }
    const info = statSync(file);
    cache.set(file, { mtimeMs: info.mtimeMs, size: info.size, parsed: { value } });
  }

  /**
   * Serialize one read-modify-write per file.
   * @param file - absolute path.
   * @param mutator - receives the freshly read raw value (undefined when the file
   *   is absent); its return value is passed back to the caller. Throwing aborts
   *   without writing.
   * @returns the mutator's result.
   */
  function updateRaw(file, mutator) {
    const previous = queues.get(file) ?? Promise.resolve();
    const run = previous.then(() => {
      const loaded = readRawSync(file);
      if (loaded.error !== undefined) throw new Error(loaded.error);
      const next = mutator(loaded.value);
      writeRawSync(file, next.value);
      return next.result;
    });
    // Keep the queue alive after a rejected operation: the next writer still runs.
    queues.set(file, run.then(() => undefined, () => undefined));
    return run;
  }

  /**
   * Read one memory document.
   * @param file - absolute path.
   * @returns normalized memory document with `file`.
   */
  function readDocument(file) {
    const loaded = readRawSync(file);
    if (loaded.error !== undefined) return { ...emptyDocument(), file, error: loaded.error };
    return { ...normalizeDocument(loaded.value, file), file };
  }

  /**
   * Apply one mutation to a memory document.
   * @param file - absolute path.
   * @param mutator - receives the normalized document; returns the caller's value.
   * @returns the mutator's result.
   */
  function updateDocument(file, mutator) {
    return updateRaw(file, (raw) => {
      const doc = normalizeDocument(raw, file);
      const result = mutator(doc);
      return { value: { version: DOCUMENT_VERSION, memories: doc.memories }, result };
    }).then((result) => result);
  }

  /**
   * Register one project directory in the index so the Settings page can list it.
   * @param project - absolute project directory.
   * @returns the normalized project path.
   */
  async function touchProject(project) {
    const path = resolve(project);
    if (!isAbsolute(project)) throw new Error(`project path must be absolute: ${project}`);
    const info = statSync(path, { throwIfNoEntry: false });
    if (info === undefined || !info.isDirectory()) throw new Error(`project directory does not exist: ${path}`);
    await updateRaw(indexFile, (raw) => {
      const projects = Array.isArray(raw?.projects) ? raw.projects.filter((entry) => typeof entry?.path === 'string') : [];
      const stamp = now();
      const existing = projects.find((entry) => entry.path === path);
      if (existing === undefined) projects.push({ path, lastSeenAt: stamp });
      else existing.lastSeenAt = stamp;
      // Newest first is the useful order for a picker.
      projects.sort((left, right) => String(right.lastSeenAt).localeCompare(String(left.lastSeenAt)));
      return { value: { version: DOCUMENT_VERSION, projects }, result: path };
    });
    return path;
  }

  /**
   * List every project the plugin knows about, with the number of memories each
   * file currently holds. A project whose directory or file disappeared is kept
   * in the index (the UI can still report it) and flagged `exists: false`.
   * @returns project rows, newest activity first.
   */
  async function projects() {
    const loaded = readRawSync(indexFile);
    const rows = loaded.error === undefined && Array.isArray(loaded.value?.projects) ? loaded.value.projects : [];
    const result = [];
    for (const row of rows) {
      if (typeof row?.path !== 'string' || row.path.length === 0) continue;
      const file = projectFile(row.path);
      const doc = readDocument(file);
      result.push({
        path: row.path,
        lastSeenAt: validIso(row.lastSeenAt) ? row.lastSeenAt : undefined,
        file,
        exists: statSync(row.path, { throwIfNoEntry: false })?.isDirectory() === true,
        count: doc.memories.length,
        enabled: doc.memories.filter((entry) => entry.enabled).length,
        error: doc.error,
      });
    }
    return result;
  }

  return {
    home,
    now,
    quota,
    globalFile: () => globalFile,
    indexFile: () => indexFile,
    projectFile,
    readDocument,
    updateDocument,
    touchProject,
    projects,
  };
}

/** Coerce a positive integer option. */
function positive(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
