// Chart calculation with the Swiss Ephemeris (AGPL-3.0 edition).

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { localToUtc } from './tz.js';
import { timezoneFor } from './places.js';

const require = createRequire(import.meta.url);
const sweph = require('sweph');
const C = sweph.constants;
sweph.set_ephe_path(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'ephe'));

export const SIGNS = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'];
const ELEMENT = ['fire', 'earth', 'air', 'water'];
const MODALITY = ['cardinal', 'fixed', 'mutable'];

const BODIES = [
  ['sun', C.SE_SUN], ['moon', C.SE_MOON], ['mercury', C.SE_MERCURY], ['venus', C.SE_VENUS],
  ['mars', C.SE_MARS], ['jupiter', C.SE_JUPITER], ['saturn', C.SE_SATURN], ['uranus', C.SE_URANUS],
  ['neptune', C.SE_NEPTUNE], ['pluto', C.SE_PLUTO], ['northNode', C.SE_TRUE_NODE],
  ['chiron', C.SE_CHIRON], ['pholus', C.SE_PHOLUS], ['nessus', C.SE_AST_OFFSET + 7066], ['lilith', C.SE_MEAN_APOG],
];
const PERSONAL_WEIGHT = new Set(['sun', 'moon']);
const MINOR_POINTS = new Set(['northNode', 'southNode', 'chiron', 'pholus', 'nessus', 'lilith', 'asc', 'mc']);

export const ASPECTS = [
  { type: 'conjunction', angle: 0, orb: 8 },
  { type: 'opposition', angle: 180, orb: 8 },
  { type: 'trine', angle: 120, orb: 7 },
  { type: 'square', angle: 90, orb: 7 },
  { type: 'sextile', angle: 60, orb: 5 },
];

const HOUSE_SYSTEMS = { placidus: 'P', wholeSign: 'W', koch: 'K', equal: 'A', porphyry: 'O' };

const norm = (x) => ((x % 360) + 360) % 360;
const diff = (a, b) => { const d = Math.abs(norm(a) - norm(b)); return d > 180 ? 360 - d : d; };
const midpoint = (a, b) => { const d = norm(b - a); return d <= 180 ? norm(a + d / 2) : norm(b + (360 - d) / 2); };

function describe(longitude) {
  const lon = norm(longitude);
  const signIndex = Math.floor(lon / 30);
  const inSign = lon - signIndex * 30;
  let degree = Math.floor(inSign);
  let minute = Math.round((inSign - degree) * 60);
  if (minute === 60) { minute = 0; degree += 1; }
  return {
    longitude: lon, sign: SIGNS[signIndex], signIndex, degree, minute,
    element: ELEMENT[signIndex % 4], modality: MODALITY[signIndex % 3],
  };
}

function houseOf(lon, cusps) {
  for (let i = 0; i < 12; i++) {
    const start = cusps[i], end = cusps[(i + 1) % 12];
    if (norm(lon - start) < norm(end - start)) return i + 1;
  }
  return 1;
}

function orbFor(aspect, a, b) {
  let orb = aspect.orb;
  if (PERSONAL_WEIGHT.has(a) || PERSONAL_WEIGHT.has(b)) orb += 2;
  if (MINOR_POINTS.has(a) || MINOR_POINTS.has(b)) orb = Math.min(orb, aspect.angle === 60 ? 3 : 5);
  return orb;
}

/** Aspects between two lists of points. Same list → each pair once. */
export function findAspects(listA, listB = null) {
  const same = listB === null;
  const B = same ? listA : listB;
  const out = [];
  for (let i = 0; i < listA.length; i++) {
    for (let j = same ? i + 1 : 0; j < B.length; j++) {
      const p = listA[i], q = B[j];
      if (same && (p.key === 'southNode' || q.key === 'southNode')) continue;
      if (same && MINOR_POINTS.has(p.key) && MINOR_POINTS.has(q.key) && (p.key === 'asc' || p.key === 'mc') && (q.key === 'asc' || q.key === 'mc')) continue;
      const sep = diff(p.longitude, q.longitude);
      for (const asp of ASPECTS) {
        const orb = Math.abs(sep - asp.angle);
        if (orb <= orbFor(asp, p.key, q.key)) {
          const dt = 0.01; // days
          const later = diff(p.longitude + (p.speed ?? 0) * dt, q.longitude + (q.speed ?? 0) * dt);
          out.push({
            a: p.key, b: q.key, type: asp.type, exactAngle: asp.angle,
            orb: Math.round(orb * 100) / 100,
            applying: Math.abs(later - asp.angle) < orb,
          });
          break;
        }
      }
    }
  }
  return out.sort((x, y) => x.orb - y.orb);
}

