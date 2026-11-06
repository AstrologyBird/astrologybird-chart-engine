import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { localToUtc } from '../src/tz.js';
import { computeChart, composite, synastry } from '../src/chart.js';
import { searchPlaces } from '../src/places.js';

const Astronomy = createRequire(import.meta.url)('astronomy-engine');

test('Dutch time before 1940 uses Amsterdam time (+00:19:32 / +00:20)', () => {
  // Winter 1935: Amsterdam Mean Time, UTC+0:19:32
  assert.equal(localToUtc({ year: 1935, month: 1, day: 10, hour: 12, minute: 0 }, 'Europe/Amsterdam').offsetSeconds, 1172);
  // Summer 1935: Dutch summer time, UTC+1:19:32
  assert.equal(localToUtc({ year: 1935, month: 7, day: 10, hour: 12, minute: 0 }, 'Europe/Amsterdam').offsetSeconds, 4772);
  // Winter 1939: UTC+0:20
  assert.equal(localToUtc({ year: 1939, month: 1, day: 10, hour: 12, minute: 0 }, 'Europe/Amsterdam').offsetSeconds, 1200);
  // Summer 1990: CEST
  assert.equal(localToUtc({ year: 1990, month: 7, day: 10, hour: 12, minute: 0 }, 'Europe/Amsterdam').offsetSeconds, 7200);
});

test('daylight saving gaps and overlaps are flagged', () => {
  assert.equal(localToUtc({ year: 2024, month: 3, day: 31, hour: 2, minute: 30 }, 'Europe/Amsterdam').warning, 'nonexistent-local-time');
  assert.equal(localToUtc({ year: 2024, month: 10, day: 27, hour: 2, minute: 30 }, 'Europe/Amsterdam').warning, 'ambiguous-local-time');
  assert.equal(localToUtc({ year: 2024, month: 6, day: 1, hour: 2, minute: 30 }, 'America/New_York').offsetSeconds, -4 * 3600);
});

test('planet positions agree with an independent library (astronomy-engine) within 0.02°', () => {
  const chart = computeChart({ date: '1990-05-15', time: '12:30', lat: 52.09083, lon: 5.12222, timezone: 'Europe/Amsterdam' });
  const when = new Date(Date.UTC(1990, 4, 15, 10, 30));
  const bodies = { sun: 'Sun', moon: 'Moon', mercury: 'Mercury', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune', pluto: 'Pluto' };
  for (const [key, name] of Object.entries(bodies)) {
    const elon = Astronomy.Ecliptic(Astronomy.GeoVector(name, when, true)).elon;
    const ours = chart.points.find((p) => p.key === key).longitude;
    let d = Math.abs(ours - elon); if (d > 180) d = 360 - d;
    assert.ok(d < 0.02, `${key}: ${ours} vs ${elon} (Δ ${d})`);
  }
});

test('chart structure: houses, angles, big three', () => {
  const c = computeChart({ date: '1990-05-15', time: '12:30', lat: 52.09083, lon: 5.12222 });
  assert.equal(c.input.timezone, 'Europe/Amsterdam');
  assert.equal(c.houses.length, 12);
  assert.equal(c.bigThree.sun, 'taurus');
  assert.ok(Math.abs(c.houses[0].longitude - c.angles.asc.longitude) < 1e-9);
  assert.ok(c.aspects.length > 0);
  const ws = computeChart({ date: '1990-05-15', time: '12:30', lat: 52.09083, lon: 5.12222, houseSystem: 'wholeSign' });
  assert.equal(ws.houses[0].degree, 0);
});

test('unknown birth time: no houses or rising sign', () => {
  const c = computeChart({ date: '1990-05-15', time: null, lat: 52.09, lon: 5.12 });
  assert.equal(c.houses, null);
  assert.equal(c.bigThree.rising, null);
  assert.ok(c.warnings.includes('time-unknown'));
});

test('polar latitude falls back to Porphyry houses', () => {
  const c = computeChart({ date: '1990-06-21', time: '12:00', lat: 78.22, lon: 15.65, timezone: 'Arctic/Longyearbyen' });
  assert.equal(c.houseSystem, 'porphyry');
});

test('relationship: synastry and composite', () => {
  const a = computeChart({ date: '1990-05-15', time: '12:30', lat: 52.09, lon: 5.12 });
  const b = computeChart({ date: '1988-11-02', time: '06:10', lat: 51.92, lon: 4.48 });
  const s = synastry(a, b);
  assert.ok(s.aspects.length > 0);
  assert.equal(s.aInB.length, a.points.length);
  const comp = composite(a, b);
  const sunMid = comp.points.find((p) => p.key === 'sun').longitude;
  const sa = a.points[0].longitude, sb = b.points[0].longitude;
  let d = Math.abs(sa - sb); if (d > 180) d = 360 - d;
  let e = Math.abs(sunMid - sa); if (e > 180) e = 360 - e;
  assert.ok(Math.abs(e - d / 2) < 1e-6);
});

test('place search finds Dutch towns with their time zone', () => {
  const [utrecht] = searchPlaces('Utrecht');
  assert.equal(utrecht.country, 'NL');
  assert.equal(utrecht.timezone, 'Europe/Amsterdam');
  assert.ok(searchPlaces('s-Hertogenbosch, NL').length > 0 || searchPlaces('Den Bosch').length > 0);
  assert.equal(searchPlaces('Zürich')[0].country, 'CH');
});

test('place search accepts a country after the town', () => {
  for (const q of ['Naarden netherlands', 'Naarden, Nederland', 'Naarden, NL', 'naarden Holland']) {
    const [hit] = searchPlaces(q);
    assert.equal(hit?.name, 'Naarden', q);
    assert.equal(hit.country, 'NL', q);
  }
  assert.equal(searchPlaces('Paris france')[0].country, 'FR');
  assert.equal(searchPlaces('Den Haag')[0].name, 'The Hague');
  assert.equal(searchPlaces('Hong Kong')[0].country, 'HK');
});
