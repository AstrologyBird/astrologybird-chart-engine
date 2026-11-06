// Adapter: Vercel Node.js functions → shared handlers.
import { handlePlaces, handleChart, handleRelationship, errorResponse, corsHeaders } from '../src/handlers.js';

export function vercel(kind) {
  return async function handler(req, res) {
    const headers = { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(req.headers.origin ?? '') };
    if (process.env.SOURCE_URL) headers['X-Source-Code'] = process.env.SOURCE_URL;
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    if (req.method === 'OPTIONS') return res.status(204).end();
    let result;
    try {
      if (kind === 'places') {
        if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
        result = handlePlaces(new URL(req.url, 'http://x').searchParams);
      } else {
        if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
        result = kind === 'chart' ? handleChart(body) : handleRelationship(body);
      }
    } catch (err) {
      result = errorResponse(err);
    }
    res.status(result.status).send(JSON.stringify(result.body));
  };
}
