/**
 * dsh-agent-memory — the host half.
 *
 * Durable memory for DSH agents, in two scopes: global memory about the user
 * (`$DSH_HOME/memory/global.json`) and per-project memory living inside the
 * workspace (`<cwd>/.dsh/memory.json`). The agent reads it through a system-prompt
 * context and writes it through the `memory` tool; the user sees and edits every
 * entry in Settings → Memory, served by this plugin's same-origin routes.
 *
 * Dependency-free by design: node builtins and relative imports only, like every
 * other out-of-tree DSH plugin, so it resolves from a profile without a build.
 *
 * @module dsh-agent-memory
 */
import { createStore } from './store.js';
import { createMemory } from './memory.js';
import { createMemoryHandler, BASE_PATH } from './routes.js';
import { DEFAULT_MAX_PROMPT_CHARS, MEMORY_INSTRUCTIONS, renderMemorySnapshot } from './render.js';

/** Cordis plugin name; also the client bundle id served at /plugins/dsh-agent-memory/client.js. */
export const name = 'dsh-agent-memory';

/** Services this plugin needs: the tool registry and the prompt registry. */
export const inject = ['tools', 'systemPrompt'];

/** Prompt placements: a stable instructions section plus a dynamic snapshot context. */
const INSTRUCTIONS_SECTION = 'memory:instructions';
const SNAPSHOT_CONTEXT = 'memory:snapshot';
/** Order slots that are not centrally allocated; both sit clear of first-party ones. */
const INSTRUCTIONS_ORDER = 700;
const SNAPSHOT_ORDER = 300;

/** The model-facing tool name. */
const TOOL_NAME = 'memory';

/** The canonical actions, matching the tool's parameter enum. */
const ACTIONS = Object.freeze(['add', 'list', 'search', 'update', 'remove']);

/** Full tool description: how to save well, not just how to call the API. */
const TOOL_DESCRIPTION = `Read and write the user's durable memory. Entries survive across conversations and are visible/editable by the user in Settings → Memory.

- add: save one durable fact. scope "global" for stable facts and preferences about the user; scope "project" (default) for facts about this workspace (conventions, decisions, commands, gotchas). One short self-contained sentence per entry.
- list: read existing entries, optionally filtered by scope.
- search: find entries containing a phrase.
- update: change an entry's text or enabled flag by id.
- remove: delete an entry by id.

Save when the user states a durable preference, corrects you in a lasting way, shares personal context, or when a future session in this workspace would need the fact. Never save transient task state, restatements of the request, or secrets/credentials. Check list/search first and update instead of duplicating.`;

/** The tool's JSON schema, authored directly (this plugin has no schema helper). */
const TOOL_PARAMETERS = {
  type: 'object',
  additionalProperties: false,
  properties: {
    action: {
      type: 'string',
      enum: [...ACTIONS],
      description: 'add | list | search | update | remove',
    },
    text: {
      type: 'string',
      description: 'The memory text for add/update: one short, self-contained sentence.',
    },
    id: {
      type: 'string',
      description: 'Target entry id for update/remove (ids appear in list results and in the memory context).',
    },
    scope: {
      type: 'string',
      enum: ['global', 'project'],
      description: 'global = facts about the user everywhere; project = facts about this workspace. Defaults to project inside a workspace, otherwise global.',
    },
    query: {
      type: 'string',
      description: 'Case-insensitive phrase filter for search.',
    },
    enabled: {
      type: 'boolean',
      description: 'For update: false keeps the entry but stops injecting it.',
    },
  },
  required: ['action'],
};

/** One entry as the tool returns it. */
const ENTRY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', description: 'Entry id.' },
    text: { type: 'string', description: 'Entry text.' },
    scope: { type: 'string', description: 'global | project' },
    enabled: { type: 'boolean', description: 'Whether the entry is injected into the prompt.' },
    source: { type: 'string', description: 'agent | user' },
    createdAt: { type: 'string', description: 'ISO timestamp.' },
    updatedAt: { type: 'string', description: 'ISO timestamp.' },
  },
  required: ['id', 'text', 'scope', 'enabled', 'source', 'createdAt', 'updatedAt'],
};

/** The tool's canonical output schema (validated by the executor). */
const TOOL_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', description: 'Whether the action succeeded.' },
    action: { type: 'string', description: 'The action that ran.' },
    scope: { type: 'string', description: 'Scope the action wrote to, when it wrote one.' },
    total: { type: 'number', description: 'Entries visible after the action.' },
    memory: { ...ENTRY_SCHEMA, description: 'The created/updated/removed entry, when the action changed one.' },
    memories: {
      type: 'array',
      items: ENTRY_SCHEMA,
      description: 'Every request-visible entry after the action, with scope tags.',
    },
  },
  required: ['ok', 'action', 'total', 'memories'],
};

