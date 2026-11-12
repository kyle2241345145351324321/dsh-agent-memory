/**
 * Client bundle contract test.
 *
 * The browser half is hand-authored (no bundler), so a typo in the module id,
 * the locale namespace, or the settings-slot registration cannot be caught by
 * TypeScript. This test loads `client/client.js` in a VM with a fake module
 * loader, a minimal React shim, and a fake slots/locale context, then asserts:
 *
 * - the bundle registers under the exact id the host serves it as;
 * - the exported plugin name / inject list / apply function are present;
 * - it registers `settings.section` with the stable id and order;
 * - its page renders on the first pass without throwing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SOURCE = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8');

/**
 * Minimal React shim: one render pass, one hook frame per component, and
 * function components invoked inline so the whole page tree can be walked.
 */
function createReactShim() {
  const shim = {
    frame: null,
    startRender() {
      this.frame = { slots: [], index: 0 };
    },
    useState(initial) {
      const frame = this.frame;
      const at = frame.index++;
      if (!(at in frame.slots)) frame.slots[at] = typeof initial === 'function' ? initial() : initial;
      return [frame.slots[at], (next) => {
        frame.slots[at] = typeof next === 'function' ? next(frame.slots[at]) : next;
      }];
    },
    useRef(initial) {
      const frame = this.frame;
      const at = frame.index++;
      if (!(at in frame.slots)) frame.slots[at] = { current: initial };
      return frame.slots[at];
    },
    useEffect() {
      this.frame.index += 1;
    },
    useCallback(fn) {
      this.frame.index += 1;
      return fn;
    },
    useMemo(fn) {
      this.frame.index += 1;
      return fn();
    },
    createElement(type, props, ...children) {
      if (typeof type === 'function') {
        const saved = this.frame;
        this.frame = { slots: [], index: 0 };
        try {
          return type(children.length > 0 ? { ...props, children } : props);
        } finally {
          this.frame = saved;
        }
      }
      return { type, props: props ?? {}, children };
    },
  };
  return shim;
}

/** Collect every text node in a shim element tree. */
function texts(node, out = []) {
  if (node === null || node === undefined || node === false) return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) texts(child, out);
    return out;
  }
  if (typeof node === 'object' && node.type !== undefined) texts(node.children, out);
  return out;
}

/** Load the bundle and return the captured registration plus the shim. */
function loadBundle() {
  const appendedStyles = [];
  const document = {
    querySelector: () => null,
    createElement: () => ({ dataset: {} }),
    head: { appendChild: (element) => appendedStyles.push(element) },
  };
  let registration;
  const react = createReactShim();
  const sandbox = {
    window: { __ModuleLoader__: { load: (value) => { registration = value; } } },
    document,
    console,
    fetch: async () => { throw new Error('no network in the contract test'); },
  };
  vm.runInNewContext(SOURCE, sandbox, { filename: 'client/client.js' });
  assert.ok(registration !== undefined, 'client bundle did not call window.__ModuleLoader__.load');
  const require = (name) => {
    if (name === 'react') return react;
    throw new Error(`client bundle required an unexpected module: ${name}`);
  };
  // The factory body is what injects the stylesheet, so run it here exactly once.
  const exported = registration.factory(require);
  return { registration, react, appendedStyles, exported };
}

test('the bundle id and namespace are the stable plugin name, with no hotfix suffix', () => {
  const { registration } = loadBundle();
  assert.equal(registration.id, 'dsh-agent-memory');
  assert.match(SOURCE, /id: 'dsh-agent-memory'/);
  assert.match(SOURCE, /const NS = 'dsh-agent-memory';/);
  assert.match(SOURCE, /const BASE = '\/dsh-agent-memory';/);
  assert.doesNotMatch(SOURCE, /-v5/);
});

test('the module exports the plugin name, inject list, apply, and page components', () => {
  const { exported } = loadBundle();
  assert.equal(exported.name, 'dsh-agent-memory');
  // Spread first: a VM-realm array has a different prototype than this realm's.
  assert.deepEqual([...exported.inject], ['slots', 'locale']);
  assert.equal(typeof exported.apply, 'function');
  for (const component of ['MemorySettings', 'MemoryList', 'MemoryRow', 'ProjectPicker']) {
    assert.equal(typeof exported[component], 'function', `${component} must be exported`);
  }
});

test('the bundle injects its scoped stylesheet once', () => {
  const { appendedStyles } = loadBundle();
  assert.equal(appendedStyles.length, 1);
  assert.equal(appendedStyles[0].dataset.plugin, 'dsh-agent-memory');
  assert.match(appendedStyles[0].textContent, /\.dsh-mem-panel/);
});

test('apply registers the Settings → Memory section with the stable id and order', () => {
  const { exported } = loadBundle();
  const registered = [];
  const ctx = {
    effect(fn) {
      return fn();
    },
    locale: {
      register() {},
      bind() {
        return (key) => key;
      },
    },
    slots: {
      inject(name, callback) {
        assert.equal(name, 'settings.section');
        callback();
      },
      register(options, component) {
        registered.push({ options, component });
        return () => {};
      },
    },
  };
  exported.apply(ctx);
  assert.equal(registered.length, 1);
  const { options, component } = registered[0];
  assert.equal(options.name, 'settings.section');
  assert.equal(options.id, 'dsh-agent-memory');
  assert.equal(options.order, 70);
  assert.equal(options.label(), 'nav');
  assert.equal(typeof component, 'function');
});

test('the page renders on the first pass without throwing', () => {
  const { react, exported } = loadBundle();
  let component;
  const ctx = {
    effect(fn) { return fn(); },
    locale: { register() {}, bind() { return (key) => key; } },
    slots: {
      inject(_name, callback) { callback(); },
      register(options, value) {
        assert.equal(options.name, 'settings.section');
        component = value;
        return () => {};
      },
    },
  };
  exported.apply(ctx);
  react.startRender();
  const tree = component({ t: (key) => key });
  const rendered = texts(tree);
  for (const expected of ['title', 'intro', 'globalTab', 'projectTab']) {
    assert.ok(rendered.includes(expected), `first render must include ${expected}`);
  }
  // Both tabs stay mounted, and the empty/loading surface is present before data.
  assert.ok(rendered.includes('loading'));
});
