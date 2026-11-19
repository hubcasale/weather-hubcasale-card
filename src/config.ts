import { ENTITY_KEYS, defaultSettings } from "./types";
import type { EntityKey, Settings } from "./types";

/**
 * Configurazione della scheda (YAML o editor visuale). Ha la stessa forma delle vecchie preferenze:
 *   type, title, tablet, fill_height, pressure_altitude, entities: {temperature: ..., ...}, map: {enabled, zoom}, forecast: {enabled}
 * Se `entities` c'e', la configurazione della scheda e' l'unica usata. Senza `entities` (schede create prima dell'editor)
 * si usano le preferenze salvate dall'integrazione, con eventuali valori della scheda sopra.
 */
export interface CardConfig {
  type?: string;
  title?: string;
  tablet?: boolean;
  fill_height?: boolean;
  pressure_altitude?: number;
  entities?: Partial<Record<EntityKey, string>>;
  map?: { enabled?: boolean; zoom?: number };
  forecast?: { enabled?: boolean };
  [extra: string]: unknown;
}

const ZOOM_DEFAULT = 7;

/** Porta qualunque oggetto di preferenze alla forma completa e valida. */
export function normalize(s: Partial<Settings> | null | undefined): Settings {
  const d = defaultSettings(), x: Partial<Settings> = s ?? {};
  const entities = { ...d.entities };
  for (const k of ENTITY_KEYS) { const v = x.entities?.[k]; if (typeof v === "string") entities[k] = v.trim(); }
  const alt = Number(x.pressure_altitude);
  const zoom = Number(x.map?.zoom);
  return {
    title: typeof x.title === "string" ? x.title.trim() : "",
    entities,
    map: { enabled: x.map?.enabled !== false, zoom: Number.isFinite(zoom) && zoom >= 3 && zoom <= 12 ? Math.round(zoom) : ZOOM_DEFAULT },
    forecast: { enabled: x.forecast?.enabled !== false },
    pressure_altitude: Number.isFinite(alt) ? Math.max(0, Math.min(5000, Math.round(alt))) : 0,
    tablet: x.tablet === true,
  };
}

/** Impostazioni effettive: la configurazione della scheda, oppure (senza `entities`) le preferenze salvate con i valori della scheda sopra. */
export function resolveSettings(config: CardConfig | null | undefined, legacy: Partial<Settings> | null | undefined): Settings {
  const c: CardConfig = config ?? {};
  if (c.entities && typeof c.entities === "object") {
    return normalize({ title: c.title, tablet: c.tablet, pressure_altitude: c.pressure_altitude, entities: c.entities as Settings["entities"], map: c.map as Settings["map"], forecast: c.forecast as Settings["forecast"] });
  }
  const base = normalize(legacy);
  return normalize({
    ...base,
    ...(typeof c.title === "string" ? { title: c.title } : {}),
    ...(c.tablet !== undefined ? { tablet: c.tablet === true } : {}),
    ...(c.pressure_altitude !== undefined ? { pressure_altitude: c.pressure_altitude } : {}),
    ...(c.map ? { map: { ...base.map, ...c.map } as Settings["map"] } : {}),
    ...(c.forecast ? { forecast: { ...base.forecast, ...c.forecast } as Settings["forecast"] } : {}),
  });
}

/** Dati piatti per il modulo dell'editor (ha-form lavora su un oggetto senza livelli). */
export function toEditorData(s: Settings, config: CardConfig | null | undefined): Record<string, unknown> {
  return {
    title: s.title, tablet: s.tablet, fill_height: config?.fill_height === true,
    ...s.entities,
    show_forecast: s.forecast.enabled, show_map: s.map.enabled, map_zoom: s.map.zoom,
    pressure_altitude: s.pressure_altitude,
  };
}

