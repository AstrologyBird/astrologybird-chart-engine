// Offline place search: GeoNames cities with population > 1000
// (data CC BY 4.0, GeoNames.org, via the all-the-cities package)
// plus an offline coordinate -> IANA time zone lookup (geo-tz).

import { createRequire } from 'node:module';
// geo-tz/all keeps pre-1970 zones (e.g. Europe/Amsterdam) instead of merging them.
import { find as findTimezones } from 'geo-tz/all';

const require = createRequire(import.meta.url);
let index = null;

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

function getIndex() {
  if (!index) {
    const cities = require('all-the-cities');
    index = cities.map((c) => ({ c, key: fold(c.name), alt: c.altName ? fold(c.altName) : '' }));
  }
  return index;
}

export function timezoneFor(lat, lon) {
  const zones = findTimezones(lat, lon);
  return zones[0] ?? 'Etc/UTC';
}

// Country names (English and Dutch) and a few common aliases -> ISO code,
// so "Naarden netherlands" or "Naarden, Nederland" narrows by country.
let countryIndex = null;
const ALIASES = {
  holland: 'NL', nederland: 'NL', 'the netherlands': 'NL', usa: 'US', 'united states of america': 'US', america: 'US',
  uk: 'GB', england: 'GB', scotland: 'GB', wales: 'GB', 'great britain': 'GB', britain: 'GB',
  belgie: 'BE', duitsland: 'DE', frankrijk: 'FR', spanje: 'ES', italie: 'IT', engeland: 'GB',
};
function getCountryIndex() {
  if (!countryIndex) {
    countryIndex = new Map(Object.entries(ALIASES));
    const codes = new Set(getIndex().map((e) => e.c.country));
    for (const lang of ['en', 'nl', 'de', 'fr', 'es']) {
      const names = new Intl.DisplayNames([lang], { type: 'region' });
      for (const code of codes) {
        try { const n = names.of(code); if (n && n !== code) countryIndex.set(fold(n), code); } catch { /* skip */ }
      }
    }
  }
  return countryIndex;
}

/** Split "Town, Country" / "Town country" / "Town, CC" into [town, code], or null. */
export function splitCountry(query) {
  const raw = String(query ?? '');
  const m = raw.match(/^(.*),\s*([A-Za-z]{2})\s*$/);
  if (m && fold(m[1])) return [m[1], m[2].toUpperCase()];
  const comma = raw.lastIndexOf(',');
  if (comma > 0) {
    const code = getCountryIndex().get(fold(raw.slice(comma + 1)));
    if (code && fold(raw.slice(0, comma))) return [raw.slice(0, comma), code];
  }
  const words = fold(raw).split(' ');
  for (let n = Math.min(4, words.length - 1); n >= 1; n--) {
    const code = getCountryIndex().get(words.slice(-n).join(' '));
    if (code) return [words.slice(0, -n).join(' '), code];
  }
  return null;
}

// Local names that GeoNames only lists under their English name.
const CITY_ALIASES = { 'den haag': 'the hague', 's gravenhage': 'the hague' };

function findMatches(q, country) {
  q = CITY_ALIASES[q] ?? q;
  const hits = [];
  for (const entry of getIndex()) {
    if (country && entry.c.country !== country) continue;
    let rank;
    if (entry.key === q) rank = 0;
    else if (entry.key.startsWith(q)) rank = 1;
    else if (entry.alt && entry.alt.split(' ').some((w) => w.startsWith(q))) rank = 2;
    else continue;
    hits.push({ rank, entry });
  }
  return hits;
}

/**
 * Search places by name. A country after the town ("Naarden netherlands",
 * "Naarden, NL", "Naarden, Nederland") narrows by country.
 * @returns {Array<{id:number,name:string,country:string,countryName:string,lat:number,lon:number,timezone:string,population:number}>}
 */
export function searchPlaces(query, { limit = 8, lang = 'en' } = {}) {
  let hits = [];
  const split = splitCountry(query);
  if (split) {
    const town = fold(split[0]);
    if (town.length >= 2) hits = findMatches(town, split[1]);
  }
  if (!hits.length) {
    const q = fold(query);
    if (q.length < 2) return [];
    hits = findMatches(q, null);
  }
  const names = new Intl.DisplayNames([lang], { type: 'region' });
  hits.sort((a, b) => a.rank - b.rank || b.entry.c.population - a.entry.c.population);
  return hits.slice(0, limit).map(({ entry: { c } }) => {
    const [lon, lat] = c.loc.coordinates;
    let countryName = c.country;
    try { countryName = names.of(c.country) ?? c.country; } catch { /* unknown code */ }
    return {
      id: c.cityId, name: c.name, country: c.country, countryName,
      lat, lon, timezone: timezoneFor(lat, lon), population: c.population,
    };
  });
}
