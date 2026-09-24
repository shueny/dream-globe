import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ll2v, v2ll } from "./latlng.js";
import { glowTexture } from "./glowTexture.js";
import {
  buildBorderLayers,
  buildCountryStateBorders,
  buildFillGeometry,
  buildOutlineGeometry,
  makeOutlineMaterial,
  LineSegments2,
} from "./geoLayers.js";
import { createLabels } from "./labels.js";

/**
 * Pure Three.js scene for the Dream Globe. Knows nothing about React.
 *
 * initScene(mount, opts) builds the renderer/camera/globe/lights/controls, wires
 * markers + arcs + raycast interaction, starts the RAF loop, and returns a
 * context whose dispose() fully tears everything down — required so React
 * StrictMode's double-mount doesn't leave two canvases, two renderers, or two
 * RAF loops stacked on top of each other.
 *
 * Communication with React is one-way callbacks (opts.on*) out, and imperative
 * methods (flyTo/addMarker/zoomBy/setPlacing/setGeo/setSelection/…) in.
 *
 * Geography: once setGeo() receives the Natural Earth data, the globe draws
 * country borders + coastlines, fades in every state/province border as you
 * zoom, lets you hover/click any country or state (analytic ray–sphere hit →
 * lat/lng → point-in-polygon), and labels countries, states and cities with
 * zoom-aware density.
 *
 * @param {HTMLElement} mount
 * @param {{
 *   dreams?: Array, arcPairs?: Array<[number,number]>,
 *   onHover?: (tip: object | null) => void,
 *   onSelect?: (dream: object) => void,
 *   onPlace?: (coords: {lat:number, lng:number}) => void,
 *   onCount?: (added: number) => void,
 *   onRegionClick?: (hit: {lat:number, lng:number, country:object|null, state:object|null}) => void,
 *   onBackgroundClick?: () => void,
 *   onPointer?: (ll: {lat:number, lng:number} | null) => void,
 *   onReady?: () => void,
 *   onZoom?: (z: number) => void,
 * }} [opts]
 */
