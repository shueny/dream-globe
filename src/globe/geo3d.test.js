import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { buildGeo } from "../geo/data.js";
import { ll2v, v2ll } from "./latlng.js";
import {
  buildBorderLayers,
  buildCountryStateBorders,
  buildFillGeometry,
  buildOutlineGeometry,
  makeOutlineMaterial,
} from "./geoLayers.js";

const read = (f) => JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../public/geo", f), "utf8"));
let geo;
beforeAll(() => {
  geo = buildGeo(read("world.topo.json"), read("places.json"));
});

describe("latlng", () => {
  it.each([
    [0, 0],
    [25.03, 121.56],
    [-33.9, -70.7],
    [89.5, 179.9],
    [-60, -179.9],
  ])("round-trips (%f, %f)", (lat, lng) => {
    const back = v2ll(ll2v(lat, lng, 1.7));
    expect(back.lat).toBeCloseTo(lat, 6);
    expect(back.lng).toBeCloseTo(lng, 6);
  });

  it("puts points on the requested radius", () => {
    expect(ll2v(12, 34, 2.5).length()).toBeCloseTo(2.5, 9);
  });
});

describe("geoLayers", () => {
  it("builds country and state border line segments hugging the sphere", () => {
    const b = buildBorderLayers(geo);
    const pos = b.countries.geometry.getAttribute("position");
    expect(pos.count).toBeGreaterThan(10_000);
    expect(pos.count % 2).toBe(0);
    const v = new THREE.Vector3().fromBufferAttribute(pos, 123);
    expect(v.length()).toBeCloseTo(1.0009, 4);
    expect(b.states.geometry.getAttribute("position").count).toBeGreaterThan(pos.count / 4);
  });

  it("builds internal state borders only for multi-state countries", () => {
    const mat = new THREE.LineBasicMaterial();
    expect(buildCountryStateBorders(geo, "JPN", mat)).not.toBeNull();
    expect(buildCountryStateBorders(geo, "MCO", mat)).toBeNull();
  });

  it("triangulates fills with no oversized triangles", () => {
    for (const id of ["JPN", "RUS", "ATA", "ZAF"]) {
      const g = buildFillGeometry(geo.countryById.get(id));
      const p = g.getAttribute("position");
      expect(p.count, id).toBeGreaterThan(0);
      expect(p.count % 3, id).toBe(0);
      // Every vertex sits just above the surface.
      const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i += 97) expect(v.fromBufferAttribute(p, i).length()).toBeCloseTo(1.0014, 4);
    }
  });

  it("returns an empty fill for degenerate input", () => {
    const g = buildFillGeometry({ polys: [[[[0, 0], [1, 1], [0, 0]]]] });
    expect(g.getAttribute("position").count).toBe(0);
  });

  it("builds outlines and a screen-space line material", () => {
    const g = buildOutlineGeometry(geo.countryById.get("TWN"));
    expect(g.getAttribute("instanceStart").count).toBeGreaterThan(50);
    const m = makeOutlineMaterial(0xffffff, 2, 0.5);
    expect(m.linewidth).toBe(2);
    expect(m.opacity).toBe(0.5);
  });
});
