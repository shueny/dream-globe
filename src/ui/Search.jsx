import { useEffect, useRef, useState } from "react";
import { searchLocal, norm } from "./searchIndex.js";
import { flagEmoji, fmtCompact } from "../geo/data.js";

/**
 * Fly-to search: local matches (dreams ✦, countries, states, cities) render
 * instantly; Open-Meteo geocoding (free, no key, CORS) streams global results
 * after a 260ms debounce, with a stale-query guard.
 */
export default function Search({ index, dreams, onPick }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef(null);
  const latest = useRef("");
  const timer = useRef(null);

  // "/" focuses search from anywhere.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const run = (q) => {
    setQuery(q);
    latest.current = q;
    clearTimeout(timer.current);
    const local = index ? searchLocal(index, dreams, q) : [];
    setResults(local);
    setActive(0);
    setOpen(q.trim().length > 0);
    const ql = q.trim();
    if (ql.length < 2) {
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(ql)}&count=8&language=en&format=json`,
        );
        const j = await r.json();
        if (latest.current !== q) return; // stale
        const extra = (j.results || [])
          .filter(
            (g) =>
              !local.some(
                (l) =>
                  l.type === "city" &&
                  norm(l.ref.name) === norm(g.name) &&
                  Math.abs(l.ref.lat - g.latitude) < 0.6 &&
                  Math.abs(l.ref.lng - g.longitude) < 0.6,
              ),
          )
          .map((g) => ({
            type: "geo",
            ref: {
              name: g.name,
              lat: g.latitude,
              lng: g.longitude,
              admin1: g.admin1,
              country: g.country,
              cc: g.country_code,
              pop: g.population,
              elevation: g.elevation,
              timezone: g.timezone,
              feature: g.feature_code,
            },
            title: `${flagEmoji(g.country_code)}  ${g.name}`,
            sub: `${[g.admin1, g.country].filter(Boolean).join(", ")}${g.population ? ` · ${fmtCompact(g.population)}` : ""}`,
          }));
        setResults((prev) => [...prev, ...extra].slice(0, 12));
        setOpen(true);
      } catch {
        // Offline: local results already shown.
      } finally {
        if (latest.current === q) setSearching(false);
      }
    }, 260);
  };

  const pick = (r) => {
    if (!r) return;
    onPick(r);
    setOpen(false);
    setQuery("");
    latest.current = "";
    inputRef.current?.blur();
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const typeLabel = { dream: "dream", country: "country", state: "region", city: "city", geo: "place" };

  return (
    <form
      className="search"
      onSubmit={(e) => {
        e.preventDefault();
        pick(results[active]);
      }}
    >
      <div className="glass search-box">
        <div className={`search-icon${searching ? " busy" : ""}`} />
        <input
          ref={inputRef}
          className="fld"
          value={query}
          onChange={(e) => run(e.target.value)}
          onFocus={() => query && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={onKeyDown}
          placeholder="Fly to any country, state, city, or dream…"
          aria-label="Search places and dreams"
          spellCheck={false}
          autoComplete="off"
        />
        <kbd className="search-kbd">/</kbd>
      </div>
      {open && results.length > 0 && (
        <div className="glass search-results" role="listbox">
          {results.map((r, i) => (
            <div
              key={`${r.type}-${r.title}-${r.sub}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`search-row${i === active ? " active" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(r);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <div className={`search-dot t-${r.type}`} />
              <div className="search-text">
                <div className="search-title">{r.title}</div>
                <div className="search-sub">{r.sub}</div>
              </div>
              <span className="search-type">{typeLabel[r.type]}</span>
            </div>
          ))}
        </div>
      )}
      {open && !results.length && !searching && query.trim().length >= 2 && (
        <div className="glass search-results search-empty">No places match “{query}”</div>
      )}
    </form>
  );
}