function tally(points) {
  const elements = { fire: 0, earth: 0, air: 0, water: 0 };
  const modalities = { cardinal: 0, fixed: 0, mutable: 0 };
  for (const p of points) {
    if (!['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'asc'].includes(p.key)) continue;
    elements[p.element] += 1;
    modalities[p.modality] += 1;
  }
  return { elements, modalities };
}

function parseDate(date) {
  const m = /^(-?\d{1,4})-(\d{2})-(\d{2})$/.exec(String(date ?? ''));
  if (!m) throw new InputError('date must be YYYY-MM-DD');
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (month < 1 || month > 12 || day < 1 || day > 31) throw new InputError('date is out of range');
  if (year < 1800 || year > 2399) throw new InputError('date must be between 1800 and 2399');
  return { year, month, day };
}

function parseTime(time) {
  if (time === null || time === undefined || time === '') return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(time));
  if (!m) throw new InputError('time must be HH:MM');
  const [hour, minute, second] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
  if (hour > 23 || minute > 59 || second > 59) throw new InputError('time is out of range');
  return { hour, minute, second };
}

export class InputError extends Error {}

/**
 * Compute a natal chart.
 * @param {{date:string, time?:string|null, lat:number, lon:number, timezone?:string, houseSystem?:string, name?:string}} input
 */
export function computeChart(input) {
  const date = parseDate(input.date);
  const time = parseTime(input.time);
  const lat = Number(input.lat), lon = Number(input.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new InputError('lat/lon are required');
  }
  const timezone = input.timezone || timezoneFor(lat, lon);
  const timeKnown = time !== null;
  const local = { ...date, ...(time ?? { hour: 12, minute: 0, second: 0 }) };
  const conv = localToUtc(local, timezone);
  const u = conv.utc;
  const jd = sweph.utc_to_jd(u.year, u.month, u.day, u.hour, u.minute, u.second, C.SE_GREG_CAL);
  if (jd.flag !== C.OK) throw new Error(jd.error);
  const jdUt = jd.data[1];

  const flags = C.SEFLG_SWIEPH | C.SEFLG_SPEED;
  const points = [];
  for (const [key, id] of BODIES) {
    const r = sweph.calc_ut(jdUt, id, flags);
    if (r.flag < 0) throw new Error(r.error);
    const [lonDeg, latDeg, , speed] = r.data;
    points.push({ key, ...describe(lonDeg), latitude: latDeg, speed, retrograde: speed < 0 && key !== 'northNode' && key !== 'lilith' });
  }
  const nn = points.find((p) => p.key === 'northNode');
  points.splice(points.indexOf(nn) + 1, 0, { key: 'southNode', ...describe(nn.longitude + 180), latitude: -nn.latitude, speed: nn.speed, retrograde: false });

  let houses = null, angles = null, houseSystem = null, notes = [];
  if (timeKnown) {
    const requested = HOUSE_SYSTEMS[input.houseSystem] ?? 'P';
    let h = sweph.houses_ex2(jdUt, 0, lat, lon, requested);
    houseSystem = Object.keys(HOUSE_SYSTEMS).find((k) => HOUSE_SYSTEMS[k] === requested);
    if (h.flag !== C.OK) {
      // Placidus/Koch are undefined near the poles; fall back to Porphyry.
      h = sweph.houses_ex2(jdUt, 0, lat, lon, 'O');
      houseSystem = 'porphyry';
      notes.push('house-system-fallback');
    }
    const cusps = h.data.houses.slice(0, 12);
    const [ascLon, mcLon] = h.data.points;
    const [ascSpeed, mcSpeed] = h.data.pointsSpeed ?? [0, 0];
    houses = cusps.map((c, i) => ({ house: i + 1, ...describe(c) }));
    angles = {
      asc: { key: 'asc', ...describe(ascLon), speed: ascSpeed },
      mc: { key: 'mc', ...describe(mcLon), speed: mcSpeed },
      dsc: { key: 'dsc', ...describe(ascLon + 180) },
      ic: { key: 'ic', ...describe(mcLon + 180) },
    };
    for (const p of points) p.house = houseOf(p.longitude, cusps);
  } else {
    notes.push('time-unknown');
  }

  const aspectPoints = angles ? [...points, angles.asc, angles.mc] : points;
  const aspects = findAspects(aspectPoints);
  const moon = points.find((p) => p.key === 'moon');
  const sun = points.find((p) => p.key === 'sun');

  return {
    name: input.name ? String(input.name).slice(0, 80) : null,
    input: { date: input.date, time: timeKnown ? input.time : null, lat, lon, timezone },
    utc: { ...u, offsetSeconds: conv.offsetSeconds, isDst: conv.isDst, abbreviation: conv.abbreviation },
    julianDayUt: jdUt,
    timeKnown,
    houseSystem,
    points,
    angles,
    houses,
    aspects,
    ...tally(angles ? [...points, angles.asc] : points),
    bigThree: { sun: sun.sign, moon: moon.sign, rising: angles ? angles.asc.sign : null },
    // Without a birth time the Moon can move ~13° in a day; flag a possible sign change.
    moonSignUncertain: !timeKnown && (moon.degree < 7 || moon.degree >= 23),
    warnings: [conv.warning, ...notes].filter(Boolean),
    engine: { name: 'Swiss Ephemeris', version: sweph.version(), license: 'AGPL-3.0' },
  };
}

/** Synastry: cross-aspects plus where each person's planets fall in the other's houses. */
export function synastry(a, b) {
  const pts = (c) => (c.angles ? [...c.points, c.angles.asc, c.angles.mc] : c.points).filter((p) => p.key !== 'southNode');
  return {
    aspects: findAspects(pts(a), pts(b)),
    aInB: b.houses ? a.points.map((p) => ({ key: p.key, house: houseOf(p.longitude, b.houses.map((h) => h.longitude)) })) : null,
    bInA: a.houses ? b.points.map((p) => ({ key: p.key, house: houseOf(p.longitude, a.houses.map((h) => h.longitude)) })) : null,
  };
}

/** Composite chart by the midpoint method. */
export function composite(a, b) {
  const points = a.points.map((p) => {
    const q = b.points.find((x) => x.key === p.key);
    return { key: p.key, ...describe(midpoint(p.longitude, q.longitude)), speed: ((p.speed ?? 0) + (q.speed ?? 0)) / 2 };
  });
  // Keep the nodes opposite each other.
  const nn = points.find((p) => p.key === 'northNode');
  Object.assign(points.find((p) => p.key === 'southNode'), describe(nn.longitude + 180));
  let houses = null, angles = null;
  if (a.houses && b.houses) {
    houses = a.houses.map((h, i) => ({ house: i + 1, ...describe(midpoint(h.longitude, b.houses[i].longitude)) }));
    const asc = midpoint(a.angles.asc.longitude, b.angles.asc.longitude);
    const mc = midpoint(a.angles.mc.longitude, b.angles.mc.longitude);
    angles = {
      asc: { key: 'asc', ...describe(asc), speed: 0 }, mc: { key: 'mc', ...describe(mc), speed: 0 },
      dsc: { key: 'dsc', ...describe(asc + 180) }, ic: { key: 'ic', ...describe(mc + 180) },
    };
    const cusps = houses.map((h) => h.longitude);
    for (const p of points) p.house = houseOf(p.longitude, cusps);
  }
  return {
    method: 'midpoint',
    points, angles, houses,
    aspects: findAspects(angles ? [...points, angles.asc, angles.mc] : points),
    ...tally(angles ? [...points, angles.asc] : points),
  };
}
