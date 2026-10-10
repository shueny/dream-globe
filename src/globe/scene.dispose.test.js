// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildGeo } from "../geo/data.js";

/**
 * Leak guard for initScene().dispose().
 *
 * The real WebGLRenderer allocates GPU memory for a geometry / material /
 * texture the first time it draws it, and only frees it when that resource's
 * own dispose() runs. So the fake renderer below records every resource it
 * would have drawn, and the test asserts each one got a "dispose" event once
 * the scene is torn down. A resource that was drawn once and then detached
 * (swapped material, removed object) is exactly the leak this catches.
 */

const drawn = new Set();
let textureRequests = [];
let textureFails = () => false;
const disposed = new WeakSet();

function track(res) {
  if (!res || drawn.has(res)) return;
  drawn.add(res);
  res.addEventListener("dispose", () => disposed.add(res));
}

function texturesOf(material) {
  const out = [];
  for (const val of Object.values(material)) if (val?.isTexture) out.push(val);
  for (const u of Object.values(material.uniforms || {})) if (u?.value?.isTexture) out.push(u.value);
  return out;
}

vi.mock("three", async (importOriginal) => {
  const THREE = await importOriginal();

  class FakeRenderer {
    constructor() {
      this.domElement = document.createElement("canvas");
      this.capabilities = { getMaxAnisotropy: () => 8 };
      this.outputColorSpace = THREE.SRGBColorSpace;
      this.disposed = false;
    }
    setPixelRatio() {}
    setSize() {}
    render(scene) {
      // Draw only what is visible, like the real renderer (minus frustum culling).
      const visit = (o) => {
        if (!o.visible) return;
        if (o.geometry && o.material) {
          track(o.geometry);
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
            track(m);
            texturesOf(m).forEach(track);
          }
        }
        o.children.forEach(visit);
      };
      visit(scene);
    }
    dispose() {
      this.disposed = true;
    }
  }

  // Textures "load" on the next microtask so the earth maps are part of the
  // test; `textureFails(url)` lets a test make a source error instead.
  class FakeTextureLoader extends THREE.TextureLoader {
    load(url, onLoad, _onProgress, onError) {
      textureRequests.push(url);
      const tex = new THREE.Texture();
      queueMicrotask(() => (textureFails(url) ? onError(new Error(`404 ${url}`)) : onLoad(tex)));
      return tex;
    }
  }

  return { ...THREE, WebGLRenderer: FakeRenderer, TextureLoader: FakeTextureLoader };
});

const { initScene } = await import("./scene.js");
const { dreams: sampleDreams, arcPairs } = await import("../data/dreams.js");

let geo;
beforeAll(() => {
  const read = (f) => JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../public/geo", f), "utf8"));
  geo = buildGeo(read("world.topo.json"), read("places.json"));
});

