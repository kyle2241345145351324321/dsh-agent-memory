# dsh-agent-memory — design and internal contract

Durable, user-visible memory for DeepSeek Harness agents.

- **Global memory** — facts about the person that apply everywhere (language, tone, preferences, standing
  instructions). Stored in the harness home, follows every session and every workspace.
- **Project memory** — facts about one workspace (conventions, architecture decisions, commands that work,
  gotchas). Stored inside the workspace so it can be read, edited, reviewed, and committed by hand.
- **Agent writes through a tool.** A `memory` tool lets the model add / list / search / update / remove
  entries. The system prompt explains when saving is worthwhile and how to avoid duplicates.
- **The user owns the list.** Settings → Memory shows every entry with edit, disable, delete, search, and
  manual add. Nothing is hidden from the user.

## Files on disk

| Scope | Path |
| --- | --- |
| Global | `$DSH_HOME/memory/global.json` (default `~/.dsh/memory/global.json`) |
| Project | `<session cwd>/.dsh/memory.json` |
| Project index | `$DSH_HOME/memory/projects.json` (known project paths, recorded when a session touches project memory) |

All three are plain UTF-8 JSON with a stable shape:

```json
{
  "version": 1,
  "memories": [
    {
      "id": "m_1720000000000_ab12cd",
      "text": "User prefers replies in Traditional Chinese (zh-TW).",
      "enabled": true,
      "source": "agent",
      "createdAt": "2026-11-11T16:00:00.000Z",
      "updatedAt": "2026-11-11T16:00:00.000Z"
    }
  ]
}
```

- `source` is `"agent"` or `"user"`; `enabled: false` keeps an entry but stops it from reaching the prompt.
- Writes are atomic (same-directory temp file + rename) and serialized per file by an in-process queue.
- Files are re-read with an mtime+size cache, so hand edits show up without a restart.

## Host → prompt

1. Static system-prompt section `memory:instructions` (order 700) explains the tool, when to save, what never
   to save (secrets), how to choose a scope, and how to deduplicate.
2. Dynamic prompt context `memory:snapshot` (order 300, required) renders the enabled global entries plus the
   enabled entries of the session's current working directory. Entries keep their ids so the agent can update
   or remove them. The provider is evaluated at each assembly, so edits apply on the next request.

## HTTP API (client half → `/dsh-agent-memory`)

Same-origin JSON. Every response is `200` with `{ "ok": true, ... }` or `4xx/5xx` with `{ "ok": false, "error": "..." }`.

| Method | Path | Body / query | Response |
| --- | --- | --- | --- |
| GET | `/state?scope=global` | — | `{ok, scope:"global", file, memories, counts:{total,enabled}}` |
| GET | `/state?scope=project&project=<abs>` | — | `{ok, scope:"project", project, file, memories, counts}` |
| GET | `/projects` | — | `{ok, home, globalFile, projects:[{path, lastSeenAt, count}]}` |
| POST | `/add` | `{scope, project?, text}` | `{ok, memory, memories}` |
| POST | `/update` | `{scope, project?, id, text?, enabled?}` | `{ok, memory, memories}` |
| POST | `/remove` | `{scope, project?, id}` | `{ok, memories}` |
| POST | `/touch-project` | `{project}` | `{ok, projects}` |

`scope` is `global` or `project`. For project requests `project` must be an absolute existing directory; the
plugin records it in the project index so the UI can list it later.

## `memory` tool

```
action: "add" | "list" | "search" | "update" | "remove"
text?: string        add/update content
id?: string          update/remove target (ids appear in the prompt snapshot and list results)
scope?: "global" | "project"   default "project"
query?: string       search
enabled?: boolean    update
```

Returns canonical JSON: `{ ok, scope, memories: [{id, text, enabled, source, createdAt, updatedAt}], total }`.

## Client UI

A `settings.section` page (id `dsh-agent-memory`, order 70, label from locale) titled **Memory**.

- Two tabs: **Global** and **Project**.
- Global tab: add box, search box, list of entries (enable checkbox, inline edit, delete, source badge,
  relative time). Shows the file path.
- Project tab: project picker (from `/projects`, plus a manual absolute-path input to open another project),
  then the same editor for that project.
- Copy at the top states plainly that the agent saves these and the user can edit or delete them.
- Bilingual `en` + `zh` dictionaries, registered through `ctx.locale`.
- No build step: hand-authored `window.__ModuleLoader__.load({id, factory})` bundle served from
  `/plugins/dsh-agent-memory/client.js`, exactly like `dsh-kickbacks` in this repo.
