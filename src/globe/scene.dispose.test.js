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

// Manual animation frames: initScene runs one frame on its own, then we step.
let frames = [];
beforeEach(() => {
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

function step(n = 1) {
  for (let i = 0; i < n; i++) {
    const due = frames;
    frames = [];
    for (const f of due) f.cb(performance.now());
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
