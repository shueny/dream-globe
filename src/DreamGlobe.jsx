import { useEffect, useRef } from "react";
import { initScene } from "./globe/scene.js";

/**
 * React wrapper around the pure Three.js scene.
 *
 * The only React concern in Round 1 is lifecycle: build the scene on mount and
 * fully dispose it on unmount. Every Three.js object lives inside the scene ctx
 * (returned by initScene), never in React state — putting renderer/scene/camera
 * in state would re-render on every change and loop (brief §4 mine 2).
 */
export default function DreamGlobe() {
  const mountRef = useRef(null);

  useEffect(() => {
    const ctx = initScene(mountRef.current);
    return () => ctx.dispose();
  }, []);

  return <div ref={mountRef} className="globe-mount" />;
}
