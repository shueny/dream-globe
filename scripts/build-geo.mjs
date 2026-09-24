/**
 * Builds the compact geo data the globe ships with, from Natural Earth
 * (public domain — https://www.naturalearthdata.com).
 *
 *   pnpm build:geo
 *
 * Outputs (committed, so a normal `pnpm build` never needs the network):
 *   public/geo/world.topo.json — countries + states/provinces in ONE topology,
 *                                 so shared borders and coastlines line up exactly
 *   public/geo/places.json     — ~7k populated places as compact rows
 */
import fs from "node:fs";
import path from "node:path";
import mapshaper from "mapshaper";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, "scripts/.cache");
const OUT = path.join(ROOT, "public/geo");
const NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/";
const SOURCES = [
  "ne_10m_admin_0_countries",
  "ne_10m_admin_1_states_provinces",
  "ne_10m_populated_places_simple",
];

fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

for (const name of SOURCES) {
  const file = path.join(CACHE, `${name}.geojson`);
  if (fs.existsSync(file)) continue;
  console.log(`↓ ${name}`);
  const res = await fetch(`${NE}${name}.geojson`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

const src = (n) => path.join(CACHE, `${n}.geojson`);

// ── Countries + states → one TopoJSON ─────────────────────────────────────────
// Short property names keep the payload small; the app maps them back.
const countryFields = [
  "id=ADM0_A3",
  "n=NAME",
  "nl=NAME_LONG",
  "f=FORMAL_EN",
  "zh=NAME_ZHT",
  "a2=ISO_A2_EH",
  "a3=ISO_A3_EH",
  "ct=CONTINENT",
  "sr=SUBREGION",
  "pop=POP_EST",
  "py=POP_YEAR",
  "gdp=GDP_MD",
  "gy=GDP_YEAR",
  "inc=INCOME_GRP",
  "eco=ECONOMY",
  "sov=SOVEREIGNT",
  "lx=LABEL_X",
  "ly=LABEL_Y",
  "lr=LABELRANK",
  "ml=MIN_LABEL",
].join(",");

const stateFields = [
  "id=adm1_code",
  "n=name",
  "en=name_en",
  "loc=name_local",
  "zh=name_zht",
  "t=type_en",
  "c=adm0_a3",
  "iso=iso_3166_2",
  "pc=postal",
  "rg=region",
  "lx=longitude",
  "ly=latitude",
  "lr=labelrank",
  "ml=min_label",
].join(",");

// Only keep the renamed fields (mapshaper -rename-fields keeps the rest, so
// -filter-fields after it).
const keep = (spec) => spec.split(",").map((s) => s.split("=")[0]).join(",");

console.log("⚙ simplifying countries + states");
await mapshaper.runCommands(
  [
    `-i ${src("ne_10m_admin_0_countries")} ${src("ne_10m_admin_1_states_provinces")} combine-files`,
    `-rename-layers countries,states`,
    `-rename-fields target=countries ${countryFields}`,
    `-filter-fields target=countries ${keep(countryFields)}`,
    `-rename-fields target=states ${stateFields}`,
    `-filter-fields target=states ${keep(stateFields)}`,
    // Uniform ~1.5 km detail: crisp enough at the closest zoom, small on the wire.
    `-simplify target=* interval=1500 keep-shapes`,
    `-clean target=*`,
    `-o ${path.join(OUT, "world.topo.json")} format=topojson quantization=200000 target=*`,
  ].join(" "),
);

// ── Populated places → compact rows ───────────────────────────────────────────
console.log("⚙ places");
const places = JSON.parse(fs.readFileSync(src("ne_10m_populated_places_simple"), "utf8"));
const round = (v) => Math.round(v * 1000) / 1000;
const rows = places.features
  .map(({ properties: p }) => [
    p.name,
    round(p.latitude),
    round(p.longitude),
    p.adm0_a3,
    p.adm1name || "",
    p.pop_max || 0,
    // 2 = national capital, 1 = state/province capital, 0 = other
    p.adm0cap ? 2 : p.featurecla === "Admin-1 capital" ? 1 : 0,
    p.scalerank,
  ])
  .sort((a, b) => b[5] - a[5]);
fs.writeFileSync(
  path.join(OUT, "places.json"),
  JSON.stringify({ fields: ["name", "lat", "lng", "c", "adm1", "pop", "cap", "rank"], rows }),
);

for (const f of fs.readdirSync(OUT)) {
  console.log(`✓ public/geo/${f} ${(fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0)} KB`);
}