/** Dal modulo dell'editor alla configurazione della scheda: compatta (niente valori predefiniti), sempre con `entities`. Le chiavi sconosciute restano. */
export function fromEditorData(data: Record<string, unknown>, base: CardConfig | null | undefined): CardConfig {
  const owned = ["type", "title", "tablet", "fill_height", "pressure_altitude", "entities", "map", "forecast"];
  const extras: CardConfig = {};
  for (const [k, v] of Object.entries(base ?? {})) if (!owned.includes(k)) extras[k] = v;
  const entitiesIn = {} as Settings["entities"];
  for (const k of ENTITY_KEYS) entitiesIn[k] = typeof data[k] === "string" ? (data[k] as string) : "";
  const s = normalize({
    title: data.title as string, tablet: data.tablet === true, pressure_altitude: data.pressure_altitude as number, entities: entitiesIn,
    map: { enabled: data.show_map !== false, zoom: data.map_zoom as number }, forecast: { enabled: data.show_forecast !== false },
  });
  const entities: Partial<Record<EntityKey, string>> = {};
  for (const k of ENTITY_KEYS) if (s.entities[k]) entities[k] = s.entities[k];
  const out: CardConfig = { type: base?.type ?? "custom:weather-hubcasale-card" };
  if (s.title) out.title = s.title;
  if (s.tablet) out.tablet = true;
  if (data.fill_height === true) out.fill_height = true;
  if (s.pressure_altitude > 0) out.pressure_altitude = s.pressure_altitude;
  out.entities = entities;
  if (!s.map.enabled || s.map.zoom !== ZOOM_DEFAULT) out.map = { enabled: s.map.enabled, zoom: s.map.zoom };
  if (!s.forecast.enabled) out.forecast = { enabled: false };
  return { ...out, ...extras };
}

const sensor = (name: string, domain: string[] = ["sensor"]) => ({ name, required: false, selector: { entity: { domain } } });
const group = (title: string, schema: unknown[]) => ({ type: "expandable", name: "", flatten: true, title, schema });

/** Schema di ha-form per l'editor visuale. I sensori non sono filtrati per classe: i sensori di casa spesso non hanno la classe giusta. */
export const EDITOR_SCHEMA = [
  { name: "title", required: false, selector: { text: {} } },
  { type: "grid", name: "", flatten: true, schema: [
    { name: "tablet", required: false, selector: { boolean: {} } },
    { name: "fill_height", required: false, selector: { boolean: {} } },
  ] },
  group("Temperatura e umidità", [sensor("temperature"), sensor("feels_like"), sensor("humidity"), sensor("dew_point")]),
  group("Vento", [sensor("wind_speed"), sensor("wind_gust"), sensor("wind_direction")]),
  group("Precipitazioni", [sensor("rain_rate"), sensor("rain_day"), sensor("rain_now", ["binary_sensor", "sensor", "input_boolean"])]),
  group("Pressione, UV e radiazione", [
    sensor("pressure"),
    { name: "pressure_altitude", required: false, selector: { number: { min: 0, max: 5000, step: 1, mode: "box", unit_of_measurement: "m" } } },
    sensor("uv"), sensor("radiation"),
  ]),
  group("Previsioni e mappa", [
    sensor("weather", ["weather"]),
    { name: "show_forecast", required: false, selector: { boolean: {} } },
    { name: "show_map", required: false, selector: { boolean: {} } },
    { name: "map_zoom", required: false, selector: { number: { min: 3, max: 12, step: 1, mode: "slider" } } },
  ]),
];

export const EDITOR_LABELS: Record<string, string> = {
  title: "Titolo (facoltativo)",
  tablet: "Vista tablet (barra temporale verticale a destra)",
  fill_height: "Occupa tutta l'altezza dello schermo",
  temperature: "Temperatura", feels_like: "Temperatura percepita (facoltativa)", humidity: "Umidità relativa", dew_point: "Punto di rugiada (facoltativo)",
  wind_speed: "Velocità del vento", wind_gust: "Raffica", wind_direction: "Direzione del vento (gradi)",
  rain_rate: "Intensità della pioggia (mm/h)", rain_day: "Pioggia del giorno (mm)", rain_now: "Sensore «sta piovendo» (facoltativo)",
  pressure: "Pressione", pressure_altitude: "Quota della stazione (m)", uv: "Indice UV", radiation: "Radiazione solare",
  weather: "Entità meteo per le previsioni", show_forecast: "Mostra le previsioni", show_map: "Mostra la mappa radar", map_zoom: "Zoom iniziale della mappa",
};

export const EDITOR_HELPERS: Record<string, string> = {
  feels_like: "Se manca viene calcolata.",
  dew_point: "Se manca viene calcolato.",
  rain_now: "Accende il puntino blu «Piove ora» nel blocco delle precipitazioni.",
  pressure_altitude: "Se la pressione è quella di stazione, la scheda la riporta al livello del mare. 0 = non convertire.",
  uv: "Senza sensore il blocco resta nascosto.",
  radiation: "Senza sensore il blocco resta nascosto.",
  map_zoom: "3 = regione, 12 = quartiere.",
};
