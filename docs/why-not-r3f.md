# Why plain Three.js, not react-three-fiber

The globe is a pure Three.js scene (`src/globe/scene.js`) behind a thin React shell
(`src/DreamGlobe.jsx`): React owns UI state and the lifecycle, the scene owns every
Three.js object. [react-three-fiber](https://r3f.docs.pmnd.rs) (R3F) was considered;
this is the trade-off.

| Aspect | Plain Three.js + React shell (current) | react-three-fiber |
|---|---|---|
| **Authoring style** | Imperative; `scene.js` builds and owns every object | Declarative JSX scene tree, easy to scan |
| **Per-frame animation** | ✅ Marker pulse, arc draw-in, camera flights all in one RAF loop | ⚠️ Goes in `useFrame` mutating refs — still imperative, JSX saves little |
| **Dynamic, data-driven geometry** | ✅ Borders / fills built on demand per zoom and selection, cached in Maps | ⚠️ Possible, but often via `<primitive>` / manual management |
| **Resource disposal** | ❌ Hand-written `dispose()`; a new resource can silently leak (guarded by `scene.dispose.test.js`) | ✅ Auto-disposes JSX-created objects on unmount<br>⚠️ Map-cached or manually created objects still need manual disposal |
| **React integration** | ❌ Hand-rolled sync via refs, callbacks, `useImperativeHandle`, StrictMode remounts | ✅ Native props, state, Context, Suspense |
| **Ecosystem** | ❌ Labels, controls wiring written by hand | ✅ drei: `<OrbitControls>`, `<Html>`, `useTexture`, … |
| **Testability** | ✅ Scene is React-free; geometry / coordinate logic unit-tested directly | ⚠️ Scene logic tied to components; needs canvas mocks or React rendering |
| **Reuse** | ✅ Works without React — `window.DreamGlobe` public API | ❌ React only |
| **Dependencies** | ✅ Just `three` | ⚠️ `@react-three/fiber` + drei, version-aligned with React 19 and three |
| **Bundle size** (gzip, measured) | ✅ **233.0 KB**; three tree-shakes | ❌ **332.8 KB** with fiber (+43%), **340.0 KB** with drei (+46%) |
| **First paint** | ✅ No SSR, static hosting — less JS means the globe shows sooner | ❌ ~100 KB more gzip on the critical path; a few hundred ms on mobile networks |
| **Render control** | ✅ We decide when to re-layout (e.g. labels only when the view changes) | ⚠️ Renders every frame by default (`frameloop="demand"` to tune), plus reconcile overhead |
| **Learning curve** | Three.js API | Three.js + R3F's mental model |
| **Best fit** | One canvas, animation-heavy, dynamic objects — this project | Many composable 3D components tightly coupled to React UI |

✅ advantage · ❌ drawback · ⚠️ workable, with a cost

## Bundle size breakdown

Measured with production builds of this app, adding only the imports
(fiber 9.8.1, drei 10.7.9; three 0.185.1, React 19.2.8, Vite 8.1.5 from the lockfile), main JS chunk:

| Build | Minified | Gzip |
|---|---|---|
| Current | 851 KB | 233.0 KB |
| + `@react-three/fiber` | 1,195 KB | 332.8 KB |
| + fiber + drei (`OrbitControls`, `Html`, `useTexture`) | 1,218 KB | 340.0 KB |

Of fiber's ~100 KB: ~43 KB is three no longer tree-shaking (R3F registers the whole
`THREE` namespace as JSX elements), ~57 KB is fiber itself (bundled reconciler,
zustand, its-fine, suspend-react). drei adds ~7 KB, partly a second `OrbitControls`
from three-stdlib.

## When to revisit

If the scene grows into many independent, reusable 3D components with rich React
interaction — or drei's ecosystem would replace a lot of hand-written code — R3F's
benefits start to outweigh its size and indirection.
