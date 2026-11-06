// Small HTTP server for local development and for hosts that run a Node process.
import http from 'node:http';
import { handlePlaces, handleChart, handleRelationship, errorResponse, corsHeaders } from './handlers.js';

const routes = { '/api/chart': handleChart, '/api/relationship': handleRelationship };
const port = Number(process.env.PORT ?? 8787);

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const headers = { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req.headers.origin ?? '') };
  if (process.env.SOURCE_URL) headers['X-Source-Code'] = process.env.SOURCE_URL;
  if (req.method === 'OPTIONS') { res.writeHead(204, headers); return res.end(); }
  let result;
  try {
    if (url.pathname === '/api/places' && req.method === 'GET') result = handlePlaces(url.searchParams);
    else if (routes[url.pathname] && req.method === 'POST') {
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (raw.length > 20000) throw new Error('body too large'); }
      result = routes[url.pathname](JSON.parse(raw || '{}'));
    } else if (url.pathname === '/' ) result = { status: 200, body: { ok: true, source: process.env.SOURCE_URL ?? null } };
    else result = { status: 404, body: { error: 'not found' } };
  } catch (err) {
    result = errorResponse(err);
  }
  res.writeHead(result.status, headers);
  res.end(JSON.stringify(result.body));
}).listen(port, () => console.log(`chart-engine on http://localhost:${port}`));
