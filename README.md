# Astrologybird chart engine

Small HTTP service that calculates astrological charts. Licensed **AGPL-3.0**
because it uses the Swiss Ephemeris (Astrodienst AG) under its AGPL licence.

## Endpoints

- `GET /api/places?q=Utrecht&lang=nl` — offline place search with IANA time zone
- `POST /api/chart` — `{ date: "1990-05-15", time: "12:30" | null, lat, lon, timezone?, houseSystem?: "placidus" | "wholeSign" | "koch" | "equal" | "porphyry", name? }`
- `POST /api/relationship` — `{ a: <chart input>, b: <chart input> }` → both charts, synastry (cross-aspects, house overlays) and a midpoint composite

## Accuracy notes

- Planets, nodes, Chiron, Pholus, Nessus and Lilith from the Swiss Ephemeris data files in `ephe/` (1800–2399). Nessus (minor planet 7066) uses `ephe/ast7/se07066s.se1` (Astrodienst, based on JPL DE441).
- Historical time zones come from `zoneinfo/`, compiled **with** the IANA backzone data,
  so e.g. Dutch births before 1940 use Amsterdam time (+00:19:32 / +00:20). The default
  tz data in browsers and Node merged Amsterdam into Brussels and gets these wrong.
- Placidus near the poles falls back to Porphyry.

## Data and licences

- Swiss Ephemeris © Astrodienst AG, AGPL-3.0 (see LICENSE).
- Place names: GeoNames (CC BY 4.0) via `all-the-cities`.
- Time zone boundaries: timezone-boundary-builder (ODbL) via `geo-tz`.
- IANA time zone database (public domain).

Set `SOURCE_URL` to the public repository URL; it is returned in responses.

```bash
npm install
npm start      # port 8787
npm test
```

## Deploy (Vercel)

Import this repository as its own Vercel project. The functions in `api/` serve
`/api/chart`, `/api/places` and `/api/relationship`. Set:

- `SOURCE_URL=https://github.com/AstrologyBird/astrologybird-chart-engine`
- `ALLOWED_ORIGINS=https://app.astrologybird.com,https://astrologybird.com,https://www.astrologybird.com`

The Astrologybird portal (private) calls this service over HTTP via `CHART_ENGINE_URL`.
