/** Chiavi dei sensori che si possono mappare dalle preferenze. */
export const ENTITY_KEYS = [
  "temperature", "feels_like", "humidity", "dew_point", "wind_speed", "wind_gust", "wind_direction",
  "rain_rate", "rain_day", "pressure", "uv", "radiation", "weather",
] as const;
export type EntityKey = (typeof ENTITY_KEYS)[number];

export interface Settings {
  title: string;
  entities: Record<EntityKey, string>;
  map: { enabled: boolean; zoom: number };
  forecast: { enabled: boolean };
}

export function defaultSettings(): Settings {
  const entities = {} as Record<EntityKey, string>;
  for (const k of ENTITY_KEYS) entities[k] = "";
  return { title: "", entities, map: { enabled: true, zoom: 7 }, forecast: { enabled: true } };
}

export interface HassState { entity_id: string; state: string; attributes: Record<string, any>; last_updated?: string; last_changed?: string }
export interface Hass {
  states: Record<string, HassState>;
  callWS<T = any>(msg: Record<string, any>): Promise<T>;
  connection?: { subscribeEvents?: (cb: (e: any) => void, type: string) => Promise<() => void> };
  config?: { latitude?: number; longitude?: number; unit_system?: Record<string, string> };
  locale?: { language?: string };
  language?: string;
}

/** Punto di una serie storica: ts in millisecondi, v numerico. */
export interface Point { ts: number; v: number }
export type Series = Point[];

export type BlockKey = "temperature" | "humidity" | "wind" | "precipitation" | "pressure" | "uv" | "radiation";
export type ChartKey = BlockKey;
