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

/**
 * Search places by name. Optional "City, CC" narrows by country code.
 * @returns {Array<{id:number,name:string,country:string,countryName:string,lat:number,lon:number,timezone:string,population:number}>}
 */
export function searchPlaces(query, { limit = 8, lang = 'en' } = {}) {
  let q = String(query ?? '');
  let country = null;
  const m = q.match(/^(.*),\s*([A-Za-z]{2})\s*$/);
  if (m) { q = m[1]; country = m[2].toUpperCase(); }
  q = fold(q);
  if (q.length < 2) return [];
  const names = new Intl.DisplayNames([lang], { type: 'region' });
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
