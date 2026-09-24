import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { initScene } from "./globe/scene.js";
import { dreams as sampleDreams, arcPairs } from "./data/dreams.js";
import { loadGeo, regionView, flagEmoji, fmtLatLng } from "./geo/data.js";
import { buildSearchIndex } from "./ui/searchIndex.js";
import Search from "./ui/Search.jsx";
import RegionPanel from "./ui/RegionPanel.jsx";

/**
 * React wrapper around the pure Three.js scene.
 *
 * React owns only UI state (tooltip, open card, selection, counter, placing,
 * modal) and the lifecycle. Every Three.js object lives in the scene ctx, never
 * in state. Communication is: scene → React via on* callbacks; React → scene
 * via the imperative ctx methods held in ctxRef.
 *
 * Public API is exposed two ways:
 *  - imperatively via ref (useImperativeHandle) — the idiomatic React surface
 *  - globally via window.DreamGlobe — set inside the scene
 */

// Guided tour for demos: countries, states and cities around the world.
const TOUR = [
  { country: "JPN" },
  { state: "Tokyo" , in: "JPN" },
  { country: "TWN" },
  { country: "USA" },
  { state: "California", in: "USA" },
  { country: "BRA" },
  { country: "FRA" },
  { state: "Bavaria", in: "DEU" },
  { country: "KEN" },
  { country: "IND" },
  { state: "New South Wales", in: "AUS" },
];

const EMPTY_SEL = { country: null, state: null, place: null };

