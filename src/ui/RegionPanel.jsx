import { useMemo, useState } from "react";
import { flagEmoji, fmtArea, fmtCompact, fmtLatLng, stripRank, subdivisionSummary } from "../geo/data.js";

/**
 * Detail panel for the selected country or state/province (+ optional focused
 * place). All figures come from Natural Earth (population, GDP, ISO codes,
 * subdivision types, capitals, cities) or are computed from the geometry
 * (area, density, shared-border neighbours).
 */
export default function RegionPanel({ geo, sel, dreams, onCountry, onState, onCity, onDream, onUp, onClose, onPinHere }) {
  const { country, state, place } = sel;
  const region = state || country;
  if (!region) return null;
  return (
    <aside className="glass panel" key={region.id}>
      <div className="panel-top">
        <nav className="crumbs" aria-label="Breadcrumb">
          <button onClick={onClose}>World</button>
          <span>›</span>
          {state ? (
            <>
              <button onClick={() => onCountry(country)}>
                {flagEmoji(country.p.a2)} {country.name}
              </button>
              <span>›</span>
              <b>{state.name}</b>
            </>
          ) : (
            <b>{country.p.ct}</b>
          )}
        </nav>
        <div className="panel-actions">
          {state && (
            <button className="icon-btn" onClick={onUp} title="Back to country (Esc)">
              ↑
            </button>
          )}
          <button className="icon-btn" onClick={onClose} title="Close">
            ×
          </button>
        </div>
      </div>
      <div className="panel-scroll">
        {place && <PlaceCallout place={place} />}
        {state ? (
          <StateBody {...{ geo, state, place, dreams, onState, onCity, onDream, onCountry }} />
        ) : (
          <CountryBody {...{ geo, country, place, dreams, onCountry, onState, onCity, onDream }} />
        )}
      </div>
      <div className="panel-foot">
        <button className="cta cta-sm" onClick={() => onPinHere(region)}>
          <span>✦</span> Pin a dream {region.name.length > 20 ? "here" : `in ${region.name}`}
        </button>
      </div>
    </aside>
  );
}

