// Historical time zone conversion from compiled TZif files.
//
// Why not Intl/luxon: since tzdata 2022b the default build merged several
// zones (Europe/Amsterdam now follows Europe/Brussels), which loses pre-1970
// history. Dutch births before May 1940 used Amsterdam time (+00:19:32,
// later +00:20). The zoneinfo folder in this package is compiled WITH the
// IANA "backzone" file, so those offsets are correct.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ZONEINFO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'zoneinfo');
const cache = new Map();

function parseTzif(buf) {
  if (buf.toString('ascii', 0, 4) !== 'TZif') throw new Error('Not a TZif file');
  const version = buf[4];
  const counts = (off) => ({
    isut: buf.readUInt32BE(off + 20),
    isstd: buf.readUInt32BE(off + 24),
    leap: buf.readUInt32BE(off + 28),
    time: buf.readUInt32BE(off + 32),
    type: buf.readUInt32BE(off + 36),
    char: buf.readUInt32BE(off + 40),
  });
  let off = 0;
  let c = counts(0);
  let timeSize = 4;
  if (version >= 0x32) {
    // Skip the v1 block and use the 64-bit v2+ block.
    off = 44 + c.time * 4 + c.time + c.type * 6 + c.char + c.leap * 8 + c.isstd + c.isut;
    c = counts(off);
    timeSize = 8;
  }
  let p = off + 44;
  const transitions = [];
  for (let i = 0; i < c.time; i++) {
    transitions.push(timeSize === 8 ? Number(buf.readBigInt64BE(p)) : buf.readInt32BE(p));
    p += timeSize;
  }
  const idx = [];
  for (let i = 0; i < c.time; i++) idx.push(buf[p++]);
  const types = [];
  for (let i = 0; i < c.type; i++) {
    types.push({ utoff: buf.readInt32BE(p), isdst: buf[p + 4] === 1, abbrIndex: buf[p + 5] });
    p += 6;
  }
  const chars = buf.toString('ascii', p, p + c.char);
  for (const t of types) t.abbr = chars.slice(t.abbrIndex, chars.indexOf('\0', t.abbrIndex));
  return { transitions, idx, types };
}

export function loadZone(name) {
  if (cache.has(name)) return cache.get(name);
  if (!/^[A-Za-z0-9_+\-]+(\/[A-Za-z0-9_+\-]+)*$/.test(name)) throw new Error(`Invalid time zone: ${name}`);
  const file = path.join(ZONEINFO, name);
  if (!existsSync(file)) throw new Error(`Unknown time zone: ${name}`);
  const zone = parseTzif(readFileSync(file));
  cache.set(name, zone);
  return zone;
}

/** Offset type in effect at a UTC instant (seconds since epoch). */
function typeAt(zone, utcSeconds) {
  const { transitions, idx, types } = zone;
  if (transitions.length === 0 || utcSeconds < transitions[0]) return types[0];
  let lo = 0, hi = transitions.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (transitions[mid] <= utcSeconds) lo = mid; else hi = mid - 1;
  }
  return types[idx[lo]];
}

/**
 * Convert a local wall-clock time in an IANA zone to UTC.
 * Returns the UTC date parts plus the offset used and a warning when the
 * local time does not exist (spring forward) or occurs twice (fall back).
 */
export function localToUtc({ year, month, day, hour, minute, second = 0 }, zoneName) {
  const zone = loadZone(zoneName);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second) / 1000;
  // Candidate offsets: those in effect around this wall time.
  const candidates = new Set([
    typeAt(zone, asUtc - 86400 / 2).utoff,
    typeAt(zone, asUtc).utoff,
    typeAt(zone, asUtc + 86400 / 2).utoff,
  ]);
  const valid = [];
  for (const utoff of candidates) {
    const utc = asUtc - utoff;
    const t = typeAt(zone, utc);
    if (t.utoff === utoff) valid.push({ utc, type: t });
  }
  let warning = null;
  let chosen;
  if (valid.length === 0) {
    // Non-existent local time (clocks jumped forward): use the offset before the jump.
    const t = typeAt(zone, asUtc - 86400 / 2);
    chosen = { utc: asUtc - t.utoff, type: t };
    warning = 'nonexistent-local-time';
  } else {
    valid.sort((a, b) => a.utc - b.utc);
    chosen = valid[0]; // ambiguous: take the first (summer-time) occurrence
    if (valid.length > 1) warning = 'ambiguous-local-time';
  }
  const d = new Date(chosen.utc * 1000);
  return {
    utc: {
      year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
      hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds(),
    },
    epochSeconds: chosen.utc,
    offsetSeconds: chosen.type.utoff,
    isDst: chosen.type.isdst,
    abbreviation: chosen.type.abbr,
    warning,
  };
}