const DreamGlobe = forwardRef(function DreamGlobe(_props, ref) {
  const mountRef = useRef(null);
  const ctxRef = useRef(null);
  // The live dream list — shared with the scene, which appends to it.
  const dreamsRef = useRef(null);
  if (!dreamsRef.current) dreamsRef.current = sampleDreams.map((d) => ({ ...d }));

  const [texReady, setTexReady] = useState(false);
  const [geo, setGeo] = useState(null);
  const [geoError, setGeoError] = useState(false);
  const [tip, setTip] = useState(null);
  const [card, setCard] = useState(null);
  const [sel, setSel] = useState(EMPTY_SEL);
  const [added, setAdded] = useState(0);
  const [placing, setPlacing] = useState(false);
  const [pending, setPending] = useState(null); // coords + locate() awaiting the modal
  const [form, setForm] = useState({ name: "", text: "" });
  const [zoom, setZoom] = useState(3);
  const [touring, setTouring] = useState(false);
  const readoutRef = useRef(null);

  // Latest handlers for the scene's (mount-once) callbacks.
  const handlers = useRef({});

  // ── Scene lifecycle ───────────────────────────────────────────────────────
  useEffect(() => {
    const ctx = initScene(mountRef.current, {
      dreams: dreamsRef.current,
      arcPairs,
      onHover: (t) => handlers.current.hover(t),
      onSelect: (d) => handlers.current.dream(d),
      onCount: setAdded,
      onPlace: (hit) => handlers.current.place(hit),
      onRegionClick: (hit) => handlers.current.region(hit),
      onBackgroundClick: () => handlers.current.background(),
      onPointer: (ll) => {
        if (readoutRef.current) readoutRef.current.textContent = ll ? fmtLatLng(ll.lat, ll.lng) : "";
      },
      onReady: () => setTexReady(true),
      onZoom: setZoom,
    });
    ctxRef.current = ctx;
    return () => {
      ctx.dispose();
      ctxRef.current = null;
    };
  }, []);

  // ── Geo data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    loadGeo()
      .then((g) => {
        if (!alive) return;
        for (const d of dreamsRef.current) tagDream(g, d);
        setGeo(g);
      })
      .catch(() => alive && setGeoError(true));
    return () => {
      alive = false;
    };
  }, []);

  // Hand geo to the scene (re-runs after a StrictMode remount creates a new ctx).
  const geoSentTo = useRef(null);
  useEffect(() => {
    if (geo && ctxRef.current && geoSentTo.current !== ctxRef.current) {
      ctxRef.current.setGeo(geo);
      geoSentTo.current = ctxRef.current;
      applyHash(geo);
    }
    // applyHash only runs once, on first load — no need to track it.
  }, [geo]);

  const searchIndex = useMemo(() => (geo ? buildSearchIndex(geo) : null), [geo]);

  // ── Selection ─────────────────────────────────────────────────────────────
  const commit = useCallback((next, view) => {
    setSel(next);
    ctxRef.current?.setSelection({
      country: next.country,
      state: next.state,
      cityId: next.place?.i != null ? `pl${next.place.i}` : null,
    });
    ctxRef.current?.ping(next.place ? next.place.lat : null, next.place?.lng);
    if (view) ctxRef.current?.flyTo(view.lat, view.lng, view.dist);
    const id = next.state?.id || next.country?.id;
    const hash = id ? `#/${id}` : "";
    if (window.location.hash !== hash) history.replaceState(null, "", hash || window.location.pathname);
  }, []);

  const selectCountry = useCallback(
    (country) => {
      if (!country) return;
      setCard(null);
      commit({ country, state: null, place: null }, regionView(country));
    },
    [commit],
  );

  const selectState = useCallback(
    (state) => {
      if (!state) return;
      setCard(null);
      commit({ country: state.country, state, place: null }, regionView(state));
    },
    [commit],
  );

  const selectPlace = useCallback(
    (place) => {
      if (!geo) return;
      const { country, state } = geo.locate(place.lat, place.lng);
      setCard(null);
      commit(
        { country, state: state && country?.states.length > 1 ? state : null, place },
        { lat: place.lat, lng: place.lng, dist: Math.min(1.35, ctxRef.current?.camera.position.length() ?? 1.35) },
      );
    },
    [geo, commit],
  );

  const clearSelection = useCallback(() => {
    commit(EMPTY_SEL);
    ctxRef.current?.home();
  }, [commit]);

  const goUp = useCallback(() => {
    if (sel.state || sel.place) selectCountry(sel.country);
    else clearSelection();
  }, [sel, selectCountry, clearSelection]);

  function applyHash(g) {
    const id = decodeURIComponent(window.location.hash.replace(/^#\/?/, ""));
    if (!id) return;
    const st = g.stateById.get(id);
    if (st) return selectState(st);
    const c = g.countryById.get(id);
    if (c) selectCountry(c);
  }

  // ── Tour ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!touring || !geo) return;
    let i = 0;
    const step = () => {
      const s = TOUR[i % TOUR.length];
      i += 1;
      if (s.country) selectCountry(geo.countryById.get(s.country));
      else {
        const st = geo.countryById.get(s.in)?.states.find((x) => x.name === s.state);
        if (st) selectState(st);
      }
    };
    step();
    const id = setInterval(step, 5200);
    const stop = (e) => {
      // Any real interaction ends the tour.
      if (e.target.closest?.(".tour-btn")) return;
      setTouring(false);
    };
    window.addEventListener("pointerdown", stop);
    window.addEventListener("wheel", stop);
    window.addEventListener("keydown", stop);
    return () => {
      clearInterval(id);
      window.removeEventListener("pointerdown", stop);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("keydown", stop);
    };
  }, [touring, geo, selectCountry, selectState]);

  // ── Scene → React handlers (refreshed every render) ───────────────────────
  handlers.current = {
    hover: setTip,
    dream: (d) => setCard(d),
    background: () => {
      setCard(null);
    },
    region: (hit) => {
      const { country, state } = hit;
      if (!country) return;
      const zoomedIn = (ctxRef.current?.zoomLevel() ?? 0) >= 5.6;
      if (state && country.states.length > 1 && (sel.country === country || zoomedIn)) {
        if (sel.state !== state) selectState(state);
      } else if (sel.country !== country || sel.state || sel.place) {
        selectCountry(country);
      }
    },
    place: (hit) => {
      setTip(null);
      setPending(hit);
      setForm({ name: "", text: "" });
      setPlacing(false);
      ctxRef.current?.setPlacing(false);
    },
  };

  // ── Keep the focus clear of the side panels ─────────────────────────────────
  const panelOpen = !!(geo && sel.country);
  useEffect(() => {
    const apply = () => {
      if (isNarrow()) {
        ctxRef.current?.setViewShift(0, panelOpen || card ? window.innerHeight * 0.2 : 0);
      } else {
        const left = panelOpen ? 356 : 0;
        const right = card ? 300 : 0;
        ctxRef.current?.setViewShift((left - right) / 2, 0);
      }
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [panelOpen, card]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
      if (pending) setPending(null);
      else if (placing) cancelPlacing();
      else if (card) setCard(null);
      else if (sel.country) goUp();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ── Public API ────────────────────────────────────────────────────────────
  useImperativeHandle(
    ref,
    () => ({
      addMarker: (lat, lng, data) => ctxRef.current?.addMarker(lat, lng, data),
      flyTo: (lat, lng) => ctxRef.current?.flyTo(lat, lng),
      onMarkerClick: (cb) => window.DreamGlobe?.onMarkerClick(cb),
    }),
    [],
  );

  // ── Pinning ───────────────────────────────────────────────────────────────
  const startPlacing = (region) => {
    setCard(null);
    setPlacing(true);
    ctxRef.current?.setPlacing(true);
    if (region?.label) {
      const v = regionView(region);
      ctxRef.current?.flyTo(v.lat, v.lng, v.dist);
    }
  };
  const cancelPlacing = () => {
    setPlacing(false);
    ctxRef.current?.setPlacing(false);
    setTip(null);
  };

  const submitPin = () => {
    if (!pending) return;
    const { lat, lng, country, state } = pending;
    const near = geo && country ? nearestPlace(geo, country, lat, lng) : null;
    const dr = ctxRef.current.addMarker(lat, lng, {
      name: form.name.trim() || "Anonymous",
      age: "",
      city: near?.name || state?.name || "Somewhere",
      country: country?.name || "Open ocean",
      text: form.text.trim() || "A brand-new dream, just added.",
      tier: "DRIFTER",
      ago: "just now",
    });
    if (geo) tagDream(geo, dr);
    setPending(null);
    setCard(dr);
    ctxRef.current.flyTo(dr.lat, dr.lng, Math.min(ctxRef.current.camera.position.length(), 2.1));
  };

  // ── Search picks ──────────────────────────────────────────────────────────
  const onPick = (r) => {
    setTouring(false);
    if (r.type === "dream") {
      setCard(r.ref);
      ctxRef.current?.flyTo(r.ref.lat, r.ref.lng);
    } else if (r.type === "country") selectCountry(r.ref);
    else if (r.type === "state") selectState(r.ref);
    else if (r.type === "city") selectPlace(r.ref);
    else if (r.type === "geo") {
      if (geo) selectPlace(r.ref);
      else ctxRef.current?.flyTo(r.ref.lat, r.ref.lng, 1.35);
    }
  };

  const loading = !texReady || (!geo && !geoError);
  const count = (48213 + added).toLocaleString();
  const dreams = dreamsRef.current;

  return (
    <>
      <div ref={mountRef} className="globe-mount" />

      {loading && (
        <div className="loader">
          <div className="spinner" />
          <div className="loader-text">{texReady ? "mapping 4,596 states & provinces…" : "loading globe…"}</div>
        </div>
      )}

      {/* Top bar */}
      <div className="logo">
        <div className="logo-chip" />
        <div className="logo-word">
          dreampin<span>.</span>
        </div>
      </div>

      <Search index={searchIndex} dreams={dreams} onPick={onPick} />

      <div className="top-right">
        <button
          className={`glass tour-btn${touring ? " on" : ""}`}
          onClick={() => setTouring((t) => !t)}
          disabled={!geo}
          title="Auto-tour countries and states"
        >
          {touring ? "■ stop tour" : "▶ tour"}
        </button>
        <div className="glass counter">
          <div className="live-dot" />
          <span className="counter-num">{count}</span>
          <span className="counter-label">dreams live</span>
        </div>
      </div>

      {/* Region panel (left) */}
      {geo && !(card && isNarrow()) && (
        <RegionPanel
          geo={geo}
          sel={sel}
          dreams={dreams}
          onCountry={selectCountry}
          onState={selectState}
          onCity={selectPlace}
          onDream={(d) => {
            setCard(d);
            ctxRef.current?.flyTo(d.lat, d.lng, Math.min(ctxRef.current.camera.position.length(), 1.6));
          }}
          onUp={goUp}
          onClose={clearSelection}
          onPinHere={startPlacing}
        />
      )}

      {/* Dream card (right) */}
      {card && (
        <div className="glass card" key={`${card.lat},${card.lng},${card.name}`}>
          <button className="card-x" onClick={() => setCard(null)} aria-label="Close">
            ×
          </button>
          <div className="card-head">
            <div className="avatar">{(card.name || "?")[0]}</div>
            <div>
              <div className="card-who">
                {card.name}
                {card.age ? `, ${card.age}` : ""}
              </div>
              <div className="card-place">
                {card.city}
                {card.country ? ` · ${card.country}` : ""}
              </div>
            </div>
          </div>
          <div className="card-quote">“{card.text}”</div>
          <div className="card-foot">
            <div className="tier">
              <div className="tier-dot" />
              <span>{card.tier}</span>
            </div>
            <span className="card-ago">{card.ago}</span>
          </div>
          {geo && card._cid && (
            <button
              className="card-region"
              onClick={() => {
                const st = card._sid ? geo.stateById.get(card._sid) : null;
                if (st && st.country?.states.length > 1) selectState(st);
                else selectCountry(geo.countryById.get(card._cid));
              }}
            >
              {flagEmoji(geo.countryById.get(card._cid)?.p.a2)} Explore{" "}
              {(card._sid && geo.stateById.get(card._sid)?.name) || geo.countryById.get(card._cid)?.name} →
            </button>
          )}
        </div>
      )}

      {/* Bottom-right: readout + zoom */}
      <div className="bottom-right">
        <div className="readout">
          <span ref={readoutRef} />
          <span className="zoom-badge">{zoomLabel(zoom)}</span>
        </div>
        <div className="glass zoom">
          <button onClick={() => ctxRef.current?.zoomBy(0.72)} aria-label="Zoom in">
            +
          </button>
          <button onClick={() => ctxRef.current?.zoomBy(1.38)} aria-label="Zoom out">
            −
          </button>
          <button onClick={clearSelection} aria-label="Reset view" className="home-btn" title="Reset view">
            ◎
          </button>
        </div>
      </div>

      {/* Bottom-left: CTA + hints */}
      {!placing && (
        <div className="bottom-left">
          <button className="cta" onClick={() => startPlacing(null)}>
            <span className="cta-star">✦</span>Pin your dream
          </button>
          <div className="hints">
            <span className="key">drag</span>rotate<span className="key">scroll</span>zoom<span className="key">click</span>explore
          </div>
        </div>
      )}

      {placing && (
        <div className="glass banner">
          <div className="live-dot fast" />
          <span className="banner-text">Click anywhere on the globe to drop your dream</span>
          <button className="banner-cancel" onClick={cancelPlacing}>
            cancel
          </button>
        </div>
      )}

      {/* Tooltip */}
      {tip && <Tooltip tip={tip} dreams={dreams} />}

      {/* Add-dream modal */}
      {pending && (
        <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && setPending(null)}>
          <form
            className="glass modal"
            onSubmit={(e) => {
              e.preventDefault();
              submitPin();
            }}
          >
            <div className="modal-title">Pin a new dream</div>
            <div className="modal-coords">
              LAT {pending.lat.toFixed(3)} · LNG {pending.lng.toFixed(3)}
            </div>
            <div className="modal-place">
              {pending.country ? (
                <>
                  {flagEmoji(pending.country.p.a2)} {pending.state && pending.country.states.length > 1 ? `${pending.state.name}, ` : ""}
                  {pending.country.name}
                </>
              ) : (
                "🌊 Somewhere over the open ocean"
              )}
            </div>
            <input
              className="fld input"
              autoFocus
              value={form.name}
              maxLength={40}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Your name"
            />
            <textarea
              className="fld input"
              value={form.text}
              maxLength={180}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
              placeholder="What do you dream of?"
              rows={3}
            />
            <div className="modal-actions">
              <button type="button" className="btn-outline" onClick={() => setPending(null)}>
                Cancel
              </button>
              <button type="submit" className="btn-grad">
                Drop dream ✦
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
});

function Tooltip({ tip, dreams }) {
  const style = {
    left: Math.min(tip.x + 16, window.innerWidth - 240),
    top: Math.min(tip.y + 16, window.innerHeight - 80),
  };
  if (tip.kind === "dream") {
    const d = tip.dream;
    return (
      <div className="glass tip" style={style}>
        <div className="tip-who">
          ✦ {d.name}
          {d.age ? `, ${d.age}` : ""}
        </div>
        <div className="tip-place">
          {d.city} · {d.country}
        </div>
      </div>
    );
  }
  if (tip.kind === "ocean") {
    return (
      <div className="glass tip" style={style}>
        <div className="tip-who">🌊 Open ocean</div>
        <div className="tip-place">{fmtLatLng(tip.lat, tip.lng)}</div>
      </div>
    );
  }
  const { country, state } = tip;
  const n = dreams.filter((d) => d._cid === country.id).length;
  const showState = state && country.states.length > 1;
  return (
    <div className="glass tip" style={style}>
      <div className="tip-who">
        {flagEmoji(country.p.a2)} {tip.placing ? "Drop in " : ""}
        {country.name}
      </div>
      {showState && (
        <div className="tip-state">
          {state.name}
          <span> · {state.p.t || "Region"}</span>
        </div>
      )}
      <div className="tip-place">
        {fmtLatLng(tip.lat, tip.lng)}
        {n ? ` · ${n} dream${n > 1 ? "s" : ""}` : ""}
      </div>
    </div>
  );
}

/** Attach country/state ids to a dream so panels can count and list it. */
function tagDream(geo, d) {
  const { country, state } = geo.locate(d.lat, d.lng);
  d._cid = country?.id || null;
  d._sid = state?.id || null;
}

function nearestPlace(geo, country, lat, lng) {
  let best = null;
  let bd = Infinity;
  for (const pl of country.places) {
    const dd = (pl.lat - lat) ** 2 + ((pl.lng - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (dd < bd) {
      bd = dd;
      best = pl;
    }
  }
  return bd < 1.5 ? best : null; // within ~1.2°
}

function zoomLabel(z) {
  if (z < 3.6) return "world";
  if (z < 4.6) return "continent";
  if (z < 5.6) return "country";
  if (z < 6.6) return "state";
  return "city";
}

const isNarrow = () => window.innerWidth < 720;

export default DreamGlobe;
