import * as THREE from "three";
import { ll2v } from "./latlng.js";

/**
 * Screen-space DOM labels for countries, states/provinces and cities.
 *
 * Every frame the camera moved, candidates are filtered by zoom (Natural Earth's
 * min_label / scalerank), projected, culled at the horizon, and placed greedily
 * by priority with a simple rectangle-collision test. Labels that were on screen
 * last frame get a bonus, so the set doesn't flicker while you rotate.
 */
export function createLabels(container) {
  const layer = document.createElement("div");
  layer.className = "lbl-layer";
  container.appendChild(layer);

  let entries = [];
  const live = new Map(); // id → element
  const lastShown = new Set();
  const v = new THREE.Vector3();
  let focus = { countryId: null, stateId: null };

  const CHAR_W = { country: 7.4, state: 6.3, city: 6.6 };
  const H = { country: 14, state: 13, city: 13 };

  function setEntries(list) {
    entries = list.map((e) => ({ ...e, pos: ll2v(e.lat, e.lng, 1) }));
  }

  function setFocus(f) {
    focus = f;
  }

  /** Is this entry allowed at zoom z (see scene zoomLevel())? */
  function eligible(e, z) {
    const inFocus = focus.countryId && e.c === focus.countryId;
    if (e.kind === "country") return e.ml <= z + 0.2 || e.c === focus.countryId;
    if (e.kind === "state") {
      if (e.id === focus.stateId) return true;
      if (inFocus) return z >= 2.6;
      return z >= 4.6 && e.ml <= z + 1.2;
    }
    // city
    if (e.id === focus.cityId) return true;
    if (inFocus && e.rank <= z * 1.3 - 1) return true;
    return e.rank <= (z - 3.2) * 1.7;
  }

  function priority(e) {
    let p = 0;
    if (e.kind === "country") p = 100 - e.lr * 4;
    else if (e.kind === "state") p = 60 - e.lr * 2;
    else p = 70 - e.rank * 5 + (e.cap === 2 ? 20 : e.cap === 1 ? 6 : 0);
    if (focus.countryId && e.c === focus.countryId) {
      // Inside the focused country, its states and cities beat its own label.
      p += e.kind === "country" ? 0 : 60;
    }
    if (e.id === focus.stateId || e.id === focus.cityId) p += 300;
    if (lastShown.has(e.id)) p += 12;
    return p;
  }

  function update(camera, width, height, z) {
    const cam = camera.position;
    const camLen = cam.length();
    const cands = [];
    for (const e of entries) {
      if (!eligible(e, z)) continue;
      // Horizon test: p·c > 1 means the point faces the camera; add margin.
      const facing = (e.pos.dot(cam) - 1) / camLen;
      if (facing < 0.04) continue;
      v.copy(e.pos).project(camera);
      if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) continue;
      const x = (v.x * 0.5 + 0.5) * width;
      const y = (-v.y * 0.5 + 0.5) * height;
      const w = e.text.length * CHAR_W[e.kind] + (e.kind === "city" ? 12 : 8);
      const h = H[e.kind];
      cands.push({ e, x, y, w, h, fade: Math.min(1, (facing - 0.04) / 0.12), pr: priority(e) });
    }
    cands.sort((a, b) => b.pr - a.pr);

    const placed = [];
    const shown = new Set();
    const MAX = width < 640 ? 45 : 110;
    for (const c of cands) {
      if (placed.length >= MAX) break;
      // Cities anchor on their dot (left-aligned text), others are centred.
      const x0 = c.e.kind === "city" ? c.x - 4 : c.x - c.w / 2;
      const y0 = c.y - c.h / 2;
      const r = [x0 - 3, y0 - 2, x0 + c.w + 3, y0 + c.h + 2];
      if (r[2] < 0 || r[0] > width || r[3] < 0 || r[1] > height) continue;
      let hit = false;
      for (const q of placed) {
        if (r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]) {
          hit = true;
          break;
        }
      }
      if (hit) continue;
      placed.push(r);
      shown.add(c.e.id);
      let el = live.get(c.e.id);
      if (!el) {
        el = document.createElement("div");
        el.className = `lbl lbl-${c.e.kind}${c.e.cap === 2 ? " lbl-capital" : ""}`;
        el.textContent = c.e.text;
        layer.appendChild(el);
        live.set(c.e.id, el);
      }
      const isFocus = c.e.id === focus.stateId || c.e.id === focus.cityId || (c.e.kind === "country" && c.e.c === focus.countryId);
      el.classList.toggle("focus", isFocus);
      el.style.transform = `translate3d(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px, 0)`;
      el.style.setProperty("--fade", c.fade.toFixed(2));
    }
    for (const [id, el] of live) {
      if (!shown.has(id)) {
        el.remove();
        live.delete(id);
      }
    }
    lastShown.clear();
    for (const id of shown) lastShown.add(id);
  }

  function dispose() {
    layer.remove();
    live.clear();
  }

  return { setEntries, setFocus, update, dispose };
}
