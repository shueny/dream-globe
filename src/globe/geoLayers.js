import * as THREE from "three";
import { mesh } from "topojson-client";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { ll2v } from "./latlng.js";

/**
 * Three.js layers built from the geo data: country + state borders, and the
 * on-demand fill / outline used to highlight a hovered or selected region.
 */

const R_BORDER = 1.0009;
const R_FILL = 1.0014;
const R_OUTLINE = 1.0022;
const MAX_STEP = 0.8; // degrees — densify long straight edges so they hug the sphere

/** Line-segment positions for a list of lng/lat polylines. */
function linePositions(lines, r) {
  const out = [];
  const v = new THREE.Vector3();
  const push = (lng, lat) => {
    v.copy(ll2v(lat, lng, r));
    out.push(v.x, v.y, v.z);
  };
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      const [x1, y1] = line[i];
      const [x2, y2] = line[i + 1];
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) / MAX_STEP));
      for (let s = 0; s < steps; s++) {
        const a = s / steps;
        const b = (s + 1) / steps;
        push(x1 + (x2 - x1) * a, y1 + (y2 - y1) * a);
        push(x1 + (x2 - x1) * b, y1 + (y2 - y1) * b);
      }
    }
  }
  return new Float32Array(out);
}

function lineSegments(lines, r, material) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(linePositions(lines, r), 3));
  const ls = new THREE.LineSegments(g, material);
  ls.renderOrder = 2;
  return ls;
}

/** Country borders + coastlines, and every internal state/province border. */
export function buildBorderLayers(geo) {
  const { topo } = geo;
  const countryMat = new THREE.LineBasicMaterial({
    color: 0x8cc8f0,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const stateMat = new THREE.LineBasicMaterial({
    color: 0x5f93c0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const countries = lineSegments(mesh(topo, topo.objects.countries).coordinates, R_BORDER, countryMat);
  const states = lineSegments(
    mesh(topo, topo.objects.states, (a, b) => a !== b && a.properties.c === b.properties.c).coordinates,
    R_BORDER - 0.0002,
    stateMat,
  );
  return { countries, states, countryMat, stateMat };
}

/** Bright internal borders for one country's states (shown when it's selected). */
export function buildCountryStateBorders(geo, countryId, material) {
  const { topo } = geo;
  const lines = mesh(
    topo,
    topo.objects.states,
    (a, b) => a !== b && a.properties.c === countryId && b.properties.c === countryId,
  ).coordinates;
  if (!lines.length) return null;
  return lineSegments(lines, R_BORDER + 0.0003, material);
}

// ── Fill: triangulate in lng/lat, subdivide, lift onto the sphere ─────────────

const MAX_TRI_EDGE = 2.5; // degrees

function subdivide(a, b, c, out, depth = 0) {
  const d = (p, q) => Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]));
  const ab = d(a, b);
  const bc = d(b, c);
  const ca = d(c, a);
  const m = Math.max(ab, bc, ca);
  if (m <= MAX_TRI_EDGE || depth > 7) {
    out.push(a, b, c);
    return;
  }
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  // Split the longest edge only — keeps triangle count low for thin slivers.
  if (m === ab) {
    const x = mid(a, b);
    subdivide(a, x, c, out, depth + 1);
    subdivide(x, b, c, out, depth + 1);
  } else if (m === bc) {
    const x = mid(b, c);
    subdivide(a, b, x, out, depth + 1);
    subdivide(a, x, c, out, depth + 1);
  } else {
    const x = mid(c, a);
    subdivide(a, b, x, out, depth + 1);
    subdivide(x, b, c, out, depth + 1);
  }
}

export function buildFillGeometry(region) {
  const pts = [];
  for (const poly of region.polys) {
    const toV2 = (ring) => {
      const r = ring.slice(0, -1).map(([x, y]) => new THREE.Vector2(x, y));
      return r;
    };
    const contour = toV2(poly[0]);
    const holes = poly.slice(1).map(toV2);
    if (contour.length < 3) continue;
    const all = contour.concat(...holes);
    let tris;
    try {
      tris = THREE.ShapeUtils.triangulateShape(contour, holes);
    } catch {
      continue;
    }
    for (const [i, j, k] of tris) {
      subdivide([all[i].x, all[i].y], [all[j].x, all[j].y], [all[k].x, all[k].y], pts);
    }
  }
  const arr = new Float32Array(pts.length * 3);
  pts.forEach(([lng, lat], i) => {
    const v = ll2v(lat, lng, R_FILL);
    arr[i * 3] = v.x;
    arr[i * 3 + 1] = v.y;
    arr[i * 3 + 2] = v.z;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
  return g;
}

export function buildOutlineGeometry(region) {
  const rings = region.polys.flat();
  const g = new LineSegmentsGeometry();
  g.setPositions(linePositions(rings, R_OUTLINE));
  return g;
}

export function makeOutlineMaterial(color, width, opacity = 1) {
  return new LineMaterial({
    color,
    linewidth: width,
    transparent: true,
    opacity,
    depthWrite: false,
    worldUnits: false,
  });
}

export { LineSegments2 };