export function initScene(mount, opts = {}) {
  const {
    dreams = [],
    arcPairs = [],
    onHover = () => {},
    onSelect = () => {},
    onPlace = () => {},
    onCount = () => {},
    onRegionClick = () => {},
    onBackgroundClick = () => {},
    onPointer = () => {},
    onReady = () => {},
    onZoom = () => {},
  } = opts;

  const R = 1;
  const HOME_DIST = 2.7;
  let W = mount.clientWidth || window.innerWidth;
  let H = mount.clientHeight || window.innerHeight;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(45, W / H, 0.005, 100);
  // Initial framing: lat 22 / lng -18 direction (Atlantic/Africa/Europe).
  camera.position.copy(ll2v(22, -18, 1).normalize().multiplyScalar(homeDist()));

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  mount.appendChild(renderer.domElement);

  const labels = createLabels(mount);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.5;
  controls.enablePan = false;
  controls.minDistance = 1.13;
  controls.maxDistance = 5;
  controls.zoomSpeed = 0.9;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.35;

  // Portrait screens need to sit further back to fit the globe's width.
  function homeDist() {
    const aspect = W / H;
    return aspect < 0.8 ? HOME_DIST / Math.max(0.55, aspect / 0.8) : HOME_DIST;
  }

  // Idle auto-rotate: off while interacting, back on 4s after the last one —
  // unless a country/state is selected (rotating it out of view would be rude).
  let idleTimer = null;
  let autoAllowed = true;
  const scheduleIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (autoAllowed) controls.autoRotate = true;
    }, 4000);
  };
  controls.addEventListener("start", () => {
    controls.autoRotate = false;
    clearTimeout(idleTimer);
    fly = null;
  });
  controls.addEventListener("end", scheduleIdle);

  const globe = new THREE.Group();
  scene.add(globe);

  // ── Earth mesh ──────────────────────────────────────────────────────────
  const earthGeo = new THREE.SphereGeometry(R, 160, 120);
  const earthMat = new THREE.MeshStandardMaterial({
    color: 0x0a1d3a,
    emissive: 0x0a1830,
    emissiveIntensity: 1,
    roughness: 1,
    metalness: 0,
  });
  const earth = new THREE.Mesh(earthGeo, earthMat);
  globe.add(earth);

  // Textures self-hosted from /public/textures, with CDN fallback.
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous");
  const cdnHosts = [
    "https://unpkg.com/three-globe/example/img/",
    "https://cdn.jsdelivr.net/npm/three-globe/example/img/",
  ];
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const loadTex = (file, onLoad) => {
    const sources = [`${import.meta.env.BASE_URL}textures/${file}`, ...cdnHosts.map((h) => h + file)];
    let i = 0;
    const tryNext = () => {
      if (i >= sources.length) return onLoad(null);
      loader.load(sources[i], onLoad, undefined, () => {
        i++;
        tryNext();
      });
    };
    tryNext();
  };
  let pendingTex = 2;
  const texDone = () => {
    pendingTex -= 1;
    if (pendingTex === 0 && !stopped) onReady();
  };
  // Base map: blue-marble, dark-tinted so continents read over the ocean.
  loadTex("earth-blue-marble.jpg", (tex) => {
    if (tex && !stopped) {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = aniso;
      earthMat.map = tex;
      earthMat.color = new THREE.Color(0x8aa6cc);
      earthMat.needsUpdate = true;
    }
    texDone();
  });
  // Glow layer: night-side city lights as an emissive map.
  loadTex("earth-night.jpg", (tex) => {
    if (tex && !stopped) {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = aniso;
      earthMat.emissiveMap = tex;
      earthMat.emissive = new THREE.Color(0xffd49a);
      earthMat.emissiveIntensity = 1.05;
      earthMat.needsUpdate = true;
    }
    texDone();
  });

  // ── Graticule (true lat/lng lines every 15°) ──────────────────────────────
  const gridMat = new THREE.LineBasicMaterial({
    color: 0x2a5a8a,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  {
    const pts = [];
    const push = (lat, lng) => {
      const p = ll2v(lat, lng, R * 1.0006);
      pts.push(p.x, p.y, p.z);
    };
    for (let lat = -75; lat <= 75; lat += 15) {
      for (let lng = -180; lng < 180; lng += 2) {
        push(lat, lng);
        push(lat, lng + 2);
      }
    }
    for (let lng = -180; lng < 180; lng += 15) {
      for (let lat = -88; lat < 88; lat += 2) {
        push(lat, lng);
        push(lat + 2, lng);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    globe.add(new THREE.LineSegments(g, gridMat));
  }

  // ── Atmosphere (BackSide additive fresnel rim) ─────────────────────────────
  const atmMat = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    uniforms: { glow: { value: new THREE.Color(0x4aa8ff) } },
    vertexShader:
      "varying vec3 vN;void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
    fragmentShader:
      "uniform vec3 glow;varying vec3 vN;void main(){float i=pow(max(0.0,0.62-dot(vN,vec3(0.,0.,1.))),3.5);gl_FragColor=vec4(glow,1.0)*i*1.1;}",
  });
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 64), atmMat);
  atmosphere.scale.set(1.16, 1.16, 1.16);
  scene.add(atmosphere);

  // ── Lights (dim so night-side city lights dominate) ────────────────────────
  scene.add(new THREE.AmbientLight(0x54657f, 0.5));
  const dir = new THREE.DirectionalLight(0xdce8ff, 1.25);
  dir.position.set(-1.6, 1.0, 2.4);
  scene.add(dir);

  // ── Markers ─────────────────────────────────────────────────────────────
  const glowTex = glowTexture();
  const markerGroup = new THREE.Group();
  markerGroup.renderOrder = 5;
  globe.add(markerGroup);
  const markers = [];

  const addMarkerObj = (dr) => {
    const spr = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xffbe42, // amber — high contrast vs blue globe / cyan arcs
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    spr.position.copy(ll2v(dr.lat, dr.lng, 1.015));
    spr.scale.set(0.12, 0.12, 0.12);
    spr.renderOrder = 5;
    spr.userData = { dream: dr, base: 0.12, phase: Math.random() * 6.28 };
    markerGroup.add(spr);
    markers.push(spr);
    return spr;
  };
  dreams.forEach(addMarkerObj);

  // ── Arcs ────────────────────────────────────────────────────────────────
  const arcGroup = new THREE.Group();
  globe.add(arcGroup);
  const arcs = [];
  const arcMat = new THREE.MeshBasicMaterial({
    color: 0x6fd8ff,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const addArc = (a, b) => {
    const va = ll2v(a.lat, a.lng, 1.01);
    const vb = ll2v(b.lat, b.lng, 1.01);
    const mid = va.clone().add(vb).multiplyScalar(0.5);
    const lift = 1 + va.distanceTo(vb) * 0.35;
    mid.normalize().multiplyScalar(lift);
    const curve = new THREE.QuadraticBezierCurve3(va, mid, vb);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.004, 6, false), arcMat);
    arcGroup.add(tube);
    const trav = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xdff6ff,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    trav.scale.set(0.05, 0.05, 0.05);
    arcGroup.add(trav);
    arcs.push({ curve, trav, t: Math.random(), speed: 0.12 + Math.random() * 0.1 });
  };
  arcPairs.forEach(([a, b]) => {
    if (dreams[a] && dreams[b]) addArc(dreams[a], dreams[b]);
  });

  // ── Geography: borders, highlights, labels ────────────────────────────────
  const geoGroup = new THREE.Group();
  globe.add(geoGroup);
  let geo = null;
  let borders = null;

  const fillCache = new Map(); // region id → BufferGeometry
  const outlineCache = new Map();
  const fillGeo = (r) => {
    if (!fillCache.has(r.id)) fillCache.set(r.id, buildFillGeometry(r));
    return fillCache.get(r.id);
  };
  const outlineGeo = (r) => {
    if (!outlineCache.has(r.id)) outlineCache.set(r.id, buildOutlineGeometry(r));
    return outlineCache.get(r.id);
  };

  const mkFill = (color, opacity) =>
    new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    );
  const hoverFill = mkFill(0x6fd8ff, 0.1);
  const countryFill = mkFill(0x6fd8ff, 0.13);
  const stateFill = mkFill(0xbfeeff, 0.2);
  hoverFill.renderOrder = 3;
  countryFill.renderOrder = 3;
  stateFill.renderOrder = 4;

  const lineMats = {
    hover: makeOutlineMaterial(0xa7e9ff, 1.4, 0.8),
    country: makeOutlineMaterial(0x6fd8ff, 2.2, 1),
    state: makeOutlineMaterial(0xffffff, 2.4, 1),
  };
  const mkOutline = (mat) => {
    const l = new LineSegments2(undefined, mat);
    l.renderOrder = 6;
    l.visible = false;
    return l;
  };
  const hoverLine = mkOutline(lineMats.hover);
  const countryLine = mkOutline(lineMats.country);
  const stateLine = mkOutline(lineMats.state);
  const focusStateMat = new THREE.LineBasicMaterial({
    color: 0x8fd8ff,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  let focusStateBorders = null;

  for (const o of [hoverFill, countryFill, stateFill]) {
    o.visible = false;
    geoGroup.add(o);
  }
  geoGroup.add(hoverLine, countryLine, stateLine);

  const showRegion = (fill, line, region) => {
    if (!region) {
      fill.visible = false;
      line.visible = false;
      return;
    }
    fill.geometry = fillGeo(region);
    fill.visible = true;
    line.geometry = outlineGeo(region);
    line.visible = true;
  };

  let selection = { country: null, state: null, cityId: null };
  let hoverRegion = null;

  const setHoverRegion = (r) => {
    if (r === hoverRegion) return;
    hoverRegion = r;
    // Don't double-draw the selected shape.
    const dup = r && (r === selection.country || r === selection.state);
    showRegion(hoverFill, hoverLine, dup ? null : r);
  };

  function setGeo(g) {
    geo = g;
    borders = buildBorderLayers(g);
    geoGroup.add(borders.countries, borders.states);
    labels.setEntries([
      ...g.countries
        .filter((c) => c.label.lat != null)
        .map((c) => ({
          id: c.id,
          kind: "country",
          text: c.name,
          lat: c.label.lat,
          lng: c.label.lng,
          ml: c.p.ml ?? 5,
          lr: c.p.lr ?? 5,
          c: c.id,
        })),
      ...g.states
        .filter((s) => s.label.lat != null && s.country && s.country.states.length > 1)
        .map((s) => ({
          id: s.id,
          kind: "state",
          text: s.name,
          lat: s.label.lat,
          lng: s.label.lng,
          ml: s.p.ml ?? 8,
          lr: s.p.lr ?? 6,
          c: s.p.c,
        })),
      ...g.places
        .filter((pl) => pl.rank <= 9 || pl.cap)
        .map((pl) => ({
          id: `pl${pl.i}`,
          kind: "city",
          text: pl.name,
          lat: pl.lat,
          lng: pl.lng,
          rank: pl.rank,
          cap: pl.cap,
          c: pl.c,
        })),
    ]);
    labelsDirty = true;
  }

  /** Highlight the selected country (+ its internal borders) and/or state. */
  function setSelection({ country = null, state = null, cityId = null } = {}) {
    if (country !== selection.country) {
      if (focusStateBorders) {
        geoGroup.remove(focusStateBorders);
        focusStateBorders.geometry.dispose();
        focusStateBorders = null;
      }
      if (country && geo) {
        focusStateBorders = buildCountryStateBorders(geo, country.id, focusStateMat);
        if (focusStateBorders) geoGroup.add(focusStateBorders);
      }
    }
    selection = { country, state, cityId };
    showRegion(countryFill, countryLine, country);
    showRegion(stateFill, stateLine, state);
    // Soften the country fill when a state inside it is the focus.
    countryFill.material.opacity = state ? 0.06 : 0.13;
    countryLine.material.opacity = state ? 0.7 : 1;
    const h = hoverRegion;
    hoverRegion = null;
    setHoverRegion(h);
    labels.setFocus({ countryId: country?.id || null, stateId: state?.id || null, cityId });
    labelsDirty = true;
    autoAllowed = !country && !state;
    if (!autoAllowed) {
      controls.autoRotate = false;
      clearTimeout(idleTimer);
    }
  }

  // ── Location ping (search result / city focus) ────────────────────────────
  const pingGroup = new THREE.Group();
  globe.add(pingGroup);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x6fe0a0,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), ringMat);
  const ringCore = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTex,
      color: 0x6fe0a0,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  pingGroup.add(ring, ringCore);
  pingGroup.visible = false;
  let pingT = 0;

  function ping(lat, lng) {
    if (lat == null) {
      pingGroup.visible = false;
      return;
    }
    const p = ll2v(lat, lng, 1.003);
    ring.position.copy(p);
    ring.lookAt(p.clone().multiplyScalar(2));
    ringCore.position.copy(ll2v(lat, lng, 1.006));
    pingGroup.visible = true;
    pingT = 0;
  }

  // ── Interaction (raycast hover / click / placing) ──────────────────────────
  const ray = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const dom = renderer.domElement;
  let placing = false;
  let hovered = null;
  let downX = 0;
  let downY = 0;
  let onMarkerClick = null; // set via the public API
  const sphere = new THREE.Sphere(new THREE.Vector3(), R);
  const hitPt = new THREE.Vector3();

  // A marker is "facing" the camera (front hemisphere) when its world-normal
  // dotted with the camera direction exceeds a small threshold.
  const facing = (obj) => {
    const wp = new THREE.Vector3();
    obj.getWorldPosition(wp);
    const cam = camera.position.clone().normalize();
    return wp.clone().normalize().dot(cam) > 0.12;
  };

  const setMouse = (e) => {
    const rect = dom.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  };

  /** Analytic ray–sphere hit (exact, unlike the tessellated mesh). */
  const surfaceHit = () => {
    ray.setFromCamera(mouse, camera);
    if (!ray.ray.intersectSphere(sphere, hitPt)) return null;
    return v2ll(globe.worldToLocal(hitPt.clone()));
  };

  const cursor = () => (placing ? "crosshair" : hovered || hoverRegion ? "pointer" : "grab");

  /** Resolve what's under the pointer; returns true if anything is. */
  const pickAt = (e) => {
    setMouse(e);
    ray.setFromCamera(mouse, camera);
    const hits = ray.intersectObjects(markers, false).filter((h) => facing(h.object));
    if (hits.length && !placing) {
      hovered = hits[0].object;
      setHoverRegion(null);
      const dr = hovered.userData.dream;
      onHover({ kind: "dream", dream: dr, x: e.clientX, y: e.clientY });
      return true;
    }
    hovered = null;
    const ll = surfaceHit();
    onPointer(ll);
    if (!ll) {
      setHoverRegion(null);
      onHover(null);
      return false;
    }
    if (!geo) {
      onHover(null);
      return true;
    }
    const { country, state } = geo.locate(ll.lat, ll.lng);
    // Zoomed in, or inside the selected country → work at state level.
    const stateLevel = state && (country === selection.country || zoomLevel() >= 5.6);
    setHoverRegion(placing ? null : stateLevel ? state : country);
    if (country) {
      onHover({ kind: "region", country, state, lat: ll.lat, lng: ll.lng, x: e.clientX, y: e.clientY, placing });
    } else {
      onHover(placing ? { kind: "ocean", lat: ll.lat, lng: ll.lng, x: e.clientX, y: e.clientY, placing } : null);
    }
    return true;
  };

  let moveQueued = null;
  const onPointerMove = (e) => {
    if (e.pointerType === "touch") return; // no hover on touch
    if (e.buttons) {
      // Dragging: hide tooltip, skip picking.
      onHover(null);
      return;
    }
    if (!moveQueued) {
      requestAnimationFrame(() => {
        const ev = moveQueued;
        moveQueued = null;
        if (stopped || !ev) return;
        pickAt(ev);
        dom.style.cursor = cursor();
      });
    }
    moveQueued = { clientX: e.clientX, clientY: e.clientY };
  };

  const onPointerLeave = () => {
    hovered = null;
    setHoverRegion(null);
    onHover(null);
    onPointer(null);
  };

  const onPointerDown = (e) => {
    downX = e.clientX;
    downY = e.clientY;
  };

  const onPointerUp = (e) => {
    const moved = Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY);
    if (moved > 6) return; // it was a drag, not a click
    const something = pickAt(e);
    if (e.pointerType === "touch") onHover(null);

    if (placing) {
      setMouse(e);
      const ll = surfaceHit();
      if (ll) onPlace({ ...ll, ...(geo ? geo.locate(ll.lat, ll.lng) : {}) });
      return;
    }

    if (hovered) {
      const dr = hovered.userData.dream;
      onSelect(dr); // React opens the card
      if (onMarkerClick) onMarkerClick(dr); // public API callback
      flyTo(dr.lat, dr.lng, Math.min(camera.position.length(), 2.1));
      return;
    }

    if (!something) {
      onBackgroundClick();
      return;
    }
    setMouse(e);
    const ll = surfaceHit();
    if (ll && geo) onRegionClick({ ...ll, ...geo.locate(ll.lat, ll.lng) });
  };

  dom.addEventListener("pointermove", onPointerMove);
  dom.addEventListener("pointerleave", onPointerLeave);
  dom.addEventListener("pointerdown", onPointerDown);
  dom.addEventListener("pointerup", onPointerUp);

  // ── Camera moves ───────────────────────────────────────────────────────────
  let fly = null;

  /**
   * Fly the camera to a lat/lng (and distance) over ~1.1s.
   *
   * Lerp the camera's normalized direction and its radius, NOT a quaternion
   * slerp of setFromUnitVectors — that went singular (camera flip/lock) at some
   * angles in the prototype.
   */
  function flyTo(lat, lng, dist = 2.1, dur = 1.1) {
    flyToDir(ll2v(lat, lng, 1).normalize(), dist, dur);
  }

  function flyToDir(toDir, dist, dur) {
    controls.autoRotate = false;
    clearTimeout(idleTimer);
    const fromDir = camera.position.clone().normalize();
    // Near-antipodal targets: nudge sideways so the lerp never passes through 0.
    if (fromDir.dot(toDir) < -0.98) {
      toDir = toDir.clone().add(new THREE.Vector3(0, 0.25, 0)).normalize();
    }
    const toR = Math.max(controls.minDistance, Math.min(controls.maxDistance, dist));
    // Long hops take a little longer so they don't feel like a jump-cut.
    const span = Math.acos(Math.max(-1, Math.min(1, fromDir.dot(toDir))));
    fly = {
      fromDir,
      toDir,
      fromR: camera.position.length(),
      toR,
      t: 0,
      dur: dur * (0.75 + span * 0.25),
    };
    controls.enabled = false;
  }

  const zoomBy = (f) => {
    flyToDir(camera.position.clone().normalize(), camera.position.length() * f, 0.45);
  };

  const home = () => {
    flyToDir(camera.position.clone().normalize().setY(0.35).normalize(), homeDist(), 1.2);
  };

  let added = 0;
  const addMarker = (lat, lng, data) => {
    const dr = Object.assign(
      { lat, lng, name: "Dreamer", age: "", city: "", country: "", text: "A new dream.", tier: "DRIFTER", ago: "just now" },
      data || {},
    );
    dreams.push(dr);
    addMarkerObj(dr);
    added += 1;
    onCount(added);
    return dr;
  };

  const setPlacing = (v) => {
    placing = v;
    if (v) setHoverRegion(null);
    dom.style.cursor = cursor();
  };

  // ── Public API — also exposed via useImperativeHandle in React ─────────────
  const api = {
    addMarker,
    flyTo,
    onMarkerClick: (cb) => {
      onMarkerClick = cb;
    },
  };
  window.DreamGlobe = api;

  // ── Resize ────────────────────────────────────────────────────────────────
  const onResize = () => {
    const w = mount.clientWidth;
    const h = mount.clientHeight;
    if (!w || !h) return;
    W = w;
    H = h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    applyShift();
    for (const m of Object.values(lineMats)) m.resolution.set(w, h);
    labelsDirty = true;
  };
  window.addEventListener("resize", onResize);
  for (const m of Object.values(lineMats)) m.resolution.set(W, H);

  // ── Projection offset ─────────────────────────────────────────────────────
  // Shifts the rendered globe (not the camera) so a selected region sits in the
  // visible middle when a panel covers one side of the screen.
  const shift = { x: 0, y: 0, tx: 0, ty: 0 };
  function applyShift() {
    if (Math.abs(shift.x) < 0.5 && Math.abs(shift.y) < 0.5) camera.clearViewOffset();
    else camera.setViewOffset(W, H, -shift.x, shift.y, W, H);
    labelsDirty = true;
  }
  const setViewShift = (x = 0, y = 0) => {
    shift.tx = x;
    shift.ty = y;
  };

  // ── Zoom model ───────────────────────────────────────────────────────────
  /**
   * A web-map-like zoom level derived from camera altitude, so Natural Earth's
   * min_label / scalerank thresholds can drive label + border density.
   * ≈3.1 at the home view, ≈4.4 at distance 1.5, ≈7 at the closest zoom.
   */
  function zoomLevel() {
    const alt = Math.max(0.02, camera.position.length() - 1);
    return Math.log2(1265 / (alt * 47.5)) - 1;
  }
  const smooth = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };

  // ── Animation loop ──────────────────────────────────────────────────────────
  const timer = new THREE.Timer();
  let raf = 0;
  let stopped = false;
  let labelsDirty = true;
  const lastCam = new THREE.Vector3();
  let lastZoomReported = -1;

  const animate = () => {
    if (stopped) return;
    raf = requestAnimationFrame(animate);
    timer.update();
    const rawDt = timer.getDelta();
    // Animations clamp dt so a background tab doesn't jump; camera flights use
    // wall-clock time (capped) so they finish on time even at low frame rates.
    const dt = Math.min(0.05, rawDt);
    const t = timer.getElapsed();

    // Fly tween (direction + radius lerp; see flyTo note).
    if (fly) {
      fly.t += Math.min(0.25, rawDt) / fly.dur;
      const k = Math.min(1, fly.t);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const flyDir = fly.fromDir.clone().lerp(fly.toDir, e).normalize();
      const r = fly.fromR + (fly.toR - fly.fromR) * e;
      camera.position.copy(flyDir.multiplyScalar(r));
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, 0);
      if (k >= 1) {
        fly = null;
        controls.enabled = true;
        scheduleIdle();
      }
    } else {
      controls.update();
    }

    const dist = camera.position.length();
    const z = zoomLevel();
    // Closer = slower rotate, so a drag moves the map about the same on screen.
    const near = Math.max(0.06, Math.min(1.3, (dist - 1) / 1.55));
    controls.rotateSpeed = 0.5 * Math.max(0.12, near);
    controls.autoRotateSpeed = 0.35 * near;

    // Marker pulse + back-face fade; markers shrink as you zoom in.
    const mScale = Math.max(0.16, Math.min(1.2, near));
    for (const m of markers) {
      const s = m.userData.base * mScale * (1 + 0.28 * Math.sin(t * 2.4 + m.userData.phase));
      m.scale.set(s, s, s);
      m.material.opacity = facing(m) ? 1 : 0.12;
    }
    // Arcs fly high above the surface, so they'd slice across the view up
    // close — fade them out as you zoom in to country level.
    const arcFade = 1 - smooth(3.7, 4.6, z);
    arcGroup.visible = arcFade > 0.01;
    arcMat.opacity = 0.4 * arcFade;
    for (const a of arcs) {
      a.t = (a.t + a.speed * dt) % 1;
      a.trav.position.copy(a.curve.getPoint(a.t));
      a.trav.material.opacity = arcFade;
    }

    // Ease the projection offset (keeps the focus clear of side panels).
    if (Math.abs(shift.x - shift.tx) > 0.5 || Math.abs(shift.y - shift.ty) > 0.5) {
      shift.x += (shift.tx - shift.x) * Math.min(1, dt * 6);
      shift.y += (shift.ty - shift.y) * Math.min(1, dt * 6);
      applyShift();
    } else if (shift.x !== shift.tx || shift.y !== shift.ty) {
      shift.x = shift.tx;
      shift.y = shift.ty;
      applyShift();
    }

    // Zoom-driven detail.
    gridMat.opacity = 0.22 * (1 - smooth(4.2, 5.6, z));
    if (borders) {
      borders.stateMat.opacity = 0.34 * smooth(4.1, 5.3, z);
      borders.countryMat.opacity = 0.42 + 0.25 * smooth(4, 6, z);
    }

    // Ping ring.
    if (pingGroup.visible) {
      pingT += dt;
      const k = (pingT % 1.6) / 1.6;
      const base = 0.05 * Math.max(0.15, near);
      ring.scale.setScalar(base * (0.3 + k * 1.2));
      ringMat.opacity = 0.9 * (1 - k);
      ringCore.scale.setScalar(base * 0.9);
    }

    // Labels only re-layout when the view actually changed.
    if (labelsDirty || lastCam.distanceToSquared(camera.position) > 1e-9) {
      lastCam.copy(camera.position);
      labels.update(camera, W, H, z);
      labelsDirty = false;
      const zr = Math.round(z * 10) / 10;
      if (zr !== lastZoomReported) {
        lastZoomReported = zr;
        onZoom(zr);
      }
    }

    renderer.render(scene, camera);
  };
  animate();

  // ── Teardown ────────────────────────────────────────────────────────────────
  const dispose = () => {
    stopped = true;
    cancelAnimationFrame(raf);
    clearTimeout(idleTimer);
    window.removeEventListener("resize", onResize);
    dom.removeEventListener("pointermove", onPointerMove);
    dom.removeEventListener("pointerleave", onPointerLeave);
    dom.removeEventListener("pointerdown", onPointerDown);
    dom.removeEventListener("pointerup", onPointerUp);
    if (window.DreamGlobe === api) delete window.DreamGlobe;
    controls.dispose();
    labels.dispose();
    glowTex.dispose();
    for (const g of fillCache.values()) g.dispose();
    for (const g of outlineCache.values()) g.dispose();
    scene.traverse((o) => {
      o.geometry?.dispose?.();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        for (const key of Object.keys(m)) {
          const val = m[key];
          if (val && val.isTexture) val.dispose();
        }
        m.dispose();
      }
    });
    renderer.dispose();
    renderer.domElement.remove();
  };

  return {
    renderer,
    scene,
    camera,
    controls,
    globe,
    flyTo,
    addMarker,
    zoomBy,
    home,
    ping,
    setViewShift,
    setPlacing,
    setGeo,
    setSelection,
    zoomLevel,
    dispose,
  };
}
