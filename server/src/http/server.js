const http = require('http');
const { decorateResponse } = require('./respond');
const { parseRequestBody } = require('./body');
const { findRoute, runChain } = require('./router');
const { errorHandler, notFound } = require('../middleware/errors');

// Builds the request handler: CORS, body parsing, routing, and the error handler.
// Shared by the local dev server (node http) and the Vercel serverless entry (api/[...route].js).
function createRequestHandler(routes) {
  const origin = process.env.CLIENT_URL || 'http://localhost:5173';

  return async function handle(req, res) {
    decorateResponse(req, res);
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
      const requested = req.headers['access-control-request-headers'];
      if (requested) {
        res.setHeader('Access-Control-Allow-Headers', requested);
        res.setHeader('Vary', 'Origin, Access-Control-Request-Headers');
      }
      res.statusCode = 204;
      res.setHeader('Content-Length', '0');
      res.end();
      return;
    }

    try {
      const url = new URL(req.url, 'http://localhost');
      req.originalUrl = req.url;
      req.path = url.pathname;
      req.query = Object.fromEntries(url.searchParams);
      await parseRequestBody(req);

      const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') || '/' : '/';
      const route = findRoute(routes, req.method, pathname);
      if (!route) {
        notFound(req, res);
        return;
      }
      req.params = route.params;
      await runChain(route.handlers, req, res);
    } catch (err) {
      if (res.headersSent) {
        res.end();
        return;
      }
      errorHandler(err, req, res);
    }
  };
}

// Local dev only: wraps the same handler in a node http server.
function createServer(routes) {
  return http.createServer(createRequestHandler(routes));
}

module.exports = { createServer, createRequestHandler };
