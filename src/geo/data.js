import { feature, neighbors } from "topojson-client";

/**
 * Geo layer: loads the Natural Earth topology (countries + states/provinces +
 * populated places, built by scripts/build-geo.mjs) and indexes it for
 * point-in-polygon picking, search, and the region panel.
 *
 * Everything here is plain data + math — no Three.js, no React.
 */

const EARTH_R_KM = 6371.0088;

/** @typedef {[number, number][]} Ring  lng/lat pairs */

/**
 * @typedef {object} Region
 * @property {"country"|"state"} kind
 * @property {string} id
 * @property {string} name
 * @property {object} p           raw short-key properties (see build-geo.mjs)
 * @property {Ring[][]} polys     polygons → rings (first ring = outer)
 * @property {number[]} bbox      [minLng, minLat, maxLng, maxLat]
 * @property {number} area        km²
 * @property {{lat:number,lng:number}} label
 * @property {Region[]} neighbors
 */

export async function loadGeo(base = import.meta.env.BASE_URL) {
  const [topo, places] = await Promise.all([
    fetch(`${base}geo/world.topo.json`).then((r) => r.json()),
    fetch(`${base}geo/places.json`).then((r) => r.json()),
  ]);
  return buildGeo(topo, places);
}

export function buildGeo(topo, placesRaw) {
  const countries = toRegions(topo, "countries", "country");
  const states = toRegions(topo, "states", "state");

  const countryById = new Map(countries.map((c) => [c.id, c]));
  const stateById = new Map(states.map((s) => [s.id, s]));

  // Children + parent links.
  for (const c of countries) c.states = [];
  for (const s of states) {
    s.country = countryById.get(s.p.c) || null;
    s.country?.states.push(s);
  }
  for (const c of countries) c.states.sort((a, b) => a.name.localeCompare(b.name));

  // Places → objects; capital + largest cities per country.
  const places = placesRaw.rows.map((r, i) => ({
    i,
    name: r[0],
    lat: r[1],
    lng: r[2],
    c: r[3],
    adm1: r[4],
    pop: r[5],
    cap: r[6],
    rank: r[7],
  }));
  const placesByCountry = new Map();
  for (const pl of places) {
    if (!placesByCountry.has(pl.c)) placesByCountry.set(pl.c, []);
    placesByCountry.get(pl.c).push(pl); // rows are pre-sorted by population
  }
  for (const c of countries) {
    c.places = placesByCountry.get(c.id) || [];
    c.capital = c.places.find((pl) => pl.cap === 2) || null;
  }

  return {
    topo,
    countries,
    states,
    places,
    countryById,
    stateById,
    /** Country (and state, when one contains the point) at a lat/lng. */
    locate(lat, lng) {
      const country = pick(countries, lng, lat);
      const state = country ? pick(country.states, lng, lat) : null;
      return { country, state };
    },
    /**
     * Places inside a state, resolved by point-in-polygon (Natural Earth's
     * adm1name doesn't always match the admin-1 name), cached per state.
     */
    placesInState(state) {
      if (state._places) return state._places;
      const c = state.country;
      if (c && !c._placesIndexed) {
        for (const s of c.states) s._places = [];
        for (const pl of c.places) {
          const s = pick(c.states, pl.lng, pl.lat);
          if (s) s._places.push(pl);
        }
        c._placesIndexed = true;
      }
      state._places ||= [];
      return state._places;
    },
  };
}

function toRegions(topo, key, kind) {
  const geoms = topo.objects[key].geometries;
  const fc = feature(topo, topo.objects[key]);
  const regions = fc.features.map((f, i) => {
    const p = geoms[i].properties;
    const polys =
      f.geometry?.type === "Polygon"
        ? [f.geometry.coordinates]
        : f.geometry?.type === "MultiPolygon"
          ? f.geometry.coordinates
          : [];
    const bbox = [180, 90, -180, -90];
    const polyBoxes = polys.map((poly) => {
      const b = ringBox(poly[0]);
      bbox[0] = Math.min(bbox[0], b[0]);
      bbox[1] = Math.min(bbox[1], b[1]);
      bbox[2] = Math.max(bbox[2], b[2]);
      bbox[3] = Math.max(bbox[3], b[3]);
      return b;
    });
    const area = polys.reduce(
      (sum, poly) =>
        sum + Math.abs(ringArea(poly[0])) - poly.slice(1).reduce((h, r) => h + Math.abs(ringArea(r)), 0),
      0,
    );
    return {
      kind,
      id: p.id,
      name: p.n || p.en || p.id,
      p,
      polys,
      polyBoxes,
      bbox,
      area,
      label: { lat: p.ly, lng: p.lx },
      neighbors: [],
    };
  });
  // Shared-border neighbours straight from the topology.
  const nb = neighbors(geoms);
  regions.forEach((r, i) => {
    r.neighbors = nb[i].map((j) => regions[j]).sort((a, b) => b.area - a.area);
  });
  return regions;
}

