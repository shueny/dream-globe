import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  angularDist,
  buildGeo,
  flagEmoji,
  fmtArea,
  fmtCompact,
  fmtLatLng,
  loadGeo,
  regionContains,
  regionView,
  stripRank,
  subdivisionSummary,
} from "./data.js";

const read = (f) => JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../public/geo", f), "utf8"));
let topo;
let places;
let geo;

beforeAll(() => {
  topo = read("world.topo.json");
  places = read("places.json");
  geo = buildGeo(topo, places);
});

describe("buildGeo", () => {
  it("indexes every country and state/province", () => {
    expect(geo.countries).toHaveLength(258);
    expect(geo.states).toHaveLength(4596);
    expect(geo.countryById.get("JPN").states).toHaveLength(47);
    expect(geo.countryById.get("USA").states).toHaveLength(51);
    expect(geo.countryById.get("TWN").states).toHaveLength(21);
  });

  it("links every state to an existing country", () => {
    for (const s of geo.states) expect(s.country, s.id).toBeTruthy();
  });

  it("sorts states alphabetically and finds capitals", () => {
    const names = geo.countryById.get("JPN").states.map((s) => s.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(geo.countryById.get("JPN").capital.name).toBe("Tokyo");
    expect(geo.countryById.get("TWN").capital.name).toBe("Taipei");
    expect(geo.countryById.get("FRA").capital.name).toBe("Paris");
  });

  it("computes spherical areas close to reference values", () => {
    const within = (v, ref, tol) => expect(Math.abs(v - ref) / ref).toBeLessThan(tol);
    within(geo.countryById.get("JPN").area, 377_975, 0.03);
    within(geo.countryById.get("FRA").area, 640_679, 0.05);
    const ca = geo.countryById.get("USA").states.find((s) => s.name === "California");
    within(ca.area, 403_466, 0.04); // land area
  });

  it("derives shared-border neighbours from the topology", () => {
    const us = geo.countryById.get("USA");
    expect(us.neighbors.map((n) => n.id).sort()).toEqual(["CAN", "MEX"]);
    expect(geo.countryById.get("JPN").neighbors).toEqual([]);
    const ca = us.states.find((s) => s.name === "California");
    expect(ca.neighbors.map((n) => n.name).sort()).toEqual(["Arizona", "Baja California", "Nevada", "Oregon"]);
  });
});

describe("locate", () => {
  it.each([
    [25.03, 121.56, "TWN", "Taipei City"],
    [35.68, 139.69, "JPN", "Tokyo"],
    [40.71, -74.0, "USA", "New York"],
    [64.8, -147.7, "USA", "Alaska"],
    [-33.87, 151.2, "AUS", "New South Wales"],
    [65, 178, "RUS", "Chukchi Autonomous Okrug"], // east of the antimeridian split
    [-85, 0, "ATA", undefined], // Antarctica reaches the pole
  ])("(%f, %f) → %s / %s", (lat, lng, c, s) => {
    const r = geo.locate(lat, lng);
    expect(r.country?.id).toBe(c);
    if (s) expect(r.state?.name).toBe(s);
  });

  it("returns nulls over the open ocean", () => {
    expect(geo.locate(0, -30)).toEqual({ country: null, state: null });
  });

  it("does not throw on out-of-range or NaN coordinates", () => {
    expect(geo.locate(NaN, NaN)).toEqual({ country: null, state: null });
    expect(geo.locate(95, 400)).toEqual({ country: null, state: null });
  });

  it("respects polygon holes (Lesotho inside South Africa)", () => {
    const zaf = geo.countryById.get("ZAF");
    expect(regionContains(zaf, 28.2, -29.5)).toBe(false);
    expect(geo.locate(-29.5, 28.2).country.id).toBe("LSO");
  });
});

describe("placesInState", () => {
  it("assigns cities by point-in-polygon and caches the result", () => {
    const ca = geo.countryById.get("USA").states.find((s) => s.name === "California");
    const list = geo.placesInState(ca);
    expect(list.slice(0, 2).map((p) => p.name)).toEqual(["Los Angeles", "San Francisco"]);
    expect(geo.placesInState(ca)).toBe(list);
  });

  it("returns an empty list for a state without mapped cities", () => {
    const tiny = geo.states.find((s) => s.country && s.country.places.length === 0);
    expect(geo.placesInState(tiny)).toEqual([]);
  });
});

describe("regionView", () => {
  it("frames the part of the country containing the label point", () => {
    const v = regionView(geo.countryById.get("USA"));
    expect(v.lat).toBeCloseTo(39.54, 1);
    expect(v.dist).toBeGreaterThan(1.8);
    expect(v.dist).toBeLessThan(3.1);
  });

  it("zooms closer for small regions and clamps huge ones", () => {
    const tokyo = geo.countryById.get("JPN").states.find((s) => s.name === "Tokyo");
    expect(regionView(tokyo).dist).toBeLessThan(1.5);
    expect(regionView(tokyo).dist).toBeGreaterThanOrEqual(1.16);
    expect(regionView(geo.countryById.get("ATA")).dist).toBeLessThanOrEqual(3.1);
  });

  it("falls back to the largest part when the label point is outside every polygon", () => {
    const fr = geo.countryById.get("FRA");
    const v = regionView({ ...fr, label: { lat: 0, lng: -30 } });
    expect(Number.isFinite(v.dist)).toBe(true);
  });
});

describe("loadGeo", () => {
  it("fetches both data files relative to the base URL", async () => {
    const fetchMock = vi.fn((url) =>
      Promise.resolve({ json: () => Promise.resolve(url.includes("topo") ? topo : places) }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const g = await loadGeo("./");
    expect(fetchMock.mock.calls.map((c) => c[0]).sort()).toEqual(["./geo/places.json", "./geo/world.topo.json"]);
    expect(g.countries).toHaveLength(258);
    vi.unstubAllGlobals();
  });
});

describe("formatting", () => {
  it("builds flag emoji and falls back for invalid codes", () => {
    expect(flagEmoji("TW")).toBe("🇹🇼");
    expect(flagEmoji("-99")).toBe("🏳️");
    expect(flagEmoji(null)).toBe("🏳️");
  });

  it("formats compact numbers", () => {
    expect(fmtCompact(null)).toBe("—");
    expect(fmtCompact(0)).toBe("0");
    expect(fmtCompact(950)).toBe("950");
    expect(fmtCompact(1500)).toBe("1.5K");
    expect(fmtCompact(23_568_378)).toBe("24M");
    expect(fmtCompact(1.4e9)).toBe("1.4B");
    expect(fmtCompact(2.1e13)).toBe("21T");
  });

  it("formats areas and coordinates", () => {
    expect(fmtArea(1188.4)).toBe("1,188 km²");
    expect(fmtArea(372_480)).toBe("372K km²");
    expect(fmtArea(9_446_866)).toBe("9.45M km²");
    expect(fmtLatLng(25.03, 121.56)).toBe("25.03°N · 121.56°E");
    expect(fmtLatLng(-33.87, -70.1)).toBe("33.87°S · 70.10°W");
  });

  it("strips Natural Earth rank prefixes", () => {
    expect(stripRank("4. Lower middle income")).toBe("Lower middle income");
    expect(stripRank(null)).toBe("");
  });

  it("summarises subdivision types with plurals", () => {
    expect(subdivisionSummary(geo.countryById.get("USA"))).toEqual(["50 States", "1 Federal District"]);
    expect(subdivisionSummary({ states: [{ p: { t: "County" } }, { p: { t: "County" } }, { p: {} }] })).toEqual([
      "2 Counties",
      "1 Region",
    ]);
    expect(subdivisionSummary({ states: [{ p: { t: "Parish" } }, { p: { t: "Parish" } }] })).toEqual(["2 Parishes"]);
  });

  it("measures angular distance", () => {
    expect(angularDist(0, 0, 0, 180)).toBeCloseTo(Math.PI, 6);
    expect(angularDist(10, 10, 10, 10)).toBe(0);
  });
});
