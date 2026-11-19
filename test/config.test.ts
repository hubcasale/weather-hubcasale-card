import { test } from "node:test";
import assert from "node:assert/strict";
import { EDITOR_LABELS, EDITOR_SCHEMA, fromEditorData, normalize, resolveSettings, toEditorData } from "../src/config";
import { ENTITY_KEYS } from "../src/types";

const legacy = {
  title: "HubCasale meteo", tablet: true, pressure_altitude: 579,
  entities: { temperature: "sensor.t", humidity: "sensor.h", wind_speed: "sensor.w", weather: "weather.casale" },
  map: { enabled: true, zoom: 9 }, forecast: { enabled: true },
};

test("normalize: valori mancanti o fuori misura tornano validi", () => {
  const s = normalize({ pressure_altitude: 99999, map: { enabled: true, zoom: 40 }, entities: { temperature: "  sensor.t  " } as any });
  assert.equal(s.pressure_altitude, 5000);
  assert.equal(s.map.zoom, 7);
  assert.equal(s.entities.temperature, "sensor.t");
  assert.equal(s.entities.pressure, "");
  assert.equal(s.tablet, false);
  assert.equal(normalize(null).map.enabled, true);
});

test("senza `entities` la scheda usa le preferenze salvate, con i valori della scheda sopra", () => {
  const a = resolveSettings({ type: "custom:weather-hubcasale-card", fill_height: true }, legacy);
  assert.equal(a.entities.temperature, "sensor.t");
  assert.equal(a.tablet, true);
  assert.equal(a.pressure_altitude, 579);
  const b = resolveSettings({ title: "Altro", tablet: false }, legacy);
  assert.equal(b.title, "Altro");
  assert.equal(b.tablet, false);
  assert.equal(b.entities.humidity, "sensor.h");
});

test("con `entities` vale solo la configurazione della scheda", () => {
  const s = resolveSettings({ entities: { temperature: "sensor.nuovo" } }, legacy);
  assert.equal(s.entities.temperature, "sensor.nuovo");
  assert.equal(s.entities.humidity, "");
  assert.equal(s.tablet, false);
  assert.equal(s.title, "");
  assert.equal(s.pressure_altitude, 0);
  assert.equal(resolveSettings({ entities: {} }, legacy).entities.temperature, "");
});

test("editor: dalle preferenze salvate al modulo e ritorno, senza valori predefiniti e senza perdere le chiavi extra", () => {
  const base = { type: "custom:weather-hubcasale-card", fill_height: true, grid_options: { columns: 12 } };
  const data = toEditorData(resolveSettings(base, legacy), base);
  assert.equal(data.temperature, "sensor.t");
  assert.equal(data.map_zoom, 9);
  assert.equal(data.fill_height, true);
  const cfg = fromEditorData({ ...data, humidity: "sensor.altra_umidita" }, base);
  assert.equal(cfg.type, "custom:weather-hubcasale-card");
  assert.deepEqual(cfg.grid_options, { columns: 12 });
  assert.equal(cfg.fill_height, true);
  assert.equal(cfg.tablet, true);
  assert.equal(cfg.pressure_altitude, 579);
  assert.deepEqual(cfg.entities, { temperature: "sensor.t", humidity: "sensor.altra_umidita", wind_speed: "sensor.w", weather: "weather.casale" });
  assert.deepEqual(cfg.map, { enabled: true, zoom: 9 });
  assert.equal(cfg.forecast, undefined);
});

test("editor: i valori predefiniti non finiscono nello YAML, un sensore svuotato sparisce", () => {
  const cfg = fromEditorData({ title: "", tablet: false, fill_height: false, pressure_altitude: 0, show_map: true, show_forecast: true, map_zoom: 7, temperature: "sensor.t", humidity: undefined }, { type: "custom:weather-hubcasale-card" });
  assert.deepEqual(cfg, { type: "custom:weather-hubcasale-card", entities: { temperature: "sensor.t" } });
  const off = fromEditorData({ show_map: false, show_forecast: false, map_zoom: 7 }, null);
  assert.deepEqual(off.map, { enabled: false, zoom: 7 });
  assert.deepEqual(off.forecast, { enabled: false });
  assert.deepEqual(off.entities, {});
});

test("schema dell'editor: ogni sensore e ogni opzione c'e' ed ha l'etichetta", () => {
  const names = (items: any[]): string[] => items.flatMap((i) => (i.schema ? names(i.schema) : [i.name]));
  const found = names(EDITOR_SCHEMA as any[]);
  for (const k of ENTITY_KEYS) assert.ok(found.includes(k), `manca ${k}`);
  for (const k of ["title", "tablet", "fill_height", "pressure_altitude", "show_forecast", "show_map", "map_zoom"]) assert.ok(found.includes(k), `manca ${k}`);
  for (const n of found) assert.ok(EDITOR_LABELS[n], `etichetta mancante per ${n}`);
});
