// Minimal router for the built-in http module. Routes are declared with the same
// shape Express used (`router.get('/:id', middleware..., handler)`) so route files stay readable.

class Router {
  constructor(prefix = '') {
    this.prefix = prefix.replace(/\/$/, '');
    this.routes = [];
  }

  add(method, path, handlers) {
    const full = `${this.prefix}${path === '/' ? '' : path}` || '/';
    const names = [];
    const pattern = full
      .split('/')
      .map((segment) => {
        if (segment.startsWith(':')) {
          names.push(segment.slice(1));
          return '([^/]+)';
        }
        return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('/');
    this.routes.push({ method, regex: new RegExp(`^${pattern}$`), names, handlers });
    return this;
  }

  get(path, ...handlers) {
    return this.add('GET', path, handlers);
  }

  post(path, ...handlers) {
    return this.add('POST', path, handlers);
  }

  patch(path, ...handlers) {
    return this.add('PATCH', path, handlers);
  }

  delete(path, ...handlers) {
    return this.add('DELETE', path, handlers);
  }
}

function decodeParam(value) {
  try {
    return decodeURIComponent(value);
  } catch (_err) {
    const error = new Error('That link is not valid.');
    error.status = 400;
    error.expose = true;
    throw error;
  }
}

// Returns the first route whose method and path match, with decoded params.
function findRoute(routes, method, pathname) {
  const wanted = method === 'HEAD' ? 'GET' : method;
  for (const route of routes) {
    if (route.method !== wanted) continue;
    const match = route.regex.exec(pathname);
    if (!match) continue;
    const params = {};
    route.names.forEach((name, i) => {
      params[name] = decodeParam(match[i + 1]);
    });
    return { handlers: route.handlers, params };
  }
  return null;
}

// Resolves true when a handler calls next(), false when it finished without calling next.
// next(err) rejects so the error handler runs.
function invoke(handler, req, res) {
  return new Promise((resolve, reject) => {
    const next = (err) => (err ? reject(err) : resolve(true));
    Promise.resolve()
      .then(() => handler(req, res, next))
      .then(() => resolve(false), reject);
  });
}

async function runChain(handlers, req, res) {
  for (const handler of handlers) {
    const proceed = await invoke(handler, req, res);
    if (!proceed) return;
  }
}

module.exports = { Router, findRoute, runChain };
