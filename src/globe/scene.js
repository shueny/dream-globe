import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ll2v, v2ll } from "./latlng.js";
import { glowTexture } from "./glowTexture.js";

/**
 * Pure Three.js scene for the Dream Globe. Knows nothing about React.
 *
 * initScene(mount, opts) builds the renderer/camera/globe/lights/controls, wires
 * markers + arcs + raycast interaction, starts the RAF loop, and returns a
 * context whose dispose() fully tears everything down — required so React 18/19
 * StrictMode's double-mount doesn't leave two canvases, two renderers, or two RAF
 * loops stacked on top of each other (brief §4 mine 3).
 *
 * Communication with React is one-way callbacks (opts.on*) out, and imperative
 * methods (flyTo/addMarker/dolly/setPlacing) in. The scene never touches React,
 * and React never touches Three.js internals (brief §2 boundary).
 *
 * r128 → r160+ migration applied here (brief §5):
 *  - OrbitControls imported from three/addons (no global THREE.OrbitControls)
 *  - renderer.outputColorSpace / texture.colorSpace = SRGBColorSpace
 *  - THREE.Clock → THREE.Timer (Clock deprecated in r185)
 *  - AmbientLight/DirectionalLight intensities are the r128-tuned README values;
 *    they read correctly under modern lighting, so no retune was needed.
 *
 * @param {HTMLElement} mount
 * @param {{
 *   dreams?: Array, arcPairs?: Array<[number,number]>,
 *   onHover?: (tip: {who:string, place:string, x:number, y:number} | null) => void,
 *   onSelect?: (dream: object) => void,
 *   onPlace?: (coords: {lat:number, lng:number}) => void,
 *   onCount?: (added: number) => void,
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
  } = opts;

  const R = 1;
  const W = mount.clientWidth || window.innerWidth;
  const H = mount.clientHeight || window.innerHeight;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
  // Initial framing: lat 22 / lng -18 direction × 2.55 radius (Atlantic/Africa/Europe).
  camera.position.copy(ll2v(22, -18, 1).normalize().multiplyScalar(2.55));

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  mount.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.5;
  controls.enablePan = false;
  controls.minDistance = 1.5;
  controls.maxDistance = 5;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.35;

  // Idle auto-rotate: off while interacting, back on 4s after the last interaction.
  let idleTimer = null;
  const scheduleIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      controls.autoRotate = true;
    }, 4000);
  };
  controls.addEventListener("start", () => {
    controls.autoRotate = false;
    clearTimeout(idleTimer);
  });
  controls.addEventListener("end", scheduleIdle);

  const globe = new THREE.Group();
  scene.add(globe);

  // ── Earth mesh ──────────────────────────────────────────────────────────
  const earthGeo = new THREE.SphereGeometry(R, 64, 64);
  const earthMat = new THREE.MeshStandardMaterial({
    color: 0x0a1d3a,
    emissive: 0x0a1830,
    emissiveIntensity: 1,
    roughness: 1,
    metalness: 0,
  });
  const earth = new THREE.Mesh(earthGeo, earthMat);
  globe.add(earth);

  // Textures self-hosted from /public/textures, with CDN fallback (brief §6).
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous");
  const cdnHosts = [
    "https://unpkg.com/three-globe/example/img/",
    "https://cdn.jsdelivr.net/npm/three-globe/example/img/",
  ];
  const loadTex = (file, onLoad) => {
    const sources = [`/textures/${file}`, ...cdnHosts.map((h) => h + file)];
    let i = 0;
    const tryNext = () => {
      if (i >= sources.length) return;
      loader.load(sources[i], onLoad, undefined, () => {
        i++;
        tryNext();
      });
    };
    tryNext();
  };
  // Base map: blue-marble, dark-tinted so continents read over the ocean.
  loadTex("earth-blue-marble.jpg", (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    earthMat.map = tex;
    earthMat.color = new THREE.Color(0x8aa6cc);
    earthMat.needsUpdate = true;
  });
  // Glow layer: night-side city lights as an emissive map.
  loadTex("earth-night.jpg", (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    earthMat.emissiveMap = tex;
    earthMat.emissive = new THREE.Color(0xffd49a);
    earthMat.emissiveIntensity = 1.05;
    earthMat.needsUpdate = true;
  });

  // ── Graticule ───────────────────────────────────────────────────────────
  const gridMat = new THREE.LineBasicMaterial({
    color: 0x2a5a8a,
    transparent: true,
    opacity: 0.25,
  });
  const wireGeo = new THREE.SphereGeometry(R * 1.001, 24, 16);
  const wireframe = new THREE.WireframeGeometry(wireGeo);
  const graticule = new THREE.LineSegments(wireframe, gridMat);
  globe.add(graticule);

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
  const atmGeo = new THREE.SphereGeometry(R, 64, 64);
  const atmosphere = new THREE.Mesh(atmGeo, atmMat);
  atmosphere.scale.set(1.16, 1.16, 1.16);
  scene.add(atmosphere);

  // ── Lights (dim so night-side city lights dominate) ────────────────────────
  const ambient = new THREE.AmbientLight(0x54657f, 0.5);
  scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xdce8ff, 1.25);
  dir.position.set(-1.6, 1.0, 2.4);
  scene.add(dir);

  // ── Markers ─────────────────────────────────────────────────────────────
  const glowTex = glowTexture();
  const markerGroup = new THREE.Group();
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

  const addArc = (a, b) => {
    const va = ll2v(a.lat, a.lng, 1.01);
    const vb = ll2v(b.lat, b.lng, 1.01);
    const mid = va.clone().add(vb).multiplyScalar(0.5);
    const lift = 1 + va.distanceTo(vb) * 0.35;
    mid.normalize().multiplyScalar(lift);
    const curve = new THREE.QuadraticBezierCurve3(va, mid, vb);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 40, 0.004, 6, false),
      new THREE.MeshBasicMaterial({
        color: 0x6fd8ff,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
      }),
    );
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

  // ── Interaction (raycast hover / click / placing) ──────────────────────────
  const ray = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const dom = renderer.domElement;
  let placing = false;
  let hovered = null;
  let downX = 0;
  let downY = 0;
  let onMarkerClick = null; // set via the public API (brief §7)

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

  const onPointerMove = (e) => {
    setMouse(e);
    ray.setFromCamera(mouse, camera);
    const hits = ray.intersectObjects(markers, false).filter((h) => facing(h.object));
    if (hits.length) {
      hovered = hits[0].object;
      const dr = hovered.userData.dream;
      dom.style.cursor = "pointer";
      onHover({
        who: dr.name + ", " + dr.age,
        place: dr.city + " · " + dr.country,
        x: e.clientX,
        y: e.clientY,
      });
    } else {
      hovered = null;
      dom.style.cursor = placing ? "crosshair" : "grab";
      onHover(null);
    }
  };

  const onPointerDown = (e) => {
    downX = e.clientX;
    downY = e.clientY;
  };

  const onPointerUp = (e) => {
    const moved = Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY);
    if (moved > 5) return; // it was a drag, not a click

    if (placing) {
      setMouse(e);
      ray.setFromCamera(mouse, camera);
      const hit = ray.intersectObject(earth, false);
      if (hit.length) {
        const local = globe.worldToLocal(hit[0].point.clone());
        const ll = v2ll(local);
        onPlace(ll); // React decides what to do (Round 2: drop now; Round 3: open modal)
      }
      return;
    }

    if (hovered) {
      const dr = hovered.userData.dream;
      onSelect(dr); // React opens the card
      if (onMarkerClick) onMarkerClick(dr); // public API callback (brief §7)
      flyTo(dr.lat, dr.lng);
    }
  };

  dom.addEventListener("pointermove", onPointerMove);
  dom.addEventListener("pointerdown", onPointerDown);
  dom.addEventListener("pointerup", onPointerUp);

  // ── Camera moves ───────────────────────────────────────────────────────────
  let fly = null;

  /**
   * Fly the camera to a lat/lng over ~1.1s.
   *
   * Kept EXACTLY as the prototype: lerp the camera's normalized direction and
   * its radius, NOT a quaternion slerp of setFromUnitVectors — that went
   * singular (camera flip/lock) at some angles in the prototype (brief §3).
   */
  function flyTo(lat, lng) {
    controls.autoRotate = false;
    controls.enabled = false;
    clearTimeout(idleTimer);
    fly = {
      fromDir: camera.position.clone().normalize(),
      toDir: ll2v(lat, lng, 1).normalize(),
      fromR: camera.position.length(),
      toR: 2.1,
      t: 0,
      dur: 1.1,
    };
  }

  const dolly = (f) => {
    const len = Math.max(
      controls.minDistance,
      Math.min(controls.maxDistance, camera.position.length() * f),
    );
    camera.position.setLength(len);
    controls.update();
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
    dom.style.cursor = v ? "crosshair" : "grab";
  };

  // ── Public API (brief §7) — also exposed via useImperativeHandle in React ────
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
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener("resize", onResize);

  // ── Animation loop ──────────────────────────────────────────────────────────
  const timer = new THREE.Timer();
  let raf = 0;
  let stopped = false;
  const animate = () => {
    if (stopped) return;
    raf = requestAnimationFrame(animate);
    timer.update();
    const t = timer.getElapsed();

    // Marker pulse + back-face fade.
    for (const m of markers) {
      const s = m.userData.base * (1 + 0.28 * Math.sin(t * 2.4 + m.userData.phase));
      m.scale.set(s, s, s);
      m.material.opacity = facing(m) ? 1 : 0.12;
    }
    // Arc travellers.
    for (const a of arcs) {
      a.t = (a.t + a.speed * 0.016) % 1;
      a.trav.position.copy(a.curve.getPoint(a.t));
    }
    // Fly tween (direction + radius lerp; see flyTo note).
    if (fly) {
      fly.t += 0.016 / fly.dur;
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
      renderer.render(scene, camera);
    } else {
      controls.update();
      renderer.render(scene, camera);
    }
  };
  animate();

  // ── Teardown ────────────────────────────────────────────────────────────────
  const dispose = () => {
    stopped = true;
    cancelAnimationFrame(raf);
    clearTimeout(idleTimer);
    window.removeEventListener("resize", onResize);
    dom.removeEventListener("pointermove", onPointerMove);
    dom.removeEventListener("pointerdown", onPointerDown);
    dom.removeEventListener("pointerup", onPointerUp);
    if (window.DreamGlobe === api) delete window.DreamGlobe;
    controls.dispose();
    glowTex.dispose();
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

  return { renderer, scene, camera, controls, globe, flyTo, addMarker, dolly, setPlacing, dispose };
}
