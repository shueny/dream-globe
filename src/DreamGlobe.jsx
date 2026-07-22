import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { initScene } from "./globe/scene.js";
import { dreams as sampleDreams, arcPairs } from "./data/dreams.js";

/**
 * React wrapper around the pure Three.js scene.
 *
 * React owns only state (tooltip, open card, counter, placing flag) and the
 * lifecycle. Every Three.js object lives in the scene ctx, never in state
 * (brief §4 mine 2). Communication is: scene → React via on* callbacks; React →
 * scene via the imperative ctx methods held in ctxRef.
 *
 * ROUND 2 note: the buttons / tooltip / info box below are intentionally
 * bare-bones — they exist only to trigger and confirm the scene logic. The
 * polished overlay chrome (search, glass info card, modal, banner) is Round 3.
 *
 * Public API (brief §7) is exposed two ways:
 *  - imperatively via ref (useImperativeHandle) — the idiomatic React surface
 *  - globally via window.DreamGlobe — set inside the scene for the Upwork brief
 */
const DreamGlobe = forwardRef(function DreamGlobe(_props, ref) {
  const mountRef = useRef(null);
  const ctxRef = useRef(null);
  const [tip, setTip] = useState(null);
  const [card, setCard] = useState(null);
  const [added, setAdded] = useState(0);
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    const ctx = initScene(mountRef.current, {
      // Copy the samples so a StrictMode re-mount never mutates the source module.
      dreams: sampleDreams.map((d) => ({ ...d })),
      arcPairs,
      onHover: setTip,
      onSelect: setCard,
      onCount: setAdded,
      onPlace: (coords) => {
        // Round 2: drop immediately with placeholder data. Round 3 inserts the
        // "Pin a new dream" modal between the click and this addMarker call.
        const dr = ctxRef.current.addMarker(coords.lat, coords.lng, {
          name: "You",
          city: "Your pin",
          country: `${coords.lat.toFixed(1)}, ${coords.lng.toFixed(1)}`,
          text: "A brand-new dream, just added.",
          tier: "DRIFTER",
          ago: "just now",
        });
        setPlacing(false);
        ctxRef.current.setPlacing(false);
        setCard(dr);
        ctxRef.current.flyTo(dr.lat, dr.lng);
      },
    });
    ctxRef.current = ctx;
    return () => {
      ctx.dispose();
      ctxRef.current = null;
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      addMarker: (lat, lng, data) => ctxRef.current?.addMarker(lat, lng, data),
      flyTo: (lat, lng) => ctxRef.current?.flyTo(lat, lng),
      onMarkerClick: (cb) => window.DreamGlobe?.onMarkerClick(cb),
    }),
    [],
  );

  const togglePlacing = () => {
    const next = !placing;
    setPlacing(next);
    ctxRef.current?.setPlacing(next);
  };

  const count = (48213 + added).toLocaleString();

  return (
    <>
      <div ref={mountRef} className="globe-mount" />

      {/* ── ROUND 2 SCAFFOLD UI (throwaway; replaced in Round 3) ────────────── */}
      <div className="r2">
        <div className="r2-counter">
          {count} <span>dreams live</span>
        </div>

        <div className="r2-controls">
          <button onClick={togglePlacing}>
            {placing ? "Cancel pin" : "✦ Pin your dream"}
          </button>
          <button onClick={() => ctxRef.current?.dolly(0.75)}>Zoom +</button>
          <button onClick={() => ctxRef.current?.dolly(1.33)}>Zoom −</button>
          <button onClick={() => ctxRef.current?.flyTo(35.689, 139.692)}>Fly: Tokyo</button>
          <button onClick={() => ctxRef.current?.flyTo(-33.869, 151.209)}>Fly: Sydney</button>
        </div>

        {placing && (
          <div className="r2-banner">Click anywhere on the globe to drop your dream</div>
        )}

        {card && (
          <div className="r2-card">
            <button className="r2-card-x" onClick={() => setCard(null)}>
              ×
            </button>
            <div className="r2-card-who">
              {card.name}
              {card.age ? `, ${card.age}` : ""}
            </div>
            <div className="r2-card-place">
              {card.city}
              {card.country ? ` · ${card.country}` : ""}
            </div>
            <div className="r2-card-quote">“{card.text}”</div>
            <div className="r2-card-tier">{card.tier}</div>
          </div>
        )}
      </div>

      {tip && (
        <div className="r2-tip" style={{ left: tip.x + 14, top: tip.y + 14 }}>
          <div className="r2-tip-who">{tip.who}</div>
          <div className="r2-tip-place">{tip.place}</div>
        </div>
      )}
    </>
  );
});

export default DreamGlobe;
