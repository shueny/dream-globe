import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ll2v } from "./latlng.js";

/**
 * Pure Three.js scene for the Dream Globe. Knows nothing about React.
 *
 * initScene(mount) builds the renderer/camera/globe/lights/controls, starts the
 * RAF loop, and returns a context whose dispose() fully tears everything down —
 * required so React 18/19 StrictMode's double-mount doesn't leave two canvases,
 * two renderers, or two RAF loops stacked on top of each other (brief §4 mine 3).
 *
 * Round 1 scope: earth + graticule + atmosphere + lights + OrbitControls only.
 * Markers, arcs, fly-to, raycasting and the public API land in Round 2.
 *
 * r128 → r160+ migration applied here (brief §5):
 *  - OrbitControls imported from three/addons (no global THREE.OrbitControls)
 *  - renderer.outputColorSpace / texture.colorSpace = SRGBColorSpace
 *    (replaces outputEncoding / texture.encoding = sRGBEncoding)
 *  - AmbientLight/DirectionalLight intensities are the r128-tuned README values;
 *    modern (non-legacy) lighting may read differently, retune vs the spec if so.
 */
export function initScene(mount) {
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
  controls.addEventListener("start", () => {
    controls.autoRotate = false;
    clearTimeout(idleTimer);
  });
  controls.addEventListener("end", () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      controls.autoRotate = true;
    }, 4000);
  });

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
  // THREE.Clock is deprecated in r185; Timer (core export) is the replacement (brief §8 #11).
  const timer = new THREE.Timer();
  let raf = 0;
  let stopped = false;
  const animate = () => {
    if (stopped) return;
    raf = requestAnimationFrame(animate);
    // Timer advanced every frame so Round 2's pulse/arc timing is continuous.
    timer.update();
    controls.update();
    renderer.render(scene, camera);
  };
  animate();

  // ── Teardown ────────────────────────────────────────────────────────────────
  const dispose = () => {
    stopped = true;
    cancelAnimationFrame(raf);
    clearTimeout(idleTimer);
    window.removeEventListener("resize", onResize);
    controls.dispose();
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

  return { renderer, scene, camera, controls, globe, dispose };
}