function ringBox(ring) {
  const b = [180, 90, -180, -90];
  for (const [x, y] of ring) {
    if (x < b[0]) b[0] = x;
    if (y < b[1]) b[1] = y;
    if (x > b[2]) b[2] = x;
    if (y > b[3]) b[3] = y;
  }
  return b;
}

/** Spherical ring area in km² (Chamberlain & Duquette, as used by geojson-area). */
function ringArea(ring) {
  let a = 0;
  const rad = Math.PI / 180;
  for (let i = 0, n = ring.length; i < n - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    a += (x2 - x1) * rad * (2 + Math.sin(y1 * rad) + Math.sin(y2 * rad));
  }
  return (a * EARTH_R_KM * EARTH_R_KM) / 2;
}

function inRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function regionContains(r, lng, lat) {
  if (lng < r.bbox[0] || lng > r.bbox[2] || lat < r.bbox[1] || lat > r.bbox[3]) return false;
  for (let k = 0; k < r.polys.length; k++) {
    const b = r.polyBoxes[k];
    if (lng < b[0] || lng > b[2] || lat < b[1] || lat > b[3]) continue;
    const poly = r.polys[k];
    if (!inRing(poly[0], lng, lat)) continue;
    let hole = false;
    for (let h = 1; h < poly.length; h++) if (inRing(poly[h], lng, lat)) hole = true;
    if (!hole) return true;
  }
  return false;
}

function pick(list, lng, lat) {
  for (const r of list) if (regionContains(r, lng, lat)) return r;
  return null;
}

/**
 * Where to point the camera for a region: its label point, and a camera
 * distance that fits the polygon containing it (so the USA frames the lower 48,
 * France frames the mainland, not French Guiana).
 */
export function regionView(r) {
  const { lat, lng } = r.label;
  let k = r.polys.findIndex((poly, i) => {
    const b = r.polyBoxes[i];
    return lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3] && inRing(poly[0], lng, lat);
  });
  if (k < 0) {
    // Fall back to the biggest part.
    let best = -1;
    r.polys.forEach((poly, i) => {
      const a = Math.abs(ringArea(poly[0]));
      if (a > best) {
        best = a;
        k = i;
      }
    });
  }
  let maxAng = 0;
  const box = r.polyBoxes[k] || r.bbox;
  // Angular radius: farthest bbox corner/edge-midpoint from the centre.
  const pts = [
    [box[0], box[1]], [box[2], box[1]], [box[0], box[3]], [box[2], box[3]],
    [(box[0] + box[2]) / 2, box[1]], [(box[0] + box[2]) / 2, box[3]],
    [box[0], (box[1] + box[3]) / 2], [box[2], (box[1] + box[3]) / 2],
  ];
  for (const [x, y] of pts) maxAng = Math.max(maxAng, angularDist(lat, lng, y, x));
  // Antarctica / Russia-sized regions get capped so we never leave the globe.
  const ang = Math.min(maxAng, 1.1);
  const dist = Math.max(1.16, Math.min(3.1, 1 + ang * 2.9 + 0.07));
  return { lat, lng, dist };
}

export function angularDist(lat1, lng1, lat2, lng2) {
  const r = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

// ── Formatting helpers used by the UI ─────────────────────────────────────────

export function flagEmoji(a2) {
  if (!a2 || !/^[A-Z]{2}$/.test(a2)) return "🏳️";
  return String.fromCodePoint(...[...a2].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

export function fmtCompact(n) {
  if (!n && n !== 0) return "—";
  if (n >= 1e12) return `${(n / 1e12).toFixed(n >= 1e13 ? 0 : 1)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
  return String(Math.round(n));
}

export function fmtArea(km2) {
  if (km2 >= 1e6) return `${(km2 / 1e6).toFixed(2)}M km²`;
  if (km2 >= 1e4) return `${Math.round(km2 / 1e3).toLocaleString()}K km²`;
  return `${Math.round(km2).toLocaleString()} km²`;
}

export function fmtLatLng(lat, lng) {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${ns} · ${Math.abs(lng).toFixed(2)}°${ew}`;
}

/** "4. Lower middle income" → "Lower middle income" */
export function stripRank(s) {
  return (s || "").replace(/^\d+\.\s*/, "");
}

/** Most common subdivision type, e.g. {label:"47 Prefectures"}. */
export function subdivisionSummary(country) {
  const counts = new Map();
  for (const s of country.states) counts.set(s.p.t || "Region", (counts.get(s.p.t || "Region") || 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return sorted.map(([t, n]) => `${n} ${n === 1 ? t : pluralize(t)}`);
}

function pluralize(t) {
  if (/y$/i.test(t) && !/[aeiou]y$/i.test(t)) return t.slice(0, -1) + "ies";
  if (/(s|x|ch|sh)$/i.test(t)) return t + "es";
  return t + "s";
}
