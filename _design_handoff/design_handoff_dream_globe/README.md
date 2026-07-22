# Handoff: Interactive 3D Dream Globe (Three.js)

## Overview
A full-screen, interactive 3D night-Earth globe for a web platform. Users see glowing markers ("dreams") pinned at real lat/lng coordinates, connected by animated arcs. They can drag to rotate, scroll to zoom, hover/click a marker to read its dream, search any place on Earth and fly the camera there, and drop their own dream by clicking the globe. Idle → gentle auto-rotation.

This matches an Upwork brief for an **Interactive 3D Digital Globe for a Web Platform**, static-site friendly, with data intended to come from Supabase.

## About the Design Files
The file in this bundle (`Dream Globe.dc.html`) is a **functional design reference authored in HTML + vanilla JS + Three.js**. It is a working prototype demonstrating the intended look, motion, and interactions — **not production code to paste in**. The task is to **recreate this in the target codebase's existing environment** (React/Next, Vue, Svelte, or plain static JS) using its established patterns, then swap the in-file sample data for the real data source (Supabase).

> Note on the wrapper: the HTML uses a lightweight in-house component runtime (`<x-dc>`, `<helmet>`, `<sc-if>`, `<sc-for>`, `{{ }}` holes, and a `class Component extends DCLogic`). **Ignore that wrapper.** The real, portable logic is the Three.js scene code inside the `Component` class and the overlay markup. Everything in the class method bodies is plain JavaScript you can lift almost verbatim.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, motion, and interaction behavior are all specified. Recreate pixel-perfectly using the codebase's UI libraries; the 3D scene logic can be ported nearly as-is.

## Tech Stack (as prototyped)
- **Three.js r128** + `OrbitControls` (examples build).
- **Textures** (CORS-safe CDN, three-globe example assets):
  - Base map: `https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg` (tinted dark so continents read over ocean)
  - City-lights glow (emissive map): `https://unpkg.com/three-globe/example/img/earth-night.jpg`
  - jsDelivr mirror used as fallback host.
- **Geocoding (search "any place on Earth")**: Open-Meteo — free, no API key, CORS-enabled:
  `https://geocoding-api.open-meteo.com/v1/search?name=<q>&count=8&language=en&format=json`
- **Fonts**: Space Grotesk (UI) + IBM Plex Mono (labels/coords), Google Fonts.

## Screen / Views (single full-bleed screen with overlay chrome)

### Globe (main view)
- **Purpose**: Explore dreams around the world; search/fly; read a dream; pin your own.
- **Layout**: `position:fixed; inset:0` full-viewport. A `<div>` fills it as the Three.js canvas mount. All UI is absolutely-positioned floating chrome over it (no page scroll).