/**
 * Normalize the loader row's config.
 * @param config - raw loader config.
 * @returns resolved options with defaults.
 */
function resolveOptions(config) {
  const raw = config !== null && typeof config === 'object' ? config : {};
  const number = (value, fallback) => (Number.isInteger(value) && value > 0 ? value : fallback);
  return {
    home: typeof raw.home === 'string' && raw.home.trim().length > 0 ? raw.home.trim() : undefined,
    maxPromptChars: number(raw.maxPromptChars, DEFAULT_MAX_PROMPT_CHARS),
    maxEntries: number(raw.maxEntries, 200),
    maxEntryChars: number(raw.maxEntryChars, 2000),
  };
}

/**
 * Render one entry for the model's tool result text.
 * @param entry - entry with a scope tag.
 * @returns one line.
 */
function entryLine(entry) {
  const flag = entry.enabled ? '' : ' [disabled]';
  return `[${entry.scope}/${entry.id}] ${entry.text}${flag}`;
}

/**
 * Render the tool's model-facing content from its canonical value.
 * @param value - the declared output value.
 * @returns content blocks.
 */
function renderToolResult(value) {
  const header = value.action === 'list' || value.action === 'search'
    ? `${value.total} ${value.total === 1 ? 'memory' : 'memories'}:`
    : value.action === 'add'
      ? `Saved to ${value.scope} memory. ${value.total} ${value.total === 1 ? 'entry' : 'entries'} now visible.`
      : value.action === 'update'
        ? `Updated ${value.memory?.id ?? 'entry'} in ${value.scope} memory.`
        : `Removed ${value.memory?.id ?? 'entry'} from ${value.scope} memory.`;
  const lines = [header];
  if (Array.isArray(value.memories)) for (const entry of value.memories) lines.push(`- ${entryLine(entry)}`);
  if (value.action === 'list' && value.total === 0) lines.push('(no memories saved yet)');
  return [{ type: 'text', text: lines.join('\n') }];
}

/**
 * Present the pending call in the UI.
 * @param args - parsed tool arguments.
 * @returns a generic card describing the action.
 */
function presentCall(args) {
  const action = typeof args?.action === 'string' ? args.action : 'memory';
  if (action === 'add' && typeof args?.text === 'string') {
    const text = args.text.length > 80 ? `${args.text.slice(0, 77)}…` : args.text;
    return { card: 'generic', title: `Remember: ${text}`, kind: 'other' };
  }
  return { card: 'generic', title: `Memory: ${action}`, kind: 'other' };
}

/**
 * Build the registry-ready `memory` tool.
 * @param options - `memory` operations and a `projectOf` resolver.
 * @returns the tool definition.
 */
export function createMemoryTool({ memory, projectOf }) {
  return {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    parameters: TOOL_PARAMETERS,
    output: {
      schema: TOOL_OUTPUT_SCHEMA,
      render: (_args, value) => renderToolResult(value),
      presentationMeta: (_args, value) => {
        // Presentation meta must be lossless JSON: no `undefined` fields, so a
        // key that does not apply to this action is omitted rather than unset.
        const meta = {
          action: String(value.action),
          total: Number.isFinite(value.total) ? value.total : 0,
          preview: Array.isArray(value.memories) ? value.memories.slice(0, 4).map((entry) => String(entry.text)) : [],
        };
        if (typeof value.scope === 'string') meta.scope = value.scope;
        return meta;
      },
    },
    presentCall,
    presentResult(_args, result) {
      if (result.isError) return undefined;
      const meta = result.meta !== null && typeof result.meta === 'object' ? result.meta : {};
      const count = typeof meta.total === 'number' ? meta.total : 0;
      const title = meta.action === 'add'
        ? 'Memory saved'
        : meta.action === 'remove'
          ? 'Memory removed'
          : `${count} ${count === 1 ? 'memory' : 'memories'}`;
      const preview = Array.isArray(meta.preview) && meta.preview.length > 0
        ? [{ type: 'text', text: meta.preview.map((text) => `- ${text}`).join('\n') }]
        : undefined;
      return { card: 'generic', title, ...(preview === undefined ? {} : { content: preview }) };
    },
    async execute(args, exec) {
      const project = projectOf(exec.agent);
      const fallbackScope = project === undefined ? 'global' : 'project';
      const action = args.action;
      const scope = args.scope ?? fallbackScope;

      const collect = (filterScope) => {
        const listed = memory.listEverywhere({ project, query: undefined });
        const rows = listed.rows.filter((entry) => filterScope === undefined || entry.scope === filterScope);
        return rows;
      };

      if (action === 'list') {
        const rows = collect(args.scope);
        return { ok: true, action, total: rows.length, memories: rows.map(toWire) };
      }

      if (action === 'search') {
        if (typeof args.query !== 'string' || args.query.trim().length === 0) throw new Error('search requires a query');
        const rows = collect(args.scope);
        const query = args.query.trim().toLowerCase();
        const matches = rows.filter((entry) => entry.text.toLowerCase().includes(query));
        return { ok: true, action, total: matches.length, memories: matches.map(toWire) };
      }

      if (action === 'add') {
        const result = await memory.add({ scope, project, text: args.text, source: 'agent' });
        return { ok: true, action, scope, total: collect().length, memory: toWire({ ...result.memory, scope }), memories: collect().map(toWire) };
      }

      if (action === 'update') {
        const result = await memory.update({ scope, project, id: args.id, text: args.text, enabled: args.enabled });
        return { ok: true, action, scope, total: collect().length, memory: toWire({ ...result.memory, scope }), memories: collect().map(toWire) };
      }

      if (action === 'remove') {
        const result = await memory.remove({ scope, project, id: args.id });
        return { ok: true, action, scope, total: collect().length, memory: toWire({ ...result.memory, scope }), memories: collect().map(toWire) };
      }

      throw new Error(`unknown action ${JSON.stringify(action)}; use ${ACTIONS.join(', ')}`);
    },
  };
}

