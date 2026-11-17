import type { Point, Series } from "./types";

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Punto di rugiada (formula di Magnus) da temperatura °C e umidità relativa %. */
export function dewPoint(tC: number, rh: number): number {
  const a = 17.62, b = 243.12;
  const g = Math.log(clamp(rh, 1, 100) / 100) + (a * tC) / (b + tC);
  return (b * g) / (a - g);
}

/** Temperatura percepita °C: wind chill (<= 10 °C, vento > 4,8 km/h), indice di calore (>= 26 °C), altrimenti la temperatura. */
export function feelsLike(tC: number, rh: number, windKmh: number): number {
  if (tC <= 10 && windKmh > 4.8) {
    const v = Math.pow(windKmh, 0.16);
    return 13.12 + 0.6215 * tC - 11.37 * v + 0.3965 * tC * v;
  }
  if (tC >= 26 && rh >= 40) {
    const f = tC * 9 / 5 + 32;
    const hi = -42.379 + 2.04901523 * f + 10.14333127 * rh - 0.22475541 * f * rh - 0.00683783 * f * f
      - 0.05481717 * rh * rh + 0.00122874 * f * f * rh + 0.00085282 * f * rh * rh - 0.00000199 * f * f * rh * rh;
    return (hi - 32) * 5 / 9;
  }
  return tC;
}

const CARDINALS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSO", "SO", "OSO", "O", "ONO", "NO", "NNO"];
export function windCardinal(deg: number): string {
  return CARDINALS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

/** Tendenza della pressione dalla variazione (hPa) nelle ultime ore. */
export function pressureTrend(deltaHpa: number | null): "up" | "down" | "steady" | "" {
  if (deltaHpa === null || Number.isNaN(deltaHpa)) return "";
  if (deltaHpa >= 0.8) return "up";
  if (deltaHpa <= -0.8) return "down";
  return "steady";
}

export interface UvLevel { label: string; color: string; index: number }
export function uvLevel(uv: number): UvLevel {
  if (uv < 3) return { label: "Basso", color: "#5cb85c", index: 0 };
  if (uv < 6) return { label: "Moderato", color: "#f0d33c", index: 1 };
  if (uv < 8) return { label: "Alto", color: "#f0923c", index: 2 };
  if (uv < 11) return { label: "Molto alto", color: "#e0463c", index: 3 };
  return { label: "Estremo", color: "#a84bd0", index: 4 };
}

const STOPS: [number, [number, number, number]][] = [
  [-15, [128, 60, 190]], [-5, [60, 110, 220]], [5, [60, 180, 210]], [14, [80, 190, 110]],
  [22, [235, 205, 60]], [30, [240, 140, 50]], [40, [220, 60, 50]],
];
/** Colore (rgb) lungo la scala delle temperature, come l'arco della scheda. */
export function tempColor(t: number): string {
  const x = clamp(t, STOPS[0][0], STOPS[STOPS.length - 1][0]);
  for (let i = 1; i < STOPS.length; i++) {
    if (x <= STOPS[i][0]) {
      const [t0, c0] = STOPS[i - 1], [t1, c1] = STOPS[i];
      const f = (x - t0) / (t1 - t0);
      return `rgb(${Math.round(lerp(c0[0], c1[0], f))},${Math.round(lerp(c0[1], c1[1], f))},${Math.round(lerp(c0[2], c1[2], f))})`;
    }
  }
  return "rgb(220,60,50)";
}

/** Ultimo valore della serie con ts <= t (serie ordinata per tempo); null se non c'è nessun dato fino a t. */
export function valueAt(series: Series | undefined, t: number): number | null {
  if (!series || series.length === 0) return null;
  let lo = 0, hi = series.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].ts <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans < 0 ? null : series[ans].v;
}

/** Inizio (00:00 locale) del giorno che contiene ts. */
export function dayStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
export function addDays(ts: number, n: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

/** Converte la risposta compressa di history/history_during_period in una serie numerica ordinata. */
export function parseHistory(rows: any[] | undefined): Series {
  const out: Series = [];
  for (const r of rows ?? []) {
    const raw = r.s ?? r.state;
    const v = typeof raw === "number" ? raw : parseFloat(raw);
    if (!Number.isFinite(v)) continue;
    const lu = r.lu ?? r.last_updated ?? r.lc ?? r.last_changed;
    const ts = typeof lu === "number" ? lu * 1000 : Date.parse(lu);
    if (Number.isFinite(ts)) out.push({ ts, v });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

/** Riduce la serie a al massimo n punti (media per intervallo) per i grafici. */
export function downsample(series: Series, n: number): Series {
  if (series.length <= n) return series;
  const out: Series = [];
  const step = series.length / n;
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * step), b = Math.max(a + 1, Math.floor((i + 1) * step));
    let sum = 0;
    for (let j = a; j < b; j++) sum += series[j].v;
    out.push({ ts: series[a].ts, v: sum / (b - a) });
  }
  return out;
}

export function fmt(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  return v.toFixed(decimals).replace(".", ",");
}

/** Etichetta oraria della barra: 12a, 3a, ... in formato 24 ore (00, 03, ...). */
export function hourLabel(h: number): string { return String(h).padStart(2, "0"); }

export function minutesToTs(day: number, minutes: number): number {
  const d = new Date(day);
  d.setHours(0, minutes, 0, 0);
  return d.getTime();
}

export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} secondi fa`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min fa`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h fa` : `${Math.round(h / 24)} g fa`;
}

export type { Point };

/** Tacche dell'asse con valori "tondi" (1, 2, 5 x 10^n) tra lo e hi. */
export function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / count, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag, step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.round(v / step) * step + 0);
  return out;
}

/** Interpreta lo stato di un sensore "sta piovendo": true/false, oppure null se non disponibile o non riconosciuto. */
export function isRainingState(state: string | undefined | null): boolean | null {
  if (state === undefined || state === null) return null;
  const s = String(state).trim().toLowerCase();
  if (["on", "true", "yes", "rain", "raining", "wet", "detected", "drizzle", "piove", "pioggia"].includes(s)) return true;
  if (["off", "false", "no", "none", "dry", "clear", "not_detected", "non piove"].includes(s)) return false;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n > 0 : null;
}

/** Pressione ridotta al livello del mare (formula ipsometrica) da pressione di stazione hPa, temperatura °C e quota m. */
export function seaLevelPressure(pStation: number, tC: number | null, altitudeM: number): number {
  if (!(altitudeM > 0)) return pStation;
  const T = (tC ?? 15) + 273.15;
  return pStation * Math.pow(1 - (0.0065 * altitudeM) / (T + 0.0065 * altitudeM), -5.257);
}