// Manual animation frames on a virtual clock: initScene runs one frame on its
// own, then we step. performance.now() follows the same clock, so input
// timestamps and frame timestamps agree like they do in a browser.
let frames = [];
let clock = 0;
beforeEach(() => {
  clock = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  drawn.clear();
  textureRequests = [];
  textureFails = () => false;
  frames = [];
  let id = 0;
  vi.stubGlobal("requestAnimationFrame", (cb) => {
    frames.push({ id: ++id, cb });
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (h) => {
    frames = frames.filter((f) => f.id !== h);
  });
  // jsdom has no 2D canvas; the glow sprite only needs a gradient to paint.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    createRadialGradient: () => ({ addColorStop() {} }),
    fillRect() {},
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Each step advances the clock by `ms` (default: slower than the idle frame
// cap, so every step renders) and runs the frames that were due.
function step(n = 1, ms = 40) {
  for (let i = 0; i < n; i++) {
    clock += ms;
    const due = frames;
    frames = [];
    for (const f of due) f.cb(clock);
  }
}

function mountScene(opts = {}) {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  const dreams = sampleDreams.map((d) => ({ ...d }));
  const ctx = initScene(mount, { dreams, arcPairs, ...opts });
  return { mount, ctx, dreams };
}

describe("initScene dispose()", () => {
  it("frees every geometry, material and texture it ever drew", async () => {
    const { ctx, dreams } = mountScene();
    await Promise.resolve(); // earth textures arrive
    ctx.setGeo(geo);
    step();

    // Walk through the states that swap or detach resources.
    const jpn = geo.countryById.get("JPN");
    const usa = geo.countryById.get("USA");
    ctx.setSelection({ country: jpn });
    step();
    ctx.setSelection({ country: usa, state: usa.states[0] });
    step();
    ctx.setSelection({}); // focus borders + their material leave the scene
    step();
    ctx.setFocusDream(dreams[arcPairs[0][0]]); // arcs swap to the hot material
    step();
    ctx.setFocusDream(null); // …and back, leaving the hot material detached
    step();
    const added = ctx.addMarker(10, 20, { name: "Test" });
    expect(ctx.connect(added, 0)).toEqual({ ok: true });
    step(5);
    ctx.ping(35.68, 139.69);
    step();

    expect(drawn.size).toBeGreaterThan(20);
    ctx.dispose();

    const leaked = [...drawn].filter((r) => !disposed.has(r)).map((r) => `${r.type} #${r.id}`);
    expect(leaked).toEqual([]);
  });

  it("removes the canvas, labels, listeners, API and animation loop", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { mount, ctx } = mountScene();
    ctx.setGeo(geo);
    step();
    expect(mount.children.length).toBeGreaterThan(0);
    expect(window.DreamGlobe).toBeDefined();

    ctx.dispose();

    expect(mount.children).toHaveLength(0);
    expect(window.DreamGlobe).toBeUndefined();
    expect(ctx.renderer.disposed).toBe(true);
    expect(frames).toHaveLength(0);
    for (const [type, fn] of addSpy.mock.calls) {
      expect(removeSpy.mock.calls.some(([t, f]) => t === type && f === fn), type).toBe(true);
    }
  });
});

describe("initScene earth textures", () => {
  // Let every queued load/error microtask (and the retries they start) settle.
  const settle = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };

  it("loads the self-hosted WebP textures first", async () => {
    const onReady = vi.fn();
    const { ctx } = mountScene({ onReady });
    await settle();
    expect(textureRequests.sort()).toEqual(["/textures/earth-blue-marble.webp", "/textures/earth-night.webp"]);
    expect(ctx.globe.children[0].material.map).toBeTruthy();
    expect(ctx.globe.children[0].material.emissiveMap).toBeTruthy();
    expect(onReady).toHaveBeenCalledTimes(1);
    ctx.dispose();
  });

  it("falls back to the CDN JPGs when the WebP fails (e.g. no WebP support)", async () => {
    textureFails = (url) => url.endsWith(".webp");
    const onReady = vi.fn();
    const { ctx } = mountScene({ onReady });
    await settle();
    const day = textureRequests.filter((u) => u.includes("earth-blue-marble"));
    expect(day).toEqual(["/textures/earth-blue-marble.webp", "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg"]);
    expect(ctx.globe.children[0].material.map).toBeTruthy();
    expect(onReady).toHaveBeenCalledTimes(1);
    ctx.dispose();
  });

  it("still reports ready when every source fails, with the plain material", async () => {
    textureFails = () => true;
    const onReady = vi.fn();
    const { ctx } = mountScene({ onReady });
    await settle();
    expect(textureRequests).toHaveLength(6); // 2 textures × (local + 2 CDNs)
    expect(ctx.globe.children[0].material.map).toBeNull();
    expect(onReady).toHaveBeenCalledTimes(1);
    ctx.dispose();
  });

  it("ignores textures that arrive after dispose()", async () => {
    const onReady = vi.fn();
    const { ctx } = mountScene({ onReady });
    const earthMat = ctx.globe.children[0].material;
    ctx.dispose(); // unmounted while both requests are in flight
    await settle();
    expect(earthMat.map).toBeNull();
    expect(onReady).not.toHaveBeenCalled();
  });
});

describe("initScene idle frame cap", () => {
  const HZ60 = 1000 / 60;
  const settle = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };
  // Mount, let textures land and the start-up input window (none) pass.
  async function idleScene() {
    const s = mountScene();
    await settle();
    step(1, 2000);
    const render = vi.spyOn(s.ctx.renderer, "render");
    return { ...s, render };
  }
  const azimuth = (ctx) => Math.atan2(ctx.camera.position.x, ctx.camera.position.z);

  it("renders at most ~30fps when nothing is happening", async () => {
    const { ctx, render } = await idleScene();
    step(60, HZ60); // one second on a 60Hz display
    expect(render.mock.calls.length).toBeGreaterThanOrEqual(29);
    expect(render.mock.calls.length).toBeLessThanOrEqual(31);
    render.mockClear();
    step(120, 1000 / 120); // one second on a 120Hz display
    expect(render.mock.calls.length).toBeGreaterThanOrEqual(28);
    expect(render.mock.calls.length).toBeLessThanOrEqual(31);
    ctx.dispose();
  });

  it("renders every frame while the pointer moves, then drops back after 1s", async () => {
    const { ctx, render } = await idleScene();
    for (let i = 0; i < 30; i++) {
      ctx.renderer.domElement.dispatchEvent(new Event("pointermove"));
      step(1, HZ60);
    }
    expect(render).toHaveBeenCalledTimes(30);
    step(60, HZ60); // the first second after the last move is still full rate
    render.mockClear();
    step(60, HZ60);
    expect(render.mock.calls.length).toBeLessThanOrEqual(31);
    ctx.dispose();
  });

  it("renders every frame while dragging (controls start → end)", async () => {
    const { ctx, render } = await idleScene();
    ctx.controls.dispatchEvent({ type: "start" });
    step(120, HZ60); // a 2s drag with no pointer events reaching the canvas
    expect(render).toHaveBeenCalledTimes(120);
    ctx.controls.dispatchEvent({ type: "end" });
    step(60, HZ60);
    render.mockClear();
    step(60, HZ60);
    expect(render.mock.calls.length).toBeLessThanOrEqual(31);
    ctx.dispose();
  });

  it("renders every frame during a camera flight", async () => {
    const { ctx, render } = await idleScene();
    ctx.flyTo(35.68, 139.69);
    step(30, HZ60); // mid-flight (a flight lasts ≥ 0.8s)
    expect(render).toHaveBeenCalledTimes(30);
    ctx.dispose();
  });

  it("renders every frame while a new connection draws itself in", async () => {
    const { ctx, render } = await idleScene();
    expect(ctx.connect(0, 5)).toEqual({ ok: true }); // a pair with no arc yet
    step(30, HZ60); // the draw-in takes ~1.2s
    expect(render).toHaveBeenCalledTimes(30);
    ctx.dispose();
  });

  it("renders every frame while the view eases aside for a panel", async () => {
    const { ctx, render } = await idleScene();
    ctx.setViewShift(-180, 0);
    step(20, HZ60);
    expect(render).toHaveBeenCalledTimes(20);
    ctx.dispose();
  });

  it("auto-rotates at the same steady speed whether capped or at full rate", async () => {
    // OrbitControls damping eases auto-rotate in over a fixed number of frames,
    // so warm up for 1s and compare the steady speed over the next 2s.
    // Idle: capped to ~30fps.
    const a = await idleScene();
    step(60, HZ60);
    const a0 = azimuth(a.ctx);
    step(120, HZ60);
    const idleTurn = azimuth(a.ctx) - a0;
    a.ctx.dispose();

    // Pointer moving every frame: full 60fps, auto-rotate still on.
    const b = await idleScene();
    for (let i = 0; i < 60; i++) {
      b.ctx.renderer.domElement.dispatchEvent(new Event("pointermove"));
      step(1, HZ60);
    }
    const b0 = azimuth(b.ctx);
    for (let i = 0; i < 120; i++) {
      b.ctx.renderer.domElement.dispatchEvent(new Event("pointermove"));
      step(1, HZ60);
    }
    const activeTurn = azimuth(b.ctx) - b0;
    b.ctx.dispose();

    expect(Math.abs(idleTurn)).toBeGreaterThan(0);
    expect(idleTurn / activeTurn).toBeGreaterThan(0.97);
    expect(idleTurn / activeTurn).toBeLessThan(1.03);
  });
});