**Overlay components** (all use the `.glass` treatment unless noted):
- `.glass` = `background: rgba(12,26,48,.55); border: 1px solid rgba(120,200,255,.18); backdrop-filter: blur(12px)`.
- **Logo (top-left, 26/22px inset)**: 26×26 rounded-7px gradient chip `linear-gradient(135deg,#6fd8ff,#3a7bff)` + wordmark "dreampin." — 15px/600 Space Grotesk, `#eaf6ff`, the "." in `#6fd8ff`.
- **Fly-to search (top-center)**: 320px pill, 11px radius, 9px 15px padding. Left: 13px hollow circle icon. Input: transparent, 13px Space Grotesk, text `#eaf6ff`, placeholder `#5f7ea0` "Fly to a city, country, or dream…". Results dropdown below (6px gap, 11px radius, `fadein` .16s): each row 9px 14px, 10px gap, a 6px cyan dot (`#6fd8ff`, glow), title 13px/600 `#eaf6ff`, sub 11px IBM Plex Mono `#6f90b4`; hover row bg `rgba(120,200,255,.1)`. Dream matches prefixed "✦" and show the dreamer; place matches show "Fly here".
- **Live counter (top-right)**: dot (7px `#6fe0a0`, glow, `dot` pulse) + bold number (`48,213`, increments on new pins) + "dreams live" (12px IBM Plex Mono `#6f90b4`).
- **Info card (right-center, appears on marker click)**: 270px, 16px radius, 18px padding, shadow `0 16px 44px rgba(0,0,0,.5)`, `floaty` 7s bob. Close "×" top-right. Header: 40px rounded-12 avatar (`linear-gradient(135deg,#2a4a7a,#16273f)`, initial letter `#bfeaff`) + name (14px/600 `#eaf6ff`) + place (11.5px IBM Plex Mono `#6f90b4`). Quote: 15px/1.42 500 `#dceeff`. Footer: tier pill (`rgba(111,216,255,.14)` bg, `rgba(111,216,255,.3)` border, 6px dot, 11px mono `#9fdfff`) + "Xd ago" (11px mono `#5f7ea0`).
- **Zoom control (right, above bottom, 30/28px inset)**: vertical `+`/`−`, each 38×38, 20px glyph `#cfe8ff`, divider `rgba(120,200,255,.14)`, hover `rgba(120,200,255,.12)`.
- **Pin CTA + drag hint (bottom-left)**: Button "✦ Pin your dream" — pill, `linear-gradient(135deg,#6fd8ff,#3a7bff)`, text `#04101f` 13px/600, shadow `0 8px 22px rgba(90,180,255,.35)`. Beside it: `drag` rotate · `scroll` zoom hint keys (IBM Plex Mono 12px `#5f7ea0`, 6px bordered key caps).
- **Placing banner (bottom-center, while pinning)**: pill with pulsing green dot + "Click anywhere on the globe to drop your dream" + "cancel".
- **Tooltip (follows cursor on marker hover)**: small glass card, name (12px/600) + place (10.5px mono), `pointer-events:none`.
- **Add-dream modal (center, on globe click while placing)**: 360px, 18px radius, backdrop `rgba(3,6,13,.6)` blur. Title "Pin a new dream" (17px/600), coords line (12px mono `#6f90b4` "LAT … · LNG …"), name input, textarea "What do you dream of?", Cancel (outline) + "Drop dream ✦" (gradient) buttons.
- **Loading overlay**: full-screen radial bg, 44px spinner (2px ring, top-color `#6fd8ff`, `spin` 1s), caption "loading globe…" 13px mono `#6f90b4`.

## 3D Scene Spec
- **Camera**: PerspectiveCamera fov 45, initial position = lat 22 / lng -18 direction × 2.55 radius (frames Atlantic/Africa/Europe, lights-rich). Globe radius = 1.
- **Earth mesh**: SphereGeometry(1,64,64), `MeshStandardMaterial` — `map` = blue-marble (`color` tint `#8aa6cc`), `emissiveMap` = night lights (`emissive #ffd49a`, `emissiveIntensity 1.05`), roughness 1, metalness 0. sRGB encoding on both textures.
- **Graticule**: `WireframeGeometry` of a low-res sphere at R×1.001, `LineBasicMaterial` `#2a5a8a` opacity .25.
- **Atmosphere**: BackSide additive ShaderMaterial fresnel rim, glow `#4aa8ff`, `pow(max(0,0.62 - dot(N, viewZ)), 3.5) * 1.1`, mesh scaled 1.16.
- **Lights**: AmbientLight `#54657f` 0.5 + DirectionalLight `#dce8ff` 1.25 at (-1.6,1.0,2.4).
- **Markers**: `THREE.Sprite` with a radial-gradient white glow canvas texture, `color #ffbe42` (amber — high contrast vs blue globe/cyan arcs), additive, `depthWrite:false`, base scale 0.12, placed at R×1.015. Pulse: `scale = base * (1 + 0.28*sin(t*2.4 + phase))`. Back-face markers fade to opacity .12 (dot of world-normal vs camera dir > 0.12 = "facing").
- **Arcs**: `QuadraticBezierCurve3` between two lat/lng points; control point = normalized midpoint lifted by `1 + dist*0.35`. Rendered as `TubeGeometry(curve,40,0.004,6)` `MeshBasicMaterial #6fd8ff` opacity .4 additive, plus a small white glow Sprite traveling `curve.getPoint(t)` with `t=(t+speed*0.016)%1`, speed 0.12–0.22.
- **lat/lng → vec3**: `phi=(90-lat)π/180, theta=(lng+180)π/180; x=-r·sinφ·cosθ, y=r·cosφ, z=r·sinφ·sinθ`. Inverse used for pin-drop hit testing (unproject click → sphere intersection → world-to-local → back to lat/lng).

