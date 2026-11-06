// Framework-free request handlers shared by the local server and Vercel functions.

import { computeChart, synastry, composite, InputError } from './chart.js';
import { searchPlaces } from './places.js';

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000,https://astrologybird.com,https://www.astrologybird.com,https://app.astrologybird.com')
  .split(',').map((s) => s.trim());

export function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

export function handlePlaces(params) {
  return { status: 200, body: { results: searchPlaces(params.get('q') ?? '', { lang: params.get('lang') === 'nl' ? 'nl' : 'en' }) } };
}

export function handleChart(body) {
  return { status: 200, body: computeChart(body ?? {}) };
}

/** body: { a: chartInput, b: chartInput } → both charts, synastry and composite. */
export function handleRelationship(body) {
  if (!body?.a || !body?.b) throw new InputError('a and b are required');
  const a = computeChart(body.a);
  const b = computeChart(body.b);
  return { status: 200, body: { a, b, synastry: synastry(a, b), composite: composite(a, b) } };
}

export function errorResponse(err) {
  if (err instanceof InputError || /time zone/.test(err.message)) return { status: 400, body: { error: err.message } };
  console.error(err);
  return { status: 500, body: { error: 'calculation failed' } };
}

