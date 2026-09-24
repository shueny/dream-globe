import { flagEmoji, fmtCompact } from "../geo/data.js";

/**
 * Offline search over dreams, countries, states/provinces and ~7k cities.
 * Open-Meteo geocoding streams in on top of this (see Search.jsx), so the
 * globe still searches the whole planet — and still works offline.
 */

export const norm = (s) =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

function score(keys, q) {
  let best = 0;
  for (const k of keys) {
    if (!k) continue;
    if (k === q) return 100;
    if (k.startsWith(q)) best = Math.max(best, 70 - Math.min(20, k.length - q.length));
    else if (k.includes(` ${q}`) || k.includes(`-${q}`)) best = Math.max(best, 45);
    else if (q.length >= 3 && k.includes(q)) best = Math.max(best, 25);
  }
  return best;
}

export function buildSearchIndex(geo) {
  const items = [];
  for (const c of geo.countries) {
    items.push({
      type: "country",
      ref: c,
      keys: [c.name, c.p.nl, c.p.f, c.p.zh, c.p.sov, c.p.a3, c.p.a2].map(norm),
      title: `${flagEmoji(c.p.a2)}  ${c.name}`,
      sub: `Country · ${c.p.sr || c.p.ct || ""}`,
      bonus: 12 - (c.p.lr || 5),
    });
  }
  for (const s of geo.states) {
    if (!s.country || s.country.states.length < 2) continue;
    items.push({
      type: "state",
      ref: s,
      keys: [s.name, s.p.en, s.p.loc, s.p.zh, s.p.iso].map(norm),
      title: s.name,
      sub: `${s.p.t || "Region"} · ${s.country.name}`,
      bonus: 4 - (s.p.lr || 6) * 0.4,
    });
  }
  for (const pl of geo.places) {
    const c = geo.countryById.get(pl.c);
    items.push({
      type: "city",
      ref: pl,
      keys: [norm(pl.name)],
      title: pl.name,
      sub: `${pl.cap === 2 ? "Capital" : "City"} · ${[pl.adm1, c?.name].filter(Boolean).join(", ")}${pl.pop ? ` · ${fmtCompact(pl.pop)}` : ""}`,
      bonus: Math.log10(pl.pop + 10) * 2.2 - 6 + (pl.cap === 2 ? 4 : 0),
    });
  }
  return items;
}

export function searchLocal(index, dreams, query, limit = 8) {
  const q = norm(query);
  if (!q) return [];
  const dreamHits = dreams
    .map((d) => ({ d, s: score([d.name, d.city, d.country, d.text].map(norm), q) }))
    .filter((x) => x.s >= 25)
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .map(({ d }) => ({
      type: "dream",
      ref: d,
      title: `✦ ${d.name}${d.age ? `, ${d.age}` : ""}`,
      sub: `${d.city} · ${d.country}`,
    }));
  const hits = [];
  for (const it of index) {
    const s = score(it.keys, q);
    if (s) hits.push({ it, s: s + it.bonus });
  }
  hits.sort((a, b) => b.s - a.s);
  const seen = new Set();
  const places = [];
  for (const { it } of hits) {
    const k = `${it.type}:${it.title}:${it.sub}`;
    if (seen.has(k)) continue;
    seen.add(k);
    places.push(it);
    if (places.length >= limit - dreamHits.length) break;
  }
  return [...dreamHits, ...places];
}
