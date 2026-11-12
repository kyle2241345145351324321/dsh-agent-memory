/**
 * dsh-agent-memory — HTTP surface for the Settings page.
 *
 * Same-origin JSON registered as one node:http prefix route on
 * `ctx.webServer`. The route logic is factored into {@link dispatchMemoryRequest}
 * (pure apart from the memory operations) so tests exercise the exact contract
 * with a plain method/URL/body triple, and the server half is a thin adapter.
 *
 * `resource` routes only answer GET/HEAD, and this page must POST, so the
 * registration uses a handler.
 *
 * @module dsh-agent-memory/routes
 */

/** Route prefix owned by this plugin (and the client bundle's fetch base). */
export const BASE_PATH = '/dsh-agent-memory';

/** Body cap: memory entries are short; anything larger is a mistake or a probe. */
const MAX_BODY_BYTES = 64 * 1024;

/**
 * Read and parse a JSON request body.
 * @param text - raw UTF-8 request body.
 * @returns the parsed object (an empty object for an empty body).
 * @throws when the body is too large, not JSON, or not an object.
 */
export function parseBody(text) {
  if (text.length > MAX_BODY_BYTES) throw new Error(`request body too large (${text.length} > ${MAX_BODY_BYTES} bytes)`);
  if (text.trim().length === 0) return {};
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`request body is not valid JSON: ${error.message}`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('request body must be a JSON object');
  return value;
}

/** Reject a method the route does not accept, with a message naming the method. */
function requireMethod(method, allowed) {
  if (!allowed.includes(method)) throw new Error(`${method} is not allowed here; use ${allowed.join(' or ')}`);
}

/** A query parameter as a trimmed string, or undefined. */
function query(searchParams, name) {
  const value = searchParams.get(name);
  return value === null ? undefined : value.trim();
}

/**
 * Answer one memory request.
 * @param options - `memory` operations and an optional warning logger.
 * @param request - `{method, url, bodyText}`; `url` is a URL object.
 * @returns `{status, payload}` with a JSON-serializable payload.
 */
export async function dispatchMemoryRequest({ memory, log }, request) {
  const { method, url, bodyText = '' } = request;
  let route = url.pathname;
  if (route.startsWith(BASE_PATH)) route = route.slice(BASE_PATH.length);
  if (route.length === 0) route = '/';

  try {
    if (route === '/state') {
      requireMethod(method, ['GET']);
      const scope = query(url.searchParams, 'scope') ?? 'global';
      const project = query(url.searchParams, 'project');
      const state = memory.state({ scope, project });
      // Opening a project in the UI registers it, so next time it is listed.
      if (state.scope === 'project' && state.project !== undefined) {
        await memory.touch(state.project).catch(() => {});
      }
      return { status: 200, payload: { ok: true, ...state } };
    }

    if (route === '/projects') {
      requireMethod(method, ['GET']);
      return {
        status: 200,
        payload: { ok: true, home: memory.home, globalFile: memory.globalFile, projects: await memory.listProjects() },
      };
    }

    if (route === '/add') {
      requireMethod(method, ['POST']);
      const body = parseBody(bodyText);
      const result = await memory.add({ scope: body.scope, project: body.project, text: body.text, source: 'user' });
      return { status: 200, payload: { ok: true, ...result.state, memory: result.memory } };
    }

    if (route === '/update') {
      requireMethod(method, ['POST']);
      const body = parseBody(bodyText);
      const result = await memory.update({ scope: body.scope, project: body.project, id: body.id, text: body.text, enabled: body.enabled });
      return { status: 200, payload: { ok: true, ...result.state, memory: result.memory } };
    }

    if (route === '/remove') {
      requireMethod(method, ['POST']);
      const body = parseBody(bodyText);
      const result = await memory.remove({ scope: body.scope, project: body.project, id: body.id });
      return { status: 200, payload: { ok: true, ...result.state, removed: result.memory } };
    }

    if (route === '/touch-project') {
      requireMethod(method, ['POST']);
      const body = parseBody(bodyText);
      if (typeof body.project !== 'string' || body.project.trim().length === 0) throw new Error('project path is required');
      await memory.touch(body.project);
      return { status: 200, payload: { ok: true, projects: await memory.listProjects() } };
    }

    return { status: 404, payload: { ok: false, error: `no route for ${method} ${BASE_PATH}${route}` } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log?.warn?.('dsh-agent-memory: %s %s failed: %s', method, route, message);
    // Every failure the client can cause is a bad request; an unexpected
    // failure still answers JSON so the page shows a message instead of
    // hanging on a parse error.
    return { status: 400, payload: { ok: false, error: message } };
  }
}

/**
 * Create the node:http handler the plugin registers on `ctx.webServer`.
 * @param options - `memory` operations and an optional `log`.
 * @returns `(req, res) => Promise<void>`.
 */
export function createMemoryHandler({ memory, log }) {
  return async function memoryHandler(req, res) {
    const chunks = [];
    let size = 0;
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          res.writeHead(413, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
          res.end(`${JSON.stringify({ ok: false, error: 'request body too large' })}\n`);
          return;
        }
        chunks.push(chunk);
      }
    } catch {
      res.writeHead(400, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(`${JSON.stringify({ ok: false, error: 'could not read request body' })}\n`);
      return;
    }

    const url = new URL(req.url ?? '/', 'http://dsh.invalid');
    const result = await dispatchMemoryRequest(
      { memory, log },
      { method: (req.method ?? 'GET').toUpperCase(), url, bodyText: Buffer.concat(chunks).toString('utf8') },
    );
    const body = `${JSON.stringify(result.payload)}\n`;
    res.writeHead(result.status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(body),
    });
    res.end(body);
  };
}