/**
 * Strip internal fields and tag an entry with its scope for wire output.
 * @param entry - stored entry plus `scope`.
 * @returns a plain JSON entry.
 */
function toWire(entry) {
  return {
    id: entry.id,
    text: entry.text,
    scope: entry.scope,
    enabled: entry.enabled,
    source: entry.source,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

/**
 * Mount the memory plugin.
 * @param ctx - the cordis host context.
 * @param config - optional loader-row overrides (`home`, `maxPromptChars`,
 *   `maxEntries`, `maxEntryChars`).
 */
export function apply(ctx, config = {}) {
  const options = resolveOptions(config);
  const store = createStore({ home: options.home, maxEntries: options.maxEntries, maxEntryChars: options.maxEntryChars });
  const memory = createMemory({ store, limits: options });

  /**
   * Resolve the project directory for one live agent.
   * An unavailable working-directory service degrades to global-only memory
   * instead of failing the plugin.
   * @param agent - the calling agent, when there is one.
   * @returns the absolute working directory, or undefined.
   */
  const projectOf = (agent) => {
    if (agent === undefined) return undefined;
    try {
      const service = ctx.get('workingDirectory');
      if (service === undefined) return undefined;
      const directory = service.get(agent.session);
      return typeof directory === 'string' && directory.length > 0 ? directory : undefined;
    } catch {
      return undefined;
    }
  };

  // 1. Static instructions: stable text, kept in the cached prompt prefix.
  ctx.effect(() => ctx.systemPrompt.section({
    name: INSTRUCTIONS_SECTION,
    order: INSTRUCTIONS_ORDER,
    text: MEMORY_INSTRUCTIONS,
  }), 'dsh-agent-memory: instructions');

  // 2. Dynamic snapshot: evaluated at assembly and at each request admission, so
  //    a Settings edit reaches the next request without a restart.
  ctx.effect(() => ctx.systemPrompt.context({
    name: SNAPSHOT_CONTEXT,
    order: SNAPSHOT_ORDER,
    required: true,
    text: (assembly) => {
      try {
        return renderMemorySnapshot(memory.snapshot(projectOf(assembly?.agent)), options.maxPromptChars);
      } catch {
        return '';
      }
    },
  }), 'dsh-agent-memory: snapshot');

  // 3. The agent's write path.
  const tool = createMemoryTool({ memory, projectOf });
  ctx.effect(() => ctx.tools.register(tool), 'dsh-agent-memory: tool');

  // 4. The user's edit path. Only the browser surface has a web server; a
  //    headless/TUI profile mounts the tool and the prompt without routes.
  ctx.inject(['webServer'], (host) => {
    host.effect(() => {
      const handler = createMemoryHandler({ memory, log: ctx.logger });
      const dispose = host.webServer.register({ kind: 'prefix', path: BASE_PATH, handler });
      ctx.logger?.info?.('dsh-agent-memory: serving %s (global: %s)', BASE_PATH, store.globalFile());
      return dispose;
    }, 'dsh-agent-memory: http routes');
  });
}

export { BASE_PATH, renderMemorySnapshot, MEMORY_INSTRUCTIONS };