function PlaceCallout({ place }) {
  const time = useMemo(() => {
    if (!place.timezone) return null;
    try {
      return new Intl.DateTimeFormat("en-GB", { timeZone: place.timezone, hour: "2-digit", minute: "2-digit" }).format(new Date());
    } catch {
      return null;
    }
  }, [place.timezone]);
  return (
    <div className="callout">
      <div className="callout-dot" />
      <div>
        <div className="callout-title">{place.name}</div>
        <div className="mono dim">
          {fmtLatLng(place.lat, place.lng)}
          {place.pop ? ` · pop ${fmtCompact(place.pop)}` : ""}
          {place.elevation != null ? ` · ${Math.round(place.elevation)} m` : ""}
          {time ? ` · ${time} local` : ""}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function Section({ title, count, children, action }) {
  return (
    <section className="sec">
      <div className="sec-head">
        <span>
          {title}
          {count != null && <em>{count}</em>}
        </span>
        {action}
      </div>
      {children}
    </section>
  );
}

function CountryBody({ geo, country, dreams, onCountry, onState, onCity, onDream }) {
  const p = country.p;
  const [filter, setFilter] = useState("");
  const density = p.pop && country.area ? p.pop / country.area : null;
  const perCap = p.gdp && p.pop ? (p.gdp * 1e6) / p.pop : null;
  const here = dreams.filter((d) => d._cid === country.id);
  const dreamCountByState = useMemo(() => {
    const m = new Map();
    for (const d of here) if (d._sid) m.set(d._sid, (m.get(d._sid) || 0) + 1);
    return m;
  }, [here]);
  const subs = subdivisionSummary(country);
  const multi = country.states.length > 1;
  const q = filter.trim().toLowerCase();
  const states = q
    ? country.states.filter((s) => [s.name, s.p.zh, s.p.loc, s.p.iso].some((k) => k && k.toLowerCase().includes(q)))
    : country.states;
  const cities = country.places.slice(0, 8);

  return (
    <>
      <header className="region-head">
        <div className="flag">{flagEmoji(p.a2)}</div>
        <div>
          <h2>{country.name}</h2>
          <div className="mono dim">
            {[p.zh, p.f && p.f !== country.name ? p.f : null].filter(Boolean).join(" · ")}
          </div>
        </div>
      </header>
      <div className="tags">
        <span className="tag">{p.sr || p.ct}</span>
        {p.a3 && p.a3 !== "-99" && <span className="tag mono">{p.a2} · {p.a3}</span>}
        {p.sov && p.sov !== country.name && <span className="tag">↳ {p.sov}</span>}
      </div>
      <div className="stats">
        <Stat label="Population" value={fmtCompact(p.pop)} sub={p.py ? `est. ${p.py}` : null} />
        <Stat label="Area" value={fmtArea(country.area)} />
        <Stat label="Density" value={density ? `${density < 10 ? density.toFixed(1) : Math.round(density).toLocaleString()}/km²` : "—"} />
        <Stat label="GDP" value={p.gdp ? `$${fmtCompact(p.gdp * 1e6)}` : "—"} sub={p.gy ? `${p.gy}` : null} />
        <Stat label="GDP / capita" value={perCap ? `$${fmtCompact(perCap)}` : "—"} />
        <Stat
          label="Capital"
          value={
            country.capital ? (
              <button className="link" onClick={() => onCity(country.capital)}>
                {country.capital.name}
              </button>
            ) : (
              "—"
            )
          }
        />
      </div>
      <dl className="facts">
        {p.inc && (
          <>
            <dt>Income</dt>
            <dd>{stripRank(p.inc)}</dd>
          </>
        )}
        {p.eco && (
          <>
            <dt>Economy</dt>
            <dd>{stripRank(p.eco)}</dd>
          </>
        )}
        {multi && (
          <>
            <dt>Divisions</dt>
            <dd>{subs.join(", ")}</dd>
          </>
        )}
        <dt>Centre</dt>
        <dd className="mono">{fmtLatLng(country.label.lat, country.label.lng)}</dd>
      </dl>

      {country.neighbors.length > 0 && (
        <Section title="Borders" count={country.neighbors.length}>
          <div className="chips">
            {country.neighbors.map((n) => (
              <button key={n.id} className="chip" onClick={() => onCountry(n)}>
                {flagEmoji(n.p.a2)} {n.name}
              </button>
            ))}
          </div>
        </Section>
      )}

      {here.length > 0 && <DreamList dreams={here} onDream={onDream} />}

      {multi && (
        <Section
          title={subs[0]?.replace(/^\d+\s/, "") || "Regions"}
          count={country.states.length}
          action={
            country.states.length > 8 && (
              <input className="fld mini-filter" placeholder="filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            )
          }
        >
          <div className="rows">
            {states.map((s) => (
              <button key={s.id} className="row" onClick={() => onState(s)}>
                <span className="row-name">
                  {s.name}
                  {s.p.zh && <i>{s.p.zh}</i>}
                </span>
                <span className="row-meta">
                  {dreamCountByState.get(s.id) ? <b className="dream-pip">✦{dreamCountByState.get(s.id)}</b> : null}
                  {fmtArea(s.area)}
                </span>
              </button>
            ))}
            {!states.length && <div className="dim mono pad">No match</div>}
          </div>
        </Section>
      )}

      {cities.length > 0 && (
        <Section title="Largest cities" count={country.places.length > 8 ? `${country.places.length}` : null}>
          <CityRows cities={cities} geo={geo} onCity={onCity} />
        </Section>
      )}
    </>
  );
}

function StateBody({ geo, state, place, dreams, onState, onCity, onDream, onCountry }) {
  const p = state.p;
  const country = state.country;
  const cities = geo.placesInState(state);
  const capital = cities.find((c) => c.cap === 2) || cities.find((c) => c.cap === 1);
  const share = country?.area ? (state.area / country.area) * 100 : null;
  const here = dreams.filter((d) => d._sid === state.id);
  const inside = state.neighbors.filter((n) => n.p.c === p.c);
  const across = state.neighbors.filter((n) => n.p.c !== p.c);
  const altNames = [p.loc && p.loc !== state.name ? p.loc : null, p.zh, p.en && p.en !== state.name ? p.en : null].filter(Boolean);
  const rank = country ? [...country.states].sort((a, b) => b.area - a.area).indexOf(state) + 1 : null;

  return (
    <>
      <header className="region-head">
        <div className="flag">{flagEmoji(country?.p.a2)}</div>
        <div>
          <h2>{state.name}</h2>
          <div className="mono dim">{altNames.join(" · ") || `${p.t || "Region"} of ${country?.name}`}</div>
        </div>
      </header>
      <div className="tags">
        <span className="tag">{p.t || "Region"}</span>
        {p.iso && <span className="tag mono">{p.iso}</span>}
        {p.rg && <span className="tag">{p.rg}</span>}
      </div>
      <div className="stats">
        <Stat label="Area" value={fmtArea(state.area)} sub={rank ? `#${rank} of ${country.states.length}` : null} />
        <Stat label="Share of country" value={share != null ? `${share < 1 ? share.toFixed(2) : share.toFixed(1)}%` : "—"} />
        <Stat
          label={capital?.cap === 2 ? "National capital" : "Capital"}
          value={
            capital ? (
              <button className="link" onClick={() => onCity(capital)}>
                {capital.name}
              </button>
            ) : (
              "—"
            )
          }
        />
        <Stat label="Postal / code" value={p.pc || "—"} />
        <Stat label="Mapped cities" value={cities.length || "—"} sub={cities[0] ? `largest ${cities[0].name}` : null} />
        <Stat label="Dreams" value={here.length} />
      </div>
      <dl className="facts">
        <dt>Country</dt>
        <dd>
          <button className="link" onClick={() => onCountry(country)}>
            {flagEmoji(country?.p.a2)} {country?.name}
          </button>
        </dd>
        <dt>Centre</dt>
        <dd className="mono">{fmtLatLng(state.label.lat, state.label.lng)}</dd>
      </dl>

      {here.length > 0 && <DreamList dreams={here} onDream={onDream} />}

      {inside.length > 0 && (
        <Section title="Neighbouring" count={inside.length}>
          <div className="chips">
            {inside.map((n) => (
              <button key={n.id} className="chip" onClick={() => onState(n)}>
                {n.name}
              </button>
            ))}
          </div>
        </Section>
      )}
      {across.length > 0 && (
        <Section title="Across the border" count={across.length}>
          <div className="chips">
            {across.map((n) => (
              <button key={n.id} className="chip" onClick={() => onState(n)}>
                {flagEmoji(n.country?.p.a2)} {n.name}
              </button>
            ))}
          </div>
        </Section>
      )}

      {cities.length > 0 && (
        <Section title="Cities" count={cities.length}>
          <CityRows cities={cities.slice(0, 12)} geo={geo} onCity={onCity} activeName={place?.name} />
        </Section>
      )}
    </>
  );
}

function CityRows({ cities, onCity, activeName }) {
  const max = Math.max(...cities.map((c) => c.pop || 0), 1);
  return (
    <div className="rows">
      {cities.map((c) => (
        <button key={c.i} className={`row city-row${activeName === c.name ? " active" : ""}`} onClick={() => onCity(c)}>
          <span className="row-name">
            {c.cap === 2 ? "★ " : c.cap === 1 ? "◆ " : ""}
            {c.name}
          </span>
          <span className="row-meta">{c.pop ? fmtCompact(c.pop) : ""}</span>
          <span className="bar" style={{ width: `${Math.max(3, ((c.pop || 0) / max) * 100)}%` }} />
        </button>
      ))}
    </div>
  );
}

function DreamList({ dreams, onDream }) {
  return (
    <Section title="Dreams here" count={dreams.length}>
      <div className="dream-list">
        {dreams.map((d, i) => (
          <button key={i} className="dream-mini" onClick={() => onDream(d)}>
            <span className="avatar sm">{d.name?.[0] || "?"}</span>
            <span>
              <b>
                {d.name}
                {d.age ? `, ${d.age}` : ""}
              </b>
              <span className="dream-mini-text">“{d.text}”</span>
            </span>
          </button>
        ))}
      </div>
    </Section>
  );
}