## Interactions & Behavior
- **Rotate**: OrbitControls, damping .08, rotateSpeed .5, pan disabled.
- **Zoom**: scroll / pinch; minDistance 1.5, maxDistance 5. `+`/`−` buttons dolly camera length ×0.75 / ×1.33 clamped.
- **Idle auto-rotate**: autoRotateSpeed .35; disabled on interaction start; re-enabled 4s after interaction/fly ends.
- **Hover marker**: raycast against sprites (front-facing only) → cursor `pointer` + follow tooltip.
- **Click marker**: open info card + `flyTo` the marker + fire `onMarkerClick(dream)` callback.
- **flyTo(lat,lng)** (~1.1s): disable controls + auto-rotate; **lerp** the camera's normalized direction from current → target and radius → 2.1; easing `k<.5 ? 2k² : 1-(-2k+2)²/2`; keep `camera.up=(0,1,0)`, `lookAt(0,0,0)`; on finish re-enable controls, schedule auto-rotate. (Do NOT drive this with quaternion slerp of setFromUnitVectors — it went singular in the prototype; the direction-lerp is the fix.)
- **Search**: local matches (dreams ✦, then built-in city list) render instantly; debounced 260ms Open-Meteo geocode streams global results; stale-query guard by comparing current input. Enter selects first result.
- **Pin your dream**: CTA → "placing" mode (crosshair cursor, banner). Click globe → raycast to sphere → convert to lat/lng → open modal → submit adds a marker via `addMarker`, increments counter, opens its card, flies to it.
- **Responsive**: canvas resizes to mount on window resize (camera aspect + renderer size). Overlay chrome should reflow for mobile (single-column, search full-width, controls repositioned) — **mobile layout still to be finalized**.

## Public API (expose the same surface)
```js
DreamGlobe.addMarker(lat, lng, data)   // data: {name, age, city, country, text, tier, ago}
DreamGlobe.flyTo(lat, lng)
DreamGlobe.onMarkerClick(cb)           // cb(dream)
```

## State Management
- `loading`, `active` (card open) + `d` (card data), `query` / `results` / `showResults` / `searching`, `placing`, `adding` + `form{name,text}` + pending coords, `tip` (hover tooltip), `added` (counter delta), `cursor`.
- Scene refs held outside render state: renderer/scene/camera/controls, `markers[]`, `arcs[]`, `fly` tween, `hovered`, `idleTimer`.
- **Data**: prototype ships ~12 sample `dreams` and ~40 fallback `cities` inline. **Replace `dreams` with a Supabase query**; keep the fallback city list only for offline geocode failover.

## Design Tokens
- **Bg**: page `#03060d`; globe vignette `radial-gradient(125% 95% at 50% 40%, #0c1a34, #060c18 56%, #03060d)`.
- **Text**: primary `#eaf6ff` / `#cfefff`, secondary `#6f90b4`, faint `#5f7ea0`.
- **Accent cyan**: `#6fd8ff` (→ `#3a7bff` gradient), hover `#a7e9ff`.
- **Marker amber**: `#ffbe42`; glow warm `#ffd49a`.
- **Status green**: `#6fe0a0`.
- **Glass**: fill `rgba(12,26,48,.55)`, border `rgba(120,200,255,.18)`, blur 12px.
- **Radii**: pills 999px; cards 16px; modal 18px; inputs/controls 10–11px; logo chip 7px.
- **Shadows**: card `0 16px 44px rgba(0,0,0,.5)`; CTA `0 8px 22px rgba(90,180,255,.35)`; modal `0 24px 60px rgba(0,0,0,.6)`.
- **Type**: Space Grotesk 400–700 (UI), IBM Plex Mono 400–600 (coords/labels/tiers).
- **Motion**: `floaty` 7s card bob; `dot` 2s status pulse; `spin` 1s loader; `fadein` .16–.2s dropdowns/modal; fly 1.1s; marker pulse 2.4s.

## Assets
- Earth textures: three-globe example images via unpkg/jsDelivr (see Tech Stack). Swap for self-hosted copies in production for reliability/perf.
- No icons library — icons are CSS shapes / glyphs.
- Fonts via Google Fonts.

## Files
- `Dream Globe.dc.html` — the functional prototype (Three.js scene + overlay UI + search/geocode). Read the `Component` class for portable JS; the `<x-dc>`/`<helmet>` wrapper is scaffolding to ignore.
