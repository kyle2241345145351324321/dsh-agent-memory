/**
 * dsh-agent-memory — the browser half.
 *
 * Hand-written client bundle: DSH serves this file verbatim from
 * /plugins/dsh-agent-memory/client.js, so it is authored as the
 * `window.__ModuleLoader__.load({ id, factory })` registration the module
 * system expects rather than built by a bundler. Only `react` is required from
 * the module table; everything else is a same-origin fetch to the host half.
 *
 * The page is the user-facing half of DESIGN.md: the host owns the JSON files
 * and validates every write, this file lists them and sends one mutation at a
 * time. After every mutation the visible list comes from the response's
 * canonical `memories` array — never from a local guess — so a hand edit or a
 * rejected write can never leave the page lying about what is stored.
 */
window.__ModuleLoader__.load({
  id: 'dsh-agent-memory',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    const react = require('react');

    /** Dictionary namespace and route base, both owned by this plugin. */
    const NS = 'dsh-agent-memory';
    const BASE = '/dsh-agent-memory';

    /**
     * Dictionaries use the locale package's `{name}` placeholders; `t(key)` is
     * the bound translator that interpolates `t(key, params)`.
     */
    const en = {
      nav: 'Memory',
      title: 'Memory',
      intro: 'The agent saves memories as it works: durable facts about you, and notes about each project. They are plain text files on your machine, and you can edit, disable, or delete any of them here.',
      globalTab: 'Global',
      projectTab: 'Project',
      emptyGlobalTitle: 'No global memories yet',
      emptyGlobalBody: 'When the agent learns something that applies everywhere — language, tone, standing preferences — it saves it here. You can also add one above.',
      emptyProjectTitle: 'No project memories yet',
      emptyProjectBody: 'When the agent learns something about this workspace — conventions, commands, gotchas — it saves it here. You can also add one above.',
      noSearchTitle: 'No matches',
      noSearchResults: 'No memory matches “{query}”.',
      projectPickHint: 'Pick a project to see the memories saved for it, or open one by its absolute path.',
      addLabel: 'Add a memory',
      addPlaceholder: 'Something the agent should remember…',
      addButton: 'Add',
      adding: 'Adding…',
      searchLabel: 'Search memories',
      searchPlaceholder: 'Search text…',
      fileLabel: 'Storage file',
      sourceAgent: 'Agent',
      sourceUser: 'User',
      sourceUnknown: 'Unknown',
      enableEntry: 'Enable memory',
      disabledTag: 'Disabled',
      edit: 'Edit',
      editLabel: 'Memory text',
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      deleteConfirm: 'Delete this memory? This cannot be undone.',
      emptyText: '(empty)',
      updatedLabel: 'Updated',
      loading: 'Loading…',
      loadFailed: 'Could not load memories.',
      retry: 'Retry',
      errorPrefix: 'Request failed: {detail}',
      pathRequired: 'Enter an absolute directory path first.',
      projectLabel: 'Project',
      projectPlaceholder: 'Select a project…',
      pathLabel: 'Open by absolute path',
      pathPlaceholder: '/absolute/path/to/workspace',
      open: 'Open',
      opening: 'Opening…',
      countMemoryOne: '{n} memory',
      countMemoryMany: '{n} memories',
      countEnabled: '{n} enabled',
      filteredCount: 'Filtered: showing {shown} of {total}',
      timeJustNow: 'just now',
      timeMinuteOne: '{n} minute ago',
      timeMinutes: '{n} minutes ago',
      timeHourOne: '{n} hour ago',
      timeHours: '{n} hours ago',
      timeDayOne: '{n} day ago',
      timeDays: '{n} days ago',
      timeWeekOne: '{n} week ago',
      timeWeeks: '{n} weeks ago',
      timeDate: '{value}',
      timeUnknown: 'unknown time',
    };

    const zh = {
      nav: '記憶',
      title: '記憶',
      intro: '智慧體會在運作時儲存記憶：關於你的長期資訊，以及各專案的筆記。這些都是你電腦上的純文字檔案，你可以在此編輯、停用或刪除任何一則。',
      globalTab: '全域',
      projectTab: '專案',
      emptyGlobalTitle: '尚無全域記憶',
      emptyGlobalBody: '當智慧體學到適用於所有情境的事——語言、語氣、長期偏好——就會存到這裡。你也可以在上方手動新增。',
      emptyProjectTitle: '尚無專案記憶',
      emptyProjectBody: '當智慧體學到關於此工作區的事——慣例、指令、容易踩的坑——就會存到這裡。你也可以在上方手動新增。',
      noSearchTitle: '沒有符合的記憶',
      noSearchResults: '沒有符合「{query}」的記憶。',
      projectPickHint: '選擇一個專案以查看為它儲存的記憶，或直接以絕對路徑開啟。',
      addLabel: '新增記憶',
      addPlaceholder: '希望智慧體記住的事…',
      addButton: '新增',
      adding: '新增中…',
      searchLabel: '搜尋記憶',
      searchPlaceholder: '搜尋內容…',
      fileLabel: '儲存檔案',
      sourceAgent: '智慧體',
      sourceUser: '使用者',
      sourceUnknown: '未知',
      enableEntry: '啟用記憶',
      disabledTag: '已停用',
      edit: '編輯',
      editLabel: '記憶內容',
      save: '儲存',
      cancel: '取消',
      delete: '刪除',
      deleteConfirm: '確定要刪除這則記憶嗎？此操作無法復原。',
      emptyText: '（空白）',
      updatedLabel: '更新於',
      loading: '載入中…',
      loadFailed: '無法載入記憶。',
      retry: '重試',
      errorPrefix: '請求失敗：{detail}',
      pathRequired: '請先輸入絕對資料夾路徑。',
      projectLabel: '專案',
      projectPlaceholder: '選擇專案…',
      pathLabel: '以絕對路徑開啟',
      pathPlaceholder: '/工作區的絕對路徑',
      open: '開啟',
      opening: '開啟中…',
      countMemoryOne: '{n} 則記憶',
      countMemoryMany: '{n} 則記憶',
      countEnabled: '{n} 則已啟用',
      filteredCount: '已篩選：顯示 {shown}／{total} 則',
      timeJustNow: '剛剛',
      timeMinuteOne: '{n} 分鐘前',
      timeMinutes: '{n} 分鐘前',
      timeHourOne: '{n} 小時前',
      timeHours: '{n} 小時前',
      timeDayOne: '{n} 天前',
      timeDays: '{n} 天前',
      timeWeekOne: '{n} 週前',
      timeWeeks: '{n} 週前',
      timeDate: '{value}',
      timeUnknown: '時間未知',
    };

    /**
     * Scoped page styles. Everything paints from the harness alias variables so
     * the page follows light and dark themes without a local palette. The
     * visual weight is deliberately low: a plain list, one accent for the
     * selected tab / primary action / focus ring, and hairlines for structure.
     */
    const CSS = `
.dsh-mem-panel{display:flex;flex-direction:column;gap:14px;font-size:13px;line-height:19px;
  color:var(--dsw-alias-label-primary);max-width:780px}
.dsh-mem-title{font-size:15px;font-weight:600;margin:0}
.dsh-mem-intro{margin:0;color:var(--dsw-alias-label-secondary);line-height:20px}
.dsh-mem-tabs{display:flex;gap:2px;border-bottom:1px solid var(--dsw-alias-border-l1);margin:0}
.dsh-mem-tab{font:inherit;font-size:13px;line-height:18px;padding:6px 11px;margin-bottom:-1px;
  border:none;border-bottom:2px solid transparent;border-radius:6px 6px 0 0;cursor:pointer;
  background:transparent;color:var(--dsw-alias-label-secondary)}
.dsh-mem-tab:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsh-mem-tab[aria-selected="true"]{color:var(--dsw-alias-label-primary);font-weight:600;
  border-bottom-color:var(--dsw-alias-state-business-primary)}
.dsh-mem-tab:focus-visible,.dsh-mem-btn:focus-visible,.dsh-mem-input:focus-visible,
.dsh-mem-textarea:focus-visible,.dsh-mem-select:focus-visible,.dsh-mem-check:focus-visible{
  outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.dsh-mem-panelBody{display:flex;flex-direction:column;gap:12px;min-width:0}
.dsh-mem-panelBody[hidden]{display:none}
.dsh-mem-editor{display:flex;flex-direction:column;gap:10px;min-width:0}
.dsh-mem-editorBody{display:flex;flex-direction:column;gap:10px;min-width:0}
.dsh-mem-field{display:flex;flex-direction:column;gap:5px;min-width:0}
.dsh-mem-label{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.dsh-mem-textarea,.dsh-mem-input,.dsh-mem-select{font:inherit;font-size:13px;line-height:19px;
  border:1px solid var(--dsw-alias-border-l2);border-radius:8px;
  background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-sizing:border-box}
.dsh-mem-textarea{width:100%;min-height:52px;padding:7px 9px;resize:vertical}
.dsh-mem-input{height:30px;padding:0 9px;width:100%}
.dsh-mem-select{height:30px;padding:0 8px;max-width:100%}
.dsh-mem-textarea::placeholder,.dsh-mem-input::placeholder{color:var(--dsw-alias-label-secondary)}
.dsh-mem-formActions{display:flex;justify-content:flex-end;gap:8px}
.dsh-mem-btn{font:inherit;font-size:12px;line-height:16px;cursor:pointer;border-radius:8px;
  padding:5px 11px;border:1px solid var(--dsw-alias-border-l2);
  background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);white-space:nowrap}
.dsh-mem-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dsh-mem-btn:disabled{opacity:.55;cursor:not-allowed}
.dsh-mem-btnPrimary{background:var(--dsw-alias-button-primary-fill);border-color:transparent;
  color:var(--dsw-alias-label-primary-foreground)}
.dsh-mem-btnPrimary:hover:not(:disabled){background:var(--dsw-alias-button-primary-fill);opacity:.9}
.dsh-mem-btnDanger{color:var(--dsw-alias-state-error-primary);
  border-color:var(--dsw-alias-state-error-primary)}
.dsh-mem-btnDanger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dsh-mem-counts{margin:0;font-size:12px;color:var(--dsw-alias-label-secondary)}
.dsh-mem-list{list-style:none;margin:0;padding:0;border:1px solid var(--dsw-alias-border-l1);
  border-radius:10px;overflow:hidden;background:var(--dsw-alias-bg-layer-1)}
.dsh-mem-row{display:flex;align-items:flex-start;gap:9px;padding:9px 11px;
  border-bottom:.5px solid var(--dsw-alias-border-l1)}
.dsh-mem-row:last-child{border-bottom:none}
.dsh-mem-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-mem-check{margin:2px 0 0;flex:none;width:15px;height:15px;cursor:pointer;
  accent-color:var(--dsw-alias-state-business-primary)}
.dsh-mem-check:disabled{cursor:not-allowed}
.dsh-mem-rowBody{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.dsh-mem-inline{display:flex;flex-direction:column;gap:6px;min-width:0}
.dsh-mem-inline .dsh-mem-textarea{min-height:60px}
.dsh-mem-text{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.dsh-mem-textOff{color:var(--dsw-alias-label-secondary)}
.dsh-mem-meta{display:flex;align-items:center;gap:7px;flex-wrap:wrap;font-size:11px;
  line-height:16px;color:var(--dsw-alias-label-secondary)}
.dsh-mem-badge{font-size:10px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;
  padding:0 5px;border-radius:4px;border:1px solid var(--dsw-alias-border-l2);
  background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary)}
.dsh-mem-badge[data-source="user"]{border-color:var(--dsw-alias-state-business-primary);
  color:var(--dsw-alias-label-primary)}
.dsh-mem-offTag{font-size:10px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;
  padding:0 5px;border-radius:4px;border:1px dashed var(--dsw-alias-border-l2);
  color:var(--dsw-alias-label-secondary)}
.dsh-mem-time{font-variant-numeric:tabular-nums}
.dsh-mem-rowActions{flex:none;display:flex;gap:6px;align-items:flex-start}
.dsh-mem-empty{border:1px dashed var(--dsw-alias-border-l2);border-radius:10px;padding:12px 14px;
  background:var(--dsw-alias-bg-layer-2);display:flex;flex-direction:column;gap:3px}
.dsh-mem-emptyTitle{margin:0;font-weight:600;color:var(--dsw-alias-label-primary)}
.dsh-mem-emptyBody{margin:0;color:var(--dsw-alias-label-secondary);line-height:19px}
.dsh-mem-note{margin:0;color:var(--dsw-alias-label-secondary)}
.dsh-mem-error{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary)}
.dsh-mem-inlineError{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dsh-mem-file{margin:2px 0 0;font-size:11px;line-height:16px;
  color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.dsh-mem-fileLabel{font-weight:600}
.dsh-mem-file code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}
.dsh-mem-picker{display:flex;flex-direction:column;gap:9px}
.dsh-mem-pathRow{display:flex;gap:8px;align-items:center}
.dsh-mem-pathRow .dsh-mem-input{flex:1;min-width:0}
.dsh-mem-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
  clip:rect(0 0 0 0);white-space:nowrap;border:0}
`;

    /** Inject the stylesheet once per document. */
    if (typeof document !== 'undefined' && document.querySelector('style[data-plugin="' + NS + '"]') === null) {
      const tag = document.createElement('style');
      tag.dataset.plugin = NS;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    /**
     * Same-origin JSON call against the host half.
     *
     * The host contract is "200 + {ok:true}" or "4xx/5xx + {ok:false,error}",
     * so both the status and the body can carry the failure. A body that is
     * not JSON is treated as a transport error rather than crashing the page.
     *
     * @param path - route path below BASE.
     * @param init - optional fetch init; a non-string body is serialized to JSON.
     * @returns the parsed JSON payload.
     */
    async function api(path, init) {
      const options = { headers: {}, ...(init ?? {}) };
      if (options.body !== undefined && typeof options.body !== 'string') {
        options.headers['content-type'] = 'application/json';
        options.body = JSON.stringify(options.body);
      }
      const response = await fetch(BASE + path, options);
      const text = await response.text();
      let payload = {};
      if (text.length > 0) {
        try {
          payload = JSON.parse(text);
        } catch {
          throw new Error(`${path} returned invalid JSON (${response.status})`);
        }
      }
      if (!response.ok || payload.ok === false) {
        throw new Error(
          typeof payload.error === 'string' && payload.error.length > 0
            ? payload.error
            : `${path} failed (${response.status})`,
        );
      }
      return payload;
    }

    /** Normalize any thrown value into a display string. */
    function messageOf(cause) {
      return cause instanceof Error ? cause.message : String(cause);
    }

    /** One memory's enabled flag; an omitted flag means enabled (DESIGN.md). */
    function isEnabled(entry) {
      return entry !== null && typeof entry === 'object' && entry.enabled !== false;
    }

    /**
     * Merge any host payload into the page's state shape.
     *
     * GET /state responses carry `file` and `counts`; POST responses carry only
     * `{memory, memories}`. Missing pieces are carried over from the previous
     * state, and when a mutation returns `memories` the counts are recomputed
     * from that canonical list rather than kept stale.
     */
    function stateFrom(raw, previous) {
      const payload = raw !== null && typeof raw === 'object' ? raw : {};
      const hasMemories = Array.isArray(payload.memories);
      const memories = hasMemories
        ? payload.memories
        : (previous !== null && previous !== undefined && Array.isArray(previous.memories) ? previous.memories : []);

      let counts;
      if (payload.counts !== null && typeof payload.counts === 'object') {
        counts = {
          total: Number.isInteger(payload.counts.total) ? payload.counts.total : memories.length,
          enabled: Number.isInteger(payload.counts.enabled)
            ? payload.counts.enabled
            : memories.filter(isEnabled).length,
        };
      } else if (hasMemories || previous === null || previous === undefined) {
        counts = { total: memories.length, enabled: memories.filter(isEnabled).length };
      } else {
        counts = previous.counts ?? { total: memories.length, enabled: memories.filter(isEnabled).length };
      }

      return {
        scope: typeof payload.scope === 'string' ? payload.scope : (previous?.scope ?? null),
        project: typeof payload.project === 'string' ? payload.project : (previous?.project ?? null),
        file: typeof payload.file === 'string' ? payload.file : (previous?.file ?? null),
        memories,
        counts,
      };
    }

    /** Readable count: singular and plural are distinct templates. */
    function memoryCount(t, count) {
      const parsed = Number(count);
      const n = Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
      return t(n === 1 ? 'countMemoryOne' : 'countMemoryMany', { n });
    }

    /** Absolute timestamp for the tooltip, or null when the value is unusable. */
    function absoluteTime(value) {
      const then = Date.parse(typeof value === 'string' ? value : '');
      return Number.isFinite(then) ? new Date(then).toLocaleString() : null;
    }

    /**
     * Relative update time, falling back to an absolute date for older entries
     * and to "unknown time" for a malformed timestamp.
     */
    function timeAgo(t, value) {
      const then = Date.parse(typeof value === 'string' ? value : '');
      if (!Number.isFinite(then)) return t('timeUnknown');
      const diff = Math.max(0, Date.now() - then);
      const minute = 60 * 1000;
      const hour = 60 * minute;
      const day = 24 * hour;
      const week = 7 * day;
      if (diff < 45 * 1000) return t('timeJustNow');
      if (diff < hour) {
        const n = Math.max(1, Math.floor(diff / minute));
        return t(n === 1 ? 'timeMinuteOne' : 'timeMinutes', { n });
      }
      if (diff < day) {
        const n = Math.floor(diff / hour);
        return t(n === 1 ? 'timeHourOne' : 'timeHours', { n });
      }
      if (diff < week) {
        const n = Math.floor(diff / day);
        return t(n === 1 ? 'timeDayOne' : 'timeDays', { n });
      }
      if (diff < 4 * week) {
        const n = Math.floor(diff / week);
        return t(n === 1 ? 'timeWeekOne' : 'timeWeeks', { n });
      }
      return t('timeDate', { value: new Date(then).toLocaleDateString() });
    }

    /**
     * One memory row: enable toggle, text (inline editable), source badge,
     * update time, and delete. While editing, Save/Cancel replace Edit/Delete
     * and Escape cancels without firing a request.
     */
    function MemoryRow({ t, entry, index, scope, busyKey, onUpdate, onRemove }) {
      const id = typeof entry?.id === 'string' && entry.id.length > 0 ? entry.id : null;
      const text = typeof entry?.text === 'string' ? entry.text : '';
      const enabled = entry?.enabled !== false;
      const source = entry?.source === 'user' ? 'user' : entry?.source === 'agent' ? 'agent' : 'unknown';
      const sourceLabel = source === 'user' ? t('sourceUser') : source === 'agent' ? t('sourceAgent') : t('sourceUnknown');
      // Mutations are single-flight across the whole page (see `busy` in
      // MemorySettings): a second write would otherwise race the first
      // response's canonical `memories` list back into stale state.
      const busy = busyKey !== null;

      const [editing, setEditing] = react.useState(false);
      const [draft, setDraft] = react.useState(text);

      // Keep the edit buffer in step with the server while the row is idle;
      // a pending edit is never overwritten under the user's cursor.
      react.useEffect(() => {
        if (!editing) setDraft(text);
      }, [text, editing]);

      const rowId = 'dsh-mem-row-' + scope + '-' + index;
      const toggleId = rowId + '-toggle';
      const editId = rowId + '-edit';
      const excerpt = text.replace(/\s+/g, ' ').trim().slice(0, 64);
      const updated = entry?.updatedAt;
      const absolute = absoluteTime(updated);

      const startEdit = () => {
        setDraft(text);
        setEditing(true);
      };
      const cancelEdit = () => {
        setDraft(text);
        setEditing(false);
      };
      const saveEdit = () => {
        const value = draft.trim();
        if (id === null || busy || value.length === 0) return;
        onUpdate(id, { text: value }).then((ok) => {
          if (ok) setEditing(false);
        });
      };
      const toggleEnabled = (event) => {
        if (id === null || busy) return;
        onUpdate(id, { enabled: event.target.checked });
      };
      const remove = () => {
        if (id === null || busy) return;
        if (typeof window !== 'undefined' && typeof window.confirm === 'function'
          && !window.confirm(t('deleteConfirm'))) return;
        onRemove(id);
      };
      const onEditKeyDown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          cancelEdit();
          return;
        }
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          saveEdit();
        }
      };

      return react.createElement('li', { className: 'dsh-mem-row' },
        react.createElement('input', {
          id: toggleId,
          type: 'checkbox',
          className: 'dsh-mem-check',
          checked: enabled,
          disabled: busy || id === null,
          onChange: toggleEnabled,
        }),
        // The row text is the label target: a real <label> gives the toggle an
        // accessible name even though the visible text is editable.
        react.createElement('label', { htmlFor: toggleId, className: 'dsh-mem-sr' },
          t('enableEntry') + ': ' + (excerpt.length > 0 ? excerpt : t('emptyText'))),

        react.createElement('div', { className: 'dsh-mem-rowBody' },
          editing
            ? react.createElement('div', { className: 'dsh-mem-inline' },
              react.createElement('label', { htmlFor: editId, className: 'dsh-mem-sr' }, t('editLabel')),
              react.createElement('textarea', {
                id: editId,
                className: 'dsh-mem-textarea',
                value: draft,
                rows: 3,
                autoFocus: true,
                disabled: busy,
                onChange: (event) => setDraft(event.target.value),
                onKeyDown: onEditKeyDown,
              }),
              react.createElement('div', { className: 'dsh-mem-formActions' },
                react.createElement('button', {
                  type: 'button',
                  className: 'dsh-mem-btn dsh-mem-btnPrimary',
                  onClick: saveEdit,
                  disabled: busy || draft.trim().length === 0,
                }, t('save')),
                react.createElement('button', {
                  type: 'button',
                  className: 'dsh-mem-btn',
                  onClick: cancelEdit,
                  disabled: busy,
                }, t('cancel'))))
            : react.createElement('p', {
              className: enabled ? 'dsh-mem-text' : 'dsh-mem-text dsh-mem-textOff',
            }, text.length > 0 ? text : t('emptyText')),

          react.createElement('div', { className: 'dsh-mem-meta' },
            react.createElement('span', { className: 'dsh-mem-badge', 'data-source': source }, sourceLabel),
            // Status is never carried by colour alone: disabled entries keep a
            // textual tag next to the muted text.
            enabled ? null : react.createElement('span', { className: 'dsh-mem-offTag' }, t('disabledTag')),
            react.createElement('time', {
              className: 'dsh-mem-time',
              dateTime: typeof updated === 'string' ? updated : undefined,
              title: absolute === null ? undefined : absolute,
            }, t('updatedLabel') + ' ' + timeAgo(t, updated)))),

        editing
          ? null
          : react.createElement('div', { className: 'dsh-mem-rowActions' },
            react.createElement('button', {
              type: 'button',
              className: 'dsh-mem-btn',
              onClick: startEdit,
              disabled: busy || id === null,
            }, t('edit')),
            react.createElement('button', {
              type: 'button',
              className: 'dsh-mem-btn dsh-mem-btnDanger',
              onClick: remove,
              disabled: busy || id === null,
            }, t('delete'))));
    }

    /**
     * The list editor for one scope: add box, search, rows, counts, and the
     * storage file path. The same component backs both tabs, so the Global and
     * Project surfaces cannot drift apart.
     */
    function MemoryList({ t, scope, data, loading, error, busyKey, onAdd, onUpdate, onRemove, onRetry }) {
      const [draft, setDraft] = react.useState('');
      const [query, setQuery] = react.useState('');
      const addId = 'dsh-mem-add-' + scope;
      const searchId = 'dsh-mem-search-' + scope;
      const adding = busyKey === 'add:' + scope;
      const blocked = busyKey !== null;

      if (data === null) {
        return react.createElement('div', { className: 'dsh-mem-editor' },
          loading
            ? react.createElement('p', { className: 'dsh-mem-note', role: 'status' }, t('loading'))
            : react.createElement('div', { className: 'dsh-mem-empty' },
              react.createElement('p', { className: 'dsh-mem-emptyTitle' }, t('loadFailed')),
              error === null
                ? null
                : react.createElement('p', { className: 'dsh-mem-error', role: 'alert' }, error.message),
              react.createElement('div', { className: 'dsh-mem-formActions' },
                react.createElement('button', {
                  type: 'button',
                  className: 'dsh-mem-btn',
                  onClick: onRetry,
                }, t('retry')))));
      }

      const memories = Array.isArray(data.memories) ? data.memories : [];
      const counts = data.counts !== null && typeof data.counts === 'object'
        ? data.counts
        : { total: memories.length, enabled: memories.filter(isEnabled).length };
      const needle = query.trim().toLowerCase();
      const visible = needle.length === 0
        ? memories
        : memories.filter((entry) => (typeof entry?.text === 'string' ? entry.text : '').toLowerCase().includes(needle));

      const submitAdd = (event) => {
        event.preventDefault();
        const value = draft.trim();
        if (value.length === 0 || blocked) return;
        onAdd(value).then((ok) => {
          if (ok) setDraft('');
        });
      };

      const list = visible.length > 0
        ? react.createElement('ul', { className: 'dsh-mem-list' }, visible.map((entry, index) => react.createElement(MemoryRow, {
          key: String(entry?.id ?? index) + ':' + index,
          t,
          entry,
          index,
          scope,
          busyKey,
          onUpdate,
          onRemove,
        })))
        : react.createElement('div', { className: 'dsh-mem-empty' },
          react.createElement('p', { className: 'dsh-mem-emptyTitle' },
            memories.length === 0
              ? (scope === 'global' ? t('emptyGlobalTitle') : t('emptyProjectTitle'))
              : t('noSearchTitle')),
          react.createElement('p', { className: 'dsh-mem-emptyBody' },
            memories.length === 0
              ? (scope === 'global' ? t('emptyGlobalBody') : t('emptyProjectBody'))
              : t('noSearchResults', { query: query.trim() })));

      return react.createElement('div', { className: 'dsh-mem-editor' },
        error === null
          ? null
          : react.createElement('p', { className: 'dsh-mem-error', role: 'alert' }, error.message),

        react.createElement('div', { className: 'dsh-mem-editorBody' },
          react.createElement('form', { className: 'dsh-mem-field', onSubmit: submitAdd },
            react.createElement('label', { className: 'dsh-mem-label', htmlFor: addId }, t('addLabel')),
            react.createElement('textarea', {
              id: addId,
              className: 'dsh-mem-textarea',
              rows: 2,
              value: draft,
              placeholder: t('addPlaceholder'),
              onChange: (event) => setDraft(event.target.value),
            }),
            react.createElement('div', { className: 'dsh-mem-formActions' },
              react.createElement('button', {
                type: 'submit',
                className: 'dsh-mem-btn dsh-mem-btnPrimary',
                disabled: blocked || draft.trim().length === 0,
              }, adding ? t('adding') : t('addButton')))),

          react.createElement('div', { className: 'dsh-mem-field' },
            react.createElement('label', { className: 'dsh-mem-label', htmlFor: searchId }, t('searchLabel')),
            react.createElement('input', {
              id: searchId,
              className: 'dsh-mem-input',
              type: 'search',
              value: query,
              placeholder: t('searchPlaceholder'),
              autoComplete: 'off',
              onChange: (event) => setQuery(event.target.value),
            })),

          react.createElement('p', { className: 'dsh-mem-counts', role: 'status', 'aria-live': 'polite' },
            memoryCount(t, counts.total),
            ' · ',
            t('countEnabled', { n: Number.isFinite(counts.enabled) ? counts.enabled : 0 }),
            needle.length === 0
              ? null
              : react.createElement('span', { className: 'dsh-mem-sr' },
                ' ' + t('filteredCount', { shown: visible.length, total: memories.length }))),

          list),

        typeof data.file === 'string' && data.file.length > 0
          ? react.createElement('p', { className: 'dsh-mem-file' },
            react.createElement('span', { className: 'dsh-mem-fileLabel' }, t('fileLabel')),
            ' ',
            react.createElement('code', null, data.file))
          : null);
    }

    /**
     * Project tab chrome: the picker backed by GET /projects plus a manual
     * absolute-path form for a workspace the index does not know yet.
     */
    function ProjectPicker({ t, projects, selectedPath, selectedCount, loading, error, pathError, busy, onSelect, onOpen, onRetryProjects }) {
      const [pathDraft, setPathDraft] = react.useState('');
      const selectId = 'dsh-mem-project-select';
      const pathId = 'dsh-mem-project-path';
      const opening = busy === 'open';
      // Any in-flight mutation blocks the picker: switching projects mid-write
      // would apply the old project's response to the new one's view.
      const blocked = busy !== null;

      const known = (Array.isArray(projects) ? projects : [])
        .filter((project) => project !== null && typeof project === 'object' && typeof project.path === 'string');
      // A path opened by hand may not be in the index yet (or the index fetch
      // failed); keep the select truthful by showing it as an option anyway.
      const options = selectedPath !== null && !known.some((project) => project.path === selectedPath)
        ? [{ path: selectedPath, count: selectedCount }, ...known]
        : known;

      const openPath = (event) => {
        event.preventDefault();
        const value = pathDraft.trim();
        if (value.length === 0) {
          onOpen('');
          return;
        }
        onOpen(value).then((ok) => {
          if (ok) setPathDraft('');
        });
      };

      return react.createElement('div', { className: 'dsh-mem-picker' },
        react.createElement('div', { className: 'dsh-mem-field' },
          react.createElement('label', { className: 'dsh-mem-label', htmlFor: selectId }, t('projectLabel')),
          react.createElement('select', {
            id: selectId,
            className: 'dsh-mem-select',
            value: selectedPath ?? '',
            disabled: blocked,
            onChange: (event) => onSelect(event.target.value),
          },
          react.createElement('option', { value: '' }, t('projectPlaceholder')),
          options.map((project, index) => {
            const path = project.path;
            const count = path === selectedPath && Number.isInteger(selectedCount)
              ? selectedCount
              : project.count;
            return react.createElement('option', { key: path + ':' + index, value: path },
              path + (Number.isInteger(count) ? ' · ' + memoryCount(t, count) : ''));
          }))),

        react.createElement('form', { className: 'dsh-mem-field', onSubmit: openPath },
          react.createElement('label', { className: 'dsh-mem-label', htmlFor: pathId }, t('pathLabel')),
          react.createElement('div', { className: 'dsh-mem-pathRow' },
            react.createElement('input', {
              id: pathId,
              className: 'dsh-mem-input',
              type: 'text',
              value: pathDraft,
              placeholder: t('pathPlaceholder'),
              autoComplete: 'off',
              spellCheck: false,
              disabled: blocked,
              onChange: (event) => setPathDraft(event.target.value),
            }),
            react.createElement('button', {
              type: 'submit',
              className: 'dsh-mem-btn',
              disabled: blocked,
            }, opening ? t('opening') : t('open')))),

        pathError === null
          ? null
          : react.createElement('p', { className: 'dsh-mem-error', role: 'alert' }, pathError.message),

        loading
          ? react.createElement('p', { className: 'dsh-mem-note', role: 'status' }, t('loading'))
          : null,

        error === null
          ? null
          : react.createElement('div', { className: 'dsh-mem-inlineError' },
            react.createElement('p', { className: 'dsh-mem-error', role: 'alert' }, error.message),
            react.createElement('button', {
              type: 'button',
              className: 'dsh-mem-btn',
              onClick: onRetryProjects,
            }, t('retry'))));
    }

    /**
     * The Settings → Memory page.
     *
     * State lives here rather than in the two panels so both tabs share one
     * loader/error/busy discipline. Global state is loaded once on mount;
     * project state is driven by `selectedPath` (plus a reload counter so
     * re-opening the same path refetches).
     */
    function MemorySettings({ t }) {
      const [tab, setTab] = react.useState('global');

      const [globalData, setGlobalData] = react.useState(null);
      const [globalLoading, setGlobalLoading] = react.useState(true);
      const [globalError, setGlobalError] = react.useState(null);

      const [projects, setProjects] = react.useState(null);
      const [projectsLoading, setProjectsLoading] = react.useState(true);
      const [projectsError, setProjectsError] = react.useState(null);

      const [selectedPath, setSelectedPath] = react.useState(null);
      const [projectData, setProjectData] = react.useState(null);
      const [projectLoading, setProjectLoading] = react.useState(false);
      const [projectError, setProjectError] = react.useState(null);
      const [projectReload, setProjectReload] = react.useState(0);
      const [pathError, setPathError] = react.useState(null);

      /** `null` | 'open' | 'add:<scope>' | '<scope>:<memoryId>'. */
      const [busy, setBusy] = react.useState(null);

      const alive = react.useRef(true);
      const projectSeq = react.useRef(0);

      react.useEffect(() => {
        // Re-armed on (re)mount so a dev-mode double effect cannot leave the
        // guard stuck closed.
        alive.current = true;
        return () => { alive.current = false; };
      }, []);

      const loadGlobal = react.useCallback(() => {
        setGlobalLoading(true);
        return api('/state?scope=global')
          .then((payload) => {
            if (!alive.current) return;
            setGlobalData(stateFrom(payload, null));
            setGlobalError(null);
          })
          .catch((cause) => {
            if (!alive.current) return;
            setGlobalError({ message: t('errorPrefix', { detail: messageOf(cause) }) });
          })
          .finally(() => {
            if (alive.current) setGlobalLoading(false);
          });
      }, [t]);

      const loadProjects = react.useCallback(() => {
        setProjectsLoading(true);
        return api('/projects')
          .then((payload) => {
            if (!alive.current) return;
            setProjects(Array.isArray(payload.projects) ? payload.projects : []);
            setProjectsError(null);
          })
          .catch((cause) => {
            if (!alive.current) return;
            setProjectsError({ message: t('errorPrefix', { detail: messageOf(cause) }) });
          })
          .finally(() => {
            if (alive.current) setProjectsLoading(false);
          });
      }, [t]);

      react.useEffect(() => {
        loadGlobal();
        loadProjects();
      }, [loadGlobal, loadProjects]);

      // Project state follows the picker. The sequence guard keeps a slow
      // response for a previously selected project from overwriting the
      // current one.
      react.useEffect(() => {
        if (selectedPath === null) return undefined;
        const seq = projectSeq.current + 1;
        projectSeq.current = seq;
        setProjectData(null);
        setProjectLoading(true);
        setProjectError(null);
        api('/state?scope=project&project=' + encodeURIComponent(selectedPath))
          .then((payload) => {
            if (seq !== projectSeq.current || !alive.current) return;
            setProjectData(stateFrom(payload, null));
          })
          .catch((cause) => {
            if (seq !== projectSeq.current || !alive.current) return;
            setProjectError({ message: t('errorPrefix', { detail: messageOf(cause) }) });
          })
          .finally(() => {
            if (seq === projectSeq.current && alive.current) setProjectLoading(false);
          });
        return undefined;
      }, [selectedPath, projectReload, t]);

      /** Apply a mutation response to the matching scope's state. */
      const applyMutation = (scope, payload) => {
        if (scope === 'global') setGlobalData((previous) => stateFrom(payload, previous));
        else setProjectData((previous) => stateFrom(payload, previous));
      };

      /**
       * One mutation at a time, with failures shown inline in the scope that
       * caused them. Resolves to `true` on success so the caller can clear an
       * input or leave edit mode only when the server actually stored it.
       */
      const mutate = (scope, key, path, body) => {
        setBusy(key);
        if (scope === 'global') setGlobalError(null);
        else setProjectError(null);
        return api(path, { method: 'POST', body })
          .then((payload) => {
            if (!alive.current) return false;
            applyMutation(scope, payload);
            return true;
          })
          .catch((cause) => {
            if (alive.current) {
              const failure = { message: t('errorPrefix', { detail: messageOf(cause) }) };
              if (scope === 'global') setGlobalError(failure);
              else setProjectError(failure);
            }
            return false;
          })
          .finally(() => {
            if (alive.current) setBusy(null);
          });
      };

      const scopeBody = (scope, extra) => {
        const body = { scope, ...extra };
        if (scope === 'project') body.project = selectedPath;
        return body;
      };

      const addMemory = (scope, text) => {
        const value = typeof text === 'string' ? text.trim() : '';
        if (value.length === 0) return Promise.resolve(false);
        if (scope === 'project' && selectedPath === null) return Promise.resolve(false);
        return mutate(scope, 'add:' + scope, '/add', scopeBody(scope, { text: value }));
      };

      const updateMemory = (scope, id, patch) => {
        if (typeof id !== 'string' || id.length === 0) return Promise.resolve(false);
        if (scope === 'project' && selectedPath === null) return Promise.resolve(false);
        return mutate(scope, scope + ':' + id, '/update', scopeBody(scope, { id, ...(patch ?? {}) }));
      };

      const removeMemory = (scope, id) => {
        if (typeof id !== 'string' || id.length === 0) return Promise.resolve(false);
        if (scope === 'project' && selectedPath === null) return Promise.resolve(false);
        return mutate(scope, scope + ':' + id, '/remove', scopeBody(scope, { id }));
      };

      /**
       * Open a project by absolute path. `/touch-project` first, so the host
       * validates the directory and records it in the project index; the
       * selected-path effect then loads `/state`. The response's project list
       * updates the picker without a second round-trip.
       */
      const openProject = (raw) => {
        const value = typeof raw === 'string' ? raw.trim() : '';
        if (value.length === 0) {
          setPathError({ message: t('pathRequired') });
          return Promise.resolve(false);
        }
        setBusy('open');
        setPathError(null);
        return api('/touch-project', { method: 'POST', body: { project: value } })
          .then((payload) => {
            if (!alive.current) return false;
            if (Array.isArray(payload.projects)) {
              setProjects(payload.projects);
              setProjectsError(null);
            } else {
              loadProjects();
            }
            // Re-opening the same path must refetch; a new path already
            // triggers the selected-path effect on its own.
            if (value === selectedPath) setProjectReload((n) => n + 1);
            else setSelectedPath(value);
            return true;
          })
          .catch((cause) => {
            if (alive.current) setPathError({ message: t('errorPrefix', { detail: messageOf(cause) }) });
            return false;
          })
          .finally(() => {
            if (alive.current) setBusy(null);
          });
      };

      const selectProject = (value) => {
        setPathError(null);
        setProjectError(null);
        setSelectedPath(value.length > 0 ? value : null);
      };

      // Only two tabs, so either arrow moves focus and selection to the other
      // one — the standard tablist keyboard expectation.
      const onTabKeyDown = (event) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        event.preventDefault();
        const next = tab === 'global' ? 'project' : 'global';
        setTab(next);
        const container = event.currentTarget.parentElement;
        if (container !== null) {
          const target = container.querySelector('[data-tab="' + next + '"]');
          if (target !== null && typeof target.focus === 'function') target.focus();
        }
      };

      const tabButton = (id, labelKey) => react.createElement('button', {
        key: id,
        type: 'button',
        role: 'tab',
        id: 'dsh-mem-tab-' + id,
        'data-tab': id,
        'aria-selected': tab === id ? 'true' : 'false',
        'aria-controls': 'dsh-mem-panel-' + id,
        className: 'dsh-mem-tab',
        onClick: () => setTab(id),
        onKeyDown: onTabKeyDown,
      }, t(labelKey));

      return react.createElement('div', { className: 'dsh-mem-panel' },
        react.createElement('h3', { className: 'dsh-mem-title' }, t('title')),
        react.createElement('p', { className: 'dsh-mem-intro' }, t('intro')),

        react.createElement('div', { className: 'dsh-mem-tabs', role: 'tablist', 'aria-label': t('title') },
          tabButton('global', 'globalTab'),
          tabButton('project', 'projectTab')),

        // Both panels stay mounted (hidden panel is `hidden`, not unmounted) so
        // each tab keeps its draft and search, and `aria-controls` always
        // points at a real element.
        react.createElement('div', {
          className: 'dsh-mem-panelBody',
          role: 'tabpanel',
          id: 'dsh-mem-panel-global',
          'aria-labelledby': 'dsh-mem-tab-global',
          hidden: tab !== 'global',
        },
        react.createElement(MemoryList, {
          t,
          scope: 'global',
          data: globalData,
          loading: globalLoading,
          error: globalError,
          busyKey: busy,
          onAdd: (text) => addMemory('global', text),
          onUpdate: (id, patch) => updateMemory('global', id, patch),
          onRemove: (id) => removeMemory('global', id),
          onRetry: loadGlobal,
        })),

        react.createElement('div', {
          className: 'dsh-mem-panelBody',
          role: 'tabpanel',
          id: 'dsh-mem-panel-project',
          'aria-labelledby': 'dsh-mem-tab-project',
          hidden: tab !== 'project',
        },
        react.createElement(ProjectPicker, {
          t,
          projects,
          selectedPath,
          selectedCount: projectData?.counts?.total ?? null,
          loading: projectsLoading,
          error: projectsError,
          pathError,
          busy,
          onSelect: selectProject,
          onOpen: openProject,
          onRetryProjects: loadProjects,
        }),
        selectedPath === null
          ? react.createElement('div', { className: 'dsh-mem-empty' },
            react.createElement('p', { className: 'dsh-mem-emptyBody' }, t('projectPickHint')))
          : react.createElement(MemoryList, {
            key: 'project:' + selectedPath + ':' + projectReload,
            t,
            scope: 'project',
            data: projectData,
            loading: projectLoading,
            error: projectError,
            busyKey: busy,
            onAdd: (text) => addMemory('project', text),
            onUpdate: (id, patch) => updateMemory('project', id, patch),
            onRemove: (id) => removeMemory('project', id),
            onRetry: () => setProjectReload((n) => n + 1),
          })));
    }

    /** Required services: the slot registry and the dictionary registry. */
    const inject = ['slots', 'locale'];

    /**
     * Client plugin body.
     * @param ctx - the client root context.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), `${NS}: dictionaries`);
      const t = ctx.locale.bind(NS);

      // Settings → Memory: global and per-project memory, fully editable.
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: NS,
        order: 70,
        label: () => t('nav'),
        inject: () => ({ t }),
      }, MemorySettings));
    }

    exports.MemorySettings = MemorySettings;
    exports.MemoryList = MemoryList;
    exports.MemoryRow = MemoryRow;
    exports.ProjectPicker = ProjectPicker;
    exports.apply = apply;
    exports.inject = inject;
    exports.name = NS;
    return module.exports;
  },
});
