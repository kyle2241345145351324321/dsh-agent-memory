# Changelog

All notable changes to `@kyle2241345145351324321/dsh-agent-memory` are
documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the package follows [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-12

First public release.

### Added

- Global memory (`$DSH_HOME/memory/global.json`) and per-project memory
  (`<workspace>/.dsh/memory.json`), both plain hand-editable JSON.
- Agent-facing `memory` tool (`add` / `list` / `search` / `update` / `remove`)
  with scope selection and duplicate-text folding.
- System-prompt instructions plus a dynamic memory snapshot context injected on
  every request (entries keep their ids so the agent can update or remove them).
- Settings → Memory page: Global and Project tabs, add, search, inline edit,
  enable/disable, delete, project picker, storage path, en + zh dictionaries.
- Atomic serialized writes, mtime-cached reads, a project index for the picker,
  and a prompt character budget that omits entries with an explicit note.
- 40 Node-only tests covering the store, memory rules, prompt rendering, HTTP
  contract, tool definition, host wiring, and the client bundle contract.

[0.1.0]: https://github.com/kyle2241345145351324321/dsh-agent-memory/releases/tag/v0.1.0
