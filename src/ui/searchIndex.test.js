import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildGeo } from "../geo/data.js";
import { buildSearchIndex, norm, searchLocal } from "./searchIndex.js";
import { dreams } from "../data/dreams.js";

const read = (f) => JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../public/geo", f), "utf8"));
let index;

beforeAll(() => {
  index = buildSearchIndex(buildGeo(read("world.topo.json"), read("places.json")));
});

describe("norm", () => {
  it("lowercases, trims and strips diacritics", () => {
    expect(norm("  São Paulo ")).toBe("sao paulo");
    expect(norm(null)).toBe("");
  });
});

describe("searchLocal", () => {
  it("returns nothing for empty or whitespace queries", () => {
    expect(searchLocal(index, dreams, "")).toEqual([]);
    expect(searchLocal(index, dreams, "   ")).toEqual([]);
  });

  it("puts matching dreams first, then places", () => {
    const r = searchLocal(index, dreams, "kaoh");
    expect(r[0].type).toBe("dream");
    expect(r.map((x) => x.type)).toContain("city");
    expect(r.some((x) => x.type === "state" && x.ref.name === "Kaohsiung City")).toBe(true);
  });

  it("ranks the exact country match on top", () => {
    const r = searchLocal(index, [], "japan");
    expect(r[0]).toMatchObject({ type: "country", ref: { id: "JPN" } });
  });

  it("finds states by Chinese name, ISO code and accents-free spelling", () => {
    expect(searchLocal(index, [], "彰化縣")[0].ref.name).toBe("Changhua");
    expect(searchLocal(index, [], "US-CA")[0].ref.name).toBe("California");
    expect(searchLocal(index, [], "bogota").some((x) => x.ref.name === "Bogota" || x.ref.name === "Bogotá")).toBe(true);
  });

  it("caps results and de-duplicates identical rows", () => {
    const r = searchLocal(index, dreams, "san", 8);
    expect(r.length).toBeLessThanOrEqual(8);
    const keys = r.map((x) => `${x.type}:${x.title}:${x.sub}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("tolerates dreams with missing fields and very long pasted queries", () => {
    const partial = [{ name: "X", lat: 0, lng: 0 }, { city: null, country: undefined, text: "moon" }];
    expect(() => searchLocal(index, partial, "moon")).not.toThrow();
    expect(searchLocal(index, partial, "moon")[0].type).toBe("dream");
    expect(searchLocal(index, dreams, "a".repeat(5000))).toEqual([]);
  });
});
