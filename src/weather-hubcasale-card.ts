import { LitElement, html, css, nothing, svg } from "lit";
import "./chart-dialog";
import "./settings-dialog";
import type { ChartSpec } from "./chart-dialog";
import { compass, humidityRing, pressureDial, radiationSun, rainCylinder, tempGauge, uvPyramid } from "./gauges";
import { addDays, ago, dayStart, dewPoint, feelsLike, fmt, minutesToTs, parseHistory, pressureTrend, seaLevelPressure, uvLevel, valueAt, windCardinal } from "./logic";
import { ENTITY_KEYS, defaultSettings } from "./types";
import type { EntityKey, Hass, Series, Settings } from "./types";

type ChartKind = "temperature" | "humidity" | "wind" | "winddir" | "precipitation" | "pressure" | "solar";
const LS_KEY = "weather_hubcasale_settings";
const SETTINGS_EVENT = "weather_hubcasale_settings_updated";
const HOUR = 3600e3;

const ICON_CHART = svg`<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M3 3v18h18v-2H5V3H3zm4 10 3-3 3 3 5-6 1.5 1.2L13 15.5l-3-3-2.5 2.5L7 13z"/></svg>`;
const ICON_GEAR = svg`<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M19.4 13a7.7 7.7 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1l-.4-2.7h-4l-.4 2.7a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L4.6 11a7.7 7.7 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1l.4 2.7h4l.4-2.7c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5L19.4 13zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/></svg>`;

function toKmh(v: number | null, unit: string | undefined): number | null {
  if (v === null) return null;
  switch (unit) { case "m/s": return v * 3.6; case "mph": return v * 1.609344; case "kn": return v * 1.852; default: return v; }
}

export class WeatherHubcasaleCard extends LitElement {
  static properties = {
    _settings: { state: true }, _day: { state: true }, _minutes: { state: true }, _history: { state: true },
    _tick: { state: true }, _width: { state: true }, _noIntegration: { state: true }, _radarError: { state: true }, _forecastError: { state: true }, _loaded: { state: true },
  };
  declare _settings: Settings;
  declare _day: number;
  declare _minutes: number | null;
  declare _history: Record<string, Series>;
  declare _tick: number;
  declare _width: number;
  declare _noIntegration: boolean;
  declare _radarError: string;
  declare _forecastError: string;
  declare _loaded: boolean;

  private _hass!: Hass;
  private _config: any = {};
  private _histKey = "";
  private _timer?: number;
  private _unsub?: () => void;
  private _radar?: HTMLElement;
  private _radarZoom = -1;
  private _blocksCount = 0;
  private _ro?: ResizeObserver;
  private _vdrag = false;
  private _forecast?: HTMLElement;
  private _forecastKey = "";

  constructor() {
    super();
    this._settings = defaultSettings(); this._day = dayStart(Date.now()); this._minutes = null; this._history = {};
    this._tick = 0; this._width = 0; this._noIntegration = false; this._radarError = ""; this._forecastError = ""; this._loaded = false;
  }

  setConfig(config: any) {
    this._config = config ?? {};
  }
  getCardSize() { return 9; }
  getGridOptions() { return { columns: 12, min_columns: 6, rows: "auto" }; }
  static getStubConfig() { return {}; }

  set hass(h: Hass) {
    const first = !this._hass;
    this._hass = h;
    if (first) { void this._loadSettings(); void this._subscribe(); }
    if (this._radar) (this._radar as any).hass = h;
    if (this._forecast) (this._forecast as any).hass = h;
    this.requestUpdate();
  }
  get hass() { return this._hass; }

  connectedCallback() {
    super.connectedCallback();
    this._ro = new ResizeObserver((es) => { const w = es[0].contentRect.width; if (Math.abs(w - this._width) > 1) this._width = w; });
    this._ro.observe(this);
    this._timer = window.setInterval(() => { this._tick++; if (this._isToday() && this._tick % 20 === 0) { this._histKey = ""; } }, 15000);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._timer) clearInterval(this._timer);
    this._ro?.disconnect();
    this._unsub?.();
  }

  // ---------------------------------------------------------------- preferenze
  private async _loadSettings() {
    try {
      const s = await this._hass.callWS<Settings>({ type: "weather_hubcasale/get_settings" });
      this._settings = this._merge(s);
      this._noIntegration = false;
    } catch {
      this._noIntegration = true;
      try { const raw = localStorage.getItem(LS_KEY); if (raw) this._settings = this._merge(JSON.parse(raw)); } catch { /* nessuna preferenza locale */ }
    }
    this._loaded = true;
  }
  private _merge(s: Partial<Settings>): Settings {
    const d = defaultSettings();
    return { ...d, ...s, entities: { ...d.entities, ...(s.entities ?? {}) }, map: { ...d.map, ...(s.map ?? {}) }, forecast: { ...d.forecast, ...(s.forecast ?? {}) }, pressure_altitude: typeof s.pressure_altitude === "number" ? s.pressure_altitude : 0, tablet: s.tablet === true };
  }
  private async _subscribe() {
    try { this._unsub = await this._hass.connection?.subscribeEvents?.(() => void this._loadSettings(), SETTINGS_EVENT); } catch { /* facoltativo */ }
  }
  private async _saveSettings(s: Settings) {
    if (!this._noIntegration) {
      const out = await this._hass.callWS<Settings>({ type: "weather_hubcasale/set_settings", settings: s });
      this._settings = this._merge(out);
    } else {
      try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
      this._settings = s;
    }
    this._histKey = "";
  }
  private _openSettings() {
    const d = document.createElement("whc-settings-dialog") as any;
    d.hass = this._hass; d.settings = this._settings; d.onSave = (s: Settings) => this._saveSettings(s);
    document.body.appendChild(d);
  }

  // ---------------------------------------------------------------- dati
  private get _ent() { return this._settings.entities; }
  private _isToday() { return this._day === dayStart(Date.now()); }
  private _isLive() { return this._isToday() && this._minutes === null; }
  private _nowMinutes() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  private _ts(): number { return this._isLive() ? Date.now() : minutesToTs(this._day, this._minutes ?? 0); }
  private _mapped(): string[] { return [...new Set(ENTITY_KEYS.filter((k) => k !== "weather").map((k) => this._ent[k]).filter(Boolean))]; }

  private async _ensureHistory() {
    if (!this._hass || !this._loaded) return;
    const ids = this._mapped();
    const key = `${this._day}|${ids.join(",")}`;
    if (key === this._histKey || ids.length === 0) return;
    this._histKey = key;
    try {
      const start = new Date(this._day - 3 * HOUR).toISOString(), end = new Date(Math.min(addDays(this._day, 1), Date.now() + HOUR)).toISOString();
      const res = await this._hass.callWS<Record<string, any[]>>({
        type: "history/history_during_period", start_time: start, end_time: end, entity_ids: ids,
        minimal_response: true, no_attributes: true, significant_changes_only: false,
      });
      const next: Record<string, Series> = {};
      for (const id of ids) next[id] = parseHistory(res?.[id]);
      this._history = next;
    } catch { this._histKey = ""; }
  }

  private _val(key: EntityKey): number | null {
    const id = this._ent[key];
    if (!id) return null;
    if (this._isLive()) { const v = parseFloat(this._hass.states[id]?.state); return Number.isFinite(v) ? v : null; }
    return valueAt(this._history[id], this._ts());
  }
  private _unit(key: EntityKey, fallback: string): string { const id = this._ent[key]; return (id && this._hass.states[id]?.attributes?.unit_of_measurement) || fallback; }

  private _tabletMode(): boolean { return this._settings.tablet && this._width >= 900; }

  protected willUpdate() {
    const tab = this._tabletMode();
    this.toggleAttribute("tablet", tab);
    this.toggleAttribute("fill", this._config.fill_height === true || tab);
  }

  private _showForecast(): boolean { return this._settings.forecast.enabled && !!this._ent.weather; }

  private _rateUnit(): string { const u = this._unit("rain_rate", "mm/h"); return u === "mm" ? "mm/h" : u; }

  private _newest(): number | null {
    let best: number | null = null;
    for (const id of this._mapped()) { const t = Date.parse(this._hass.states[id]?.last_updated ?? ""); if (Number.isFinite(t) && (best === null || t > best)) best = t; }
    return best;
  }

  // ---------------------------------------------------------------- grafici
  private _series(key: EntityKey): Series {
    const id = this._ent[key];
    return id ? (this._history[id] ?? []).filter((p) => p.ts >= this._day && p.ts <= addDays(this._day, 1)) : [];
  }
  private _openChart(kind: ChartKind) {
    const u = (k: EntityKey, f: string) => this._unit(k, f);
    let spec: ChartSpec;
    const dayStartTs = this._day;
    switch (kind) {
      case "temperature": {
        let dew = this._series("dew_point");
        if (!this._ent.dew_point) { dew = this._series("temperature").map((p) => ({ ts: p.ts, v: dewPoint(p.v, valueAt(this._history[this._ent.humidity], p.ts) ?? 70) })); }
        spec = { title: "Temperatura e punto di rugiada", dayStart: dayStartTs, series: [
          { label: "Temperatura", color: "#e0463c", unit: u("temperature", "°C"), data: this._series("temperature") },
          { label: "Punto di rugiada", color: "#5cb85c", unit: u("dew_point", "°C"), data: dew }] };
        break;
      }
      case "humidity": spec = { title: "Umidità", dayStart: dayStartTs, yMin: 0, yMax: 100, series: [{ label: "Umidità", color: "#3d8fd1", unit: "%", data: this._series("humidity"), style: "area" }] }; break;
      case "wind": spec = { title: "Vento e raffica", dayStart: dayStartTs, yMin: 0, series: [
        { label: "Vento", color: "#3d8fd1", unit: u("wind_speed", "km/h"), data: this._series("wind_speed") },
        { label: "Raffica", color: "#f0923c", unit: u("wind_gust", "km/h"), data: this._series("wind_gust"), style: "dots" }] }; break;
      case "winddir": spec = { title: "Direzione del vento", dayStart: dayStartTs, yMin: 0, yMax: 360, decimals: 0, series: [{ label: "Direzione", color: "#b07cd8", unit: "°", data: this._series("wind_direction"), style: "dots" }] }; break;
      case "precipitation": spec = { title: "Precipitazioni", dayStart: dayStartTs, yMin: 0, series: [
        { label: "Totale del giorno", color: "#3d8fd1", unit: u("rain_day", "mm"), data: this._series("rain_day"), style: "area" },
        { label: "Intensità", color: "#f0923c", unit: u("rain_rate", "mm/h"), data: this._series("rain_rate") }] }; break;
      case "pressure": {
        const alt = this._settings.pressure_altitude;
        const data = alt ? this._series("pressure").map((pt) => ({ ts: pt.ts, v: seaLevelPressure(pt.v, valueAt(this._history[this._ent.temperature], pt.ts), alt) })) : this._series("pressure");
        spec = { title: alt ? "Pressione (livello del mare)" : "Pressione", dayStart: dayStartTs, series: [{ label: "Pressione", color: "#b07cd8", unit: u("pressure", "hPa"), data }] };
        break;
      }
      default: spec = { title: "Radiazione solare e UV", dayStart: dayStartTs, yMin: 0, series: [
        { label: "Radiazione", color: "#f0b43c", unit: u("radiation", "W/m²"), data: this._series("radiation"), style: "area" },
        { label: "Indice UV", color: "#b07cd8", unit: "", data: this._series("uv") }] };
    }
    const d = document.createElement("whc-chart-dialog") as any;
    d.spec = spec;
    document.body.appendChild(d);
  }

  // ---------------------------------------------------------------- mappa
  private async _mountRadar(host: HTMLElement) {
    const zoom = this._settings.map.zoom;
    if (this._radar && this._radarZoom === zoom) { if (this._radar.parentElement !== host) host.appendChild(this._radar); return; }
    this._radarZoom = zoom; this._radar?.remove(); this._radar = undefined; this._radarError = "";
    try {
      const helpers = await (window as any).loadCardHelpers?.();
      if (!helpers) throw new Error("no helpers");
      const el = helpers.createCardElement({ type: "custom:weather-radar-card", zoom_level: zoom, show_marker: true, square_map: false });
      el.hass = this._hass;
      host.appendChild(el);
      this._radar = el;
      // se la scheda non esiste, createCardElement restituisce una scheda di errore
      setTimeout(() => { if (el.tagName === "HUI-ERROR-CARD" || el.localName === "hui-error-card") this._radarError = "Weather Radar Card non trovata: installala da HACS per vedere la mappa."; }, 600);
    } catch {
      this._radarError = "Mappa non disponibile (serve la Weather Radar Card, installabile da HACS).";
    }
  }

  private async _mountForecast(host: HTMLElement) {
    const e = this._ent.weather;
    const key = `${e}|${this._ent.temperature}`;
    if (this._forecast && this._forecastKey === key) { if (this._forecast.parentElement !== host) host.appendChild(this._forecast); return; }
    this._forecastKey = key; this._forecast?.remove(); this._forecast = undefined; this._forecastError = "";
    try {
      const helpers = await (window as any).loadCardHelpers?.();
      if (!helpers) throw new Error("no helpers");
      const cfg: Record<string, any> = { type: "custom:weather-forecast-extended-card", entity: e, show_header: true, hourly_forecast: true, daily_forecast: true, orientation: "vertical" };
      if (this._ent.temperature) cfg.header_temperature_entity = this._ent.temperature;
      const el = helpers.createCardElement(cfg);
      el.hass = this._hass;
      host.appendChild(el);
      this._forecast = el;
      setTimeout(() => { if (el.localName === "hui-error-card") this._forecastError = "Weather Forecast Extended Card non trovata: installala da HACS per vedere le previsioni."; }, 600);
    } catch {
      this._forecastError = "Previsioni non disponibili (serve la Weather Forecast Extended Card, installabile da HACS).";
    }
  }

  protected updated() {
    void this._ensureHistory();
    const host = this.renderRoot.querySelector<HTMLElement>(".mapbox");
    if (host && this._settings.map.enabled && this._loaded) void this._mountRadar(host);
    if (!this._settings.map.enabled && this._radar) { this._radar.remove(); this._radar = undefined; this._radarZoom = -1; }
    const fhost = this.renderRoot.querySelector<HTMLElement>(".forecastbox");
    if (fhost && this._showForecast() && this._loaded) void this._mountForecast(fhost);
    if (!this._showForecast() && this._forecast) { this._forecast.remove(); this._forecast = undefined; this._forecastKey = ""; }
  }

  // ---------------------------------------------------------------- vista
  private _tile(title0: string, gauge: unknown, value: string, unit: string, sub: unknown, chartBtns: { kind: ChartKind; label: string }[]) {
    const title = this._tabletMode() && title0 === "Precipitazioni" ? "Pioggia" : title0;
    return html`<div class="tile ${chartBtns.length > 1 ? "two" : ""}">
      <div class="t-title">${title}</div>
      <div class="cbtns">${chartBtns.map((b) => html`<button class="cbtn" title=${b.label} aria-label=${b.label} @click=${() => this._openChart(b.kind)}>${ICON_CHART}</button>`)}</div>
      ${gauge}
      <div class="t-val">${value}<span class="u">${unit}</span></div>
      <div class="t-sub">${sub}</div>
    </div>`;
  }

  private _blocks() {
    const e = this._ent;
    const out = [];
    const t = this._val("temperature"), rh = this._val("humidity");
    const windUnit = this._unit("wind_speed", "km/h");
    const wind = this._val("wind_speed"), gust = this._val("wind_gust"), dir = this._val("wind_direction");
    if (e.temperature) {
      const fl = e.feels_like ? this._val("feels_like") : t !== null ? feelsLike(t, rh ?? 60, toKmh(wind, windUnit) ?? 0) : null;
      out.push(this._tile("Temperatura", tempGauge(t), fmt(t), this._unit("temperature", "°C"), html`Percepita ${fmt(fl)}°`, [{ kind: "temperature", label: "Grafico temperatura e rugiada" }]));
    }
    if (e.humidity) {
      const dp = e.dew_point ? this._val("dew_point") : t !== null && rh !== null ? dewPoint(t, rh) : null;
      out.push(this._tile("Umidità", humidityRing(rh), fmt(rh, 0), "%", html`${fmt(dp)}° punto di rugiada`, [{ kind: "humidity", label: "Grafico umidità" }]));
    }
    if (e.wind_speed) {
      out.push(this._tile("Vento", compass(dir), fmt(wind), windUnit,
        html`${gust !== null ? html`Raffica ${fmt(gust)} ${windUnit}<br/>` : nothing}${dir !== null ? `${Math.round(dir)}° ${windCardinal(dir)}` : ""}`,
        [{ kind: "wind", label: "Grafico vento e raffica" }, ...(e.wind_direction ? [{ kind: "winddir" as ChartKind, label: "Grafico direzione" }] : [])]));
    }
    if (e.rain_day || e.rain_rate) {
      const day = this._val("rain_day"), rate = this._val("rain_rate");
      out.push(this._tile("Precipitazioni", rainCylinder(day), fmt(day ?? rate, 1), this._unit("rain_day", "mm"), html`${fmt(rate, 1)} ${this._rateUnit()}`, [{ kind: "precipitation", label: "Grafico precipitazioni" }]));
    }
    if (e.pressure) {
      const alt = this._settings.pressure_altitude;
      const slm = (v: number | null, ts: number) => (v === null || !alt ? v : seaLevelPressure(v, e.temperature ? valueAt(this._history[e.temperature], ts) ?? t : t, alt));
      const p = slm(this._val("pressure"), this._ts());
      const prev = slm(valueAt(this._history[e.pressure], this._ts() - 3 * HOUR), this._ts() - 3 * HOUR);
      const tr = pressureTrend(p !== null && prev !== null ? p - prev : null);
      out.push(this._tile("Pressione", pressureDial(p), fmt(p, 1), this._unit("pressure", "hPa"), (tr === "up" ? "▲ In aumento" : tr === "down" ? "▼ In calo" : tr === "steady" ? "▬ Stabile" : "") + (alt ? " · s.l.m." : ""), [{ kind: "pressure", label: "Grafico pressione" }]));
    }
    if (e.uv) {
      const uv = this._val("uv");
      out.push(this._tile("UV", uvPyramid(uv), fmt(uv, 0), "", uv === null ? "" : html`<span style="color:${uvLevel(uv).color}">${uvLevel(uv).label}</span>`, [{ kind: "solar", label: "Grafico radiazione e UV" }]));
    }
    if (e.radiation) {
      const w = this._val("radiation");
      out.push(this._tile("Radiazione", radiationSun(w), fmt(w, 1), this._unit("radiation", "W/m²"), "", [{ kind: "solar", label: "Grafico radiazione e UV" }]));
    }
    return out;
  }

  private _datenav() {
    const today = this._isToday();
    const dateLabel = new Date(this._day).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    return html`<div class="datenav">
      <button class="nb" aria-label="Giorno precedente" @click=${() => { this._day = addDays(this._day, -1); this._minutes = this._minutes ?? 12 * 60; }}>‹</button>
      <span class="date">${dateLabel}</span>
      <button class="nb" aria-label="Giorno successivo" ?disabled=${today} @click=${() => { const n = addDays(this._day, 1); this._day = n; if (n === dayStart(Date.now())) this._minutes = null; }}>›</button>
      <button class="now" ?disabled=${this._isLive()} @click=${() => { this._day = dayStart(Date.now()); this._minutes = null; }}>Adesso</button>
    </div>`;
  }

  private _timebar() {
    const today = this._isToday();
    const nowMin = this._nowMinutes();
    const value = this._minutes ?? (today ? nowMin : 1439);
    const p = (value / 1439) * 100;
    const nowPct = today ? (nowMin / 1439) * 100 : 100;
    const label = this._isLive() ? "Adesso" : new Date(minutesToTs(this._day, value)).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    return html`<div class="timebar">
      <div class="slider">
        <div class="bubble" style="left:calc(12px + (100% - 24px) * ${p / 100})">${label}</div>
        <input type="range" min="0" max="1439" step="5" .value=${String(value)} aria-label="Ora della giornata"
          style="--p:${p}%;--now:${nowPct}%"
          @input=${(ev: Event) => {
            const v = Number((ev.target as HTMLInputElement).value);
            if (today && v >= nowMin - 2) { this._minutes = null; (ev.target as HTMLInputElement).value = String(nowMin); }  // oltre «adesso» non si va: si torna in diretta
            else this._minutes = v;
          }} />
        <div class="ticks">${[0, 3, 6, 9, 12, 15, 18, 21].map((h) => html`<span>${String(h).padStart(2, "0")}</span>`)}<span>24</span></div>
      </div>
    </div>`;
  }

  /** Data compatta per la colonna a destra della vista tablet. */
  private _datenavRail() {
    const today = this._isToday();
    const d = new Date(this._day);
    const l1 = d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric" });
    const l2 = d.toLocaleDateString("it-IT", { month: "short" });
    return html`<div class="rdate">
      <span class="rdl">${l1} ${l2}</span>
      <button class="nb" aria-label="Giorno precedente" @click=${() => { this._day = addDays(this._day, -1); this._minutes = this._minutes ?? 12 * 60; }}>‹</button>
      <button class="nb" aria-label="Giorno successivo" ?disabled=${today} @click=${() => { const n = addDays(this._day, 1); this._day = n; if (n === dayStart(Date.now())) this._minutes = null; }}>›</button>
      <button class="now" ?disabled=${this._isLive()} @click=${() => { this._day = dayStart(Date.now()); this._minutes = null; }}>Adesso</button>
    </div>`;
  }

  private _vSet(ev: PointerEvent) {
    const zone = this.renderRoot.querySelector<HTMLElement>(".vin");
    if (!zone) return;
    const r = zone.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
    const v = Math.round((f * 1439) / 5) * 5;
    if (this._isToday() && v >= this._nowMinutes() - 2) this._minutes = null; else this._minutes = v;
  }

  /** Barra temporale verticale: 00 in alto, 24 in basso, il cursore sta sull'ora attuale. */
  private _vtimeline() {
    const today = this._isToday();
    const nowMin = this._nowMinutes();
    const value = this._minutes ?? (today ? nowMin : 1439);
    const p = (value / 1439) * 100;
    const nowP = today ? (nowMin / 1439) * 100 : 100;
    const label = this._isLive() ? "Adesso" : new Date(minutesToTs(this._day, value)).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    return html`<div class="vtl" role="slider" aria-label="Ora della giornata" aria-valuemin="0" aria-valuemax="1439" aria-valuenow=${value}
      @pointerdown=${(e: PointerEvent) => { this._vdrag = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); this._vSet(e); }}
      @pointermove=${(e: PointerEvent) => { if (this._vdrag) this._vSet(e); }}
      @pointerup=${() => { this._vdrag = false; }} @pointercancel=${() => { this._vdrag = false; }}>
      <div class="vin" style="--p:${p}%;--now:${nowP}%">
        ${[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => html`<span class="vlab" style="top:${(h / 24) * 100}%">${String(h).padStart(2, "0")}</span>`)}
        <div class="vtrack"><div class="vfill"></div></div>
        <div class="vthumb"></div>
        <div class="vbub">${label}</div>
      </div>
    </div>`;
  }

  render() {
    if (!this._hass) return nothing;
    const blocks = this._blocks();
    this._blocksCount = blocks.length;
    const newest = this._newest();
    const age = newest === null ? null : Date.now() - newest;
    const connected = age !== null && age < 20 * 60e3;
    const title = this._settings.title || this._config.title || "Stazione meteo";
    if (this._tabletMode()) {
      return html`<ha-card><div class="wrap tab">
        <div class="tmain">
          ${blocks.length ? html`<div class="tiles" style="--n:${Math.min(7, blocks.length)}">${blocks}</div>` : html`<div class="empty"><p>Nessun sensore scelto.</p><button class="cta" @click=${() => this._openSettings()}>Apri le preferenze</button></div>`}
          ${this._settings.map.enabled || this._showForecast() ? html`<div class="bottom ${this._settings.map.enabled && this._showForecast() ? "two" : ""}">
            ${this._settings.map.enabled ? html`<section class="map"><div class="mapbox"></div>${this._radarError ? html`<div class="maperr">${this._radarError}</div>` : nothing}</section>` : nothing}
            ${this._showForecast() ? html`<section class="forecast"><div class="forecastbox"></div>${this._forecastError ? html`<div class="maperr">${this._forecastError}</div>` : nothing}</section>` : nothing}
          </div>` : nothing}
        </div>
        <aside class="rail">
          <div class="railbox">
            <div class="rhead"><span class="rtitle">${title}</span><button class="gear sm" aria-label="Preferenze" title="Preferenze" @click=${() => this._openSettings()}>${ICON_GEAR}</button></div>
            <div class="status"><span class="dot ${connected ? "ok" : "off"}"></span>${connected ? "CONNESSO" : blocks.length ? "NON AGGIORNATO" : "DA CONFIGURARE"}${age !== null ? html` <span class="ago">${new Date(newest!).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</span>` : nothing}</div>
            ${blocks.length ? this._datenavRail() : nothing}
          </div>
          ${blocks.length ? this._vtimeline() : nothing}
        </aside>
      </div></ha-card>`;
    }
    return html`<ha-card><div class="wrap">
      <header>
        <div class="h-left"><h1>${title}</h1>
          <div class="status"><span class="dot ${connected ? "ok" : "off"}"></span>${connected ? "CONNESSO" : blocks.length ? "NON AGGIORNATO" : "DA CONFIGURARE"}${age !== null ? html` <span class="ago">${new Date(newest!).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} · ${ago(age)}</span>` : nothing}</div></div>
        ${this._blocksCount ? this._datenav() : nothing}
        <button class="gear" aria-label="Preferenze" title="Preferenze" @click=${() => this._openSettings()}>${ICON_GEAR}</button>
      </header>
      ${blocks.length ? html`<div class="tiles" style="--n:${Math.min(7, blocks.length)}">${blocks}</div>${this._timebar()}` : html`<div class="empty"><p>Nessun sensore scelto.</p><button class="cta" @click=${() => this._openSettings()}>Apri le preferenze</button></div>`}
      ${this._settings.map.enabled || this._showForecast() ? html`<div class="bottom ${this._settings.map.enabled && this._showForecast() ? "two" : ""}">
        ${this._settings.map.enabled ? html`<section class="map"><div class="mapbox"></div>${this._radarError ? html`<div class="maperr">${this._radarError}</div>` : nothing}</section>` : nothing}
        ${this._showForecast() ? html`<section class="forecast"><div class="forecastbox"></div>${this._forecastError ? html`<div class="maperr">${this._forecastError}</div>` : nothing}</section>` : nothing}
      </div>` : nothing}
      ${this._noIntegration ? html`<div class="warn">Integrazione Weather Hubcasale non trovata: le preferenze sono salvate solo in questo browser.</div>` : nothing}
    </div></ha-card>`;
  }

  static styles = css`
    :host { display: block; height: 100%; container-type: inline-size; color: var(--primary-text-color); --whc-blue: #3d8fd1; --whc-red: #e0463c; --whc-track: var(--divider-color, #3a3d44); }
    ha-card { display: block; padding: 0; overflow: hidden; height: 100%; box-sizing: border-box; }
    :host([fill]) ha-card { height: calc(100vh - var(--header-height, 56px) - 16px); height: calc(100dvh - var(--header-height, 56px) - 16px); min-height: 560px; }
    :host([fill]) .wrap { height: 100%; min-height: 0; }
    :host([fill]) .bottom { min-height: 0; grid-template-rows: minmax(0, 1fr); }
    :host([fill]) .map, :host([fill]) .forecast { min-height: 0; }
    :host([fill]) .forecastbox { overflow-y: auto; overflow-x: hidden; }
    :host([fill]) .forecastbox > * { height: auto; min-height: 100%; }
    .wrap { padding: 8px 12px 12px; display: flex; flex-direction: column; min-height: 100%; box-sizing: border-box; }
    header { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; }
    .h-left { flex: 1; min-width: 0; }
    h1 { margin: 0; font-size: 1.35rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .status { font-size: .72rem; letter-spacing: .08em; color: var(--secondary-text-color); margin-top: 2px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; background: #888; }
    .dot.ok { background: #38c172; box-shadow: 0 0 6px #38c172; } .dot.off { background: #e0463c; }
    .ago { letter-spacing: 0; text-transform: none; font-size: .78rem; }
    button.gear { width: 44px; height: 44px; border-radius: 22px; border: 1px solid var(--divider-color); background: transparent; color: var(--primary-text-color); cursor: pointer; display: flex; align-items: center; justify-content: center; }
    .bottom { display: grid; gap: 10px; grid-template-columns: minmax(0, 1fr); margin-top: 8px; flex: 1; }
    .tiles { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
    .tile { position: relative; display: flex; flex-direction: column; align-items: center; min-height: 168px; padding: 6px 8px 8px; border: 1px solid var(--divider-color); border-radius: 12px; background: var(--ha-card-background, var(--card-background-color, #1c1c1c)); box-sizing: border-box; }
    .t-title { font-size: .66rem; letter-spacing: .05em; text-transform: uppercase; font-weight: 600; color: var(--primary-text-color); align-self: flex-start; padding: 0 44px 0 4px; min-height: 36px; display: flex; align-items: center; box-sizing: border-box; width: 100%; }
    .tile.two .t-title { padding-right: 88px; }
    .cbtns { position: absolute; top: 0; right: 0; display: flex; }
    button.cbtn { width: 44px; height: 44px; border: 0; background: transparent; color: var(--secondary-text-color); cursor: pointer; border-radius: 22px; display: flex; align-items: center; justify-content: center; }
    button.cbtn:active { background: var(--secondary-background-color); }
    .gauge { width: 100%; max-width: 128px; height: auto; margin-top: -10px; }
    .track { stroke: var(--whc-track); }
    .tick { stroke: var(--secondary-text-color); stroke-width: .7; opacity: .7; }
    .tick-major { stroke: var(--primary-text-color); stroke-width: 1.4; }
    .lbl { fill: var(--secondary-text-color); font-size: 7px; } .lbl.small { font-size: 6px; } .lbl.tiny { font-size: 5px; }
    .outline { stroke: var(--secondary-text-color); } .dial, .disc { fill: var(--secondary-background-color, #2a2a2a); stroke: var(--divider-color); }
    .t-val { font-size: 1.75rem; font-weight: 300; line-height: 1.05; margin-top: 0; }
    .t-val .u { font-size: .8rem; color: var(--secondary-text-color); margin-left: 3px; }
    .t-sub { font-size: .68rem; letter-spacing: .06em; text-transform: uppercase; color: var(--secondary-text-color); text-align: center; margin-top: 4px; min-height: 1.6em; }
    .timebar { margin-top: 6px; padding: 0 4px; }
    .datenav { display: flex; align-items: center; gap: 6px; margin-left: auto; }
    .datenav .date { font-size: .95rem; min-width: 9.5em; text-align: center; text-transform: capitalize; }
    button.nb, button.now { min-height: 44px; min-width: 44px; border-radius: 22px; border: 1px solid var(--divider-color); background: transparent; color: var(--primary-text-color); font-size: 1.3rem; cursor: pointer; }
    button.now { font-size: .9rem; padding: 0 16px; }
    button[disabled] { opacity: .35; cursor: default; }
    .slider { position: relative; padding-top: 24px; }
    .bubble { position: absolute; top: 0; transform: translateX(-50%); font-size: .8rem; color: var(--primary-text-color); background: var(--secondary-background-color); padding: 1px 8px; border-radius: 10px; pointer-events: none; white-space: nowrap; }
    input[type=range] { -webkit-appearance: none; appearance: none; width: 100%; height: 40px; margin: 0; background: transparent; touch-action: pan-y; }
    input[type=range]::-webkit-slider-runnable-track { height: 6px; border-radius: 3px; background: linear-gradient(to right, var(--whc-blue) var(--p), var(--divider-color) var(--p) var(--now, 100%), rgba(127, 127, 127, .18) var(--now, 100%)); }
    input[type=range]::-moz-range-track { height: 6px; border-radius: 3px; background: var(--divider-color); }
    input[type=range]::-moz-range-progress { height: 6px; border-radius: 3px; background: var(--whc-blue); }
    input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 24px; height: 24px; margin-top: -9px; border-radius: 50%; background: var(--whc-blue); border: 3px solid var(--card-background-color, #1c1c1c); box-shadow: 0 0 0 1px var(--whc-blue); }
    input[type=range]::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: var(--whc-blue); border: 3px solid var(--card-background-color, #1c1c1c); }
    .ticks { display: flex; justify-content: space-between; font-size: .72rem; color: var(--secondary-text-color); margin-top: -8px; padding: 0 2px; }
    .map, .forecast { position: relative; min-height: 280px; border: 1px solid var(--divider-color); border-radius: 12px; overflow: hidden; background: var(--secondary-background-color, #2a2a2a); }
    .mapbox, .mapbox > *, .forecastbox, .forecastbox > * { display: block; width: 100%; height: 100%; min-height: inherit; }
    .maperr { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center; padding: 20px; color: var(--secondary-text-color); font-size: .9rem; }

    /* ---- vista tablet: colonna a destra a tutta altezza ---- */
    :host([tablet]) ha-card { height: calc(100vh - var(--header-height, 56px) - 16px); height: calc(100dvh - var(--header-height, 56px) - 16px); min-height: 560px; }
    .wrap.tab { display: grid; grid-template-columns: minmax(0, 1fr) 128px; gap: 10px; height: 100%; min-height: 0; padding: 8px 10px; }
    .tmain { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
    .tab .tiles { grid-template-columns: repeat(var(--n, 7), minmax(0, 1fr)); gap: 8px; }
    .tab .bottom { margin-top: 8px; }
    .tab button.cbtn { width: 36px; height: 36px; }
    .tab .t-title { padding-right: 36px; font-size: .62rem; letter-spacing: .03em; }
    .tab .tile.two .t-title { padding-right: 72px; }
    .rail { display: flex; flex-direction: column; gap: 8px; min-height: 0; }
    .railbox { border: 1px solid var(--divider-color); border-radius: 12px; padding: 8px; background: var(--ha-card-background, var(--card-background-color, #1c1c1c)); }
    .rhead { display: flex; align-items: flex-start; gap: 4px; }
    .rtitle { flex: 1; min-width: 0; font-size: .95rem; font-weight: 500; line-height: 1.15; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; }
    button.gear.sm { width: 36px; height: 36px; border-radius: 18px; flex: none; margin: -4px -4px 0 0; border: 0; }
    .railbox .status { margin: 4px 0 6px; font-size: .62rem; }
    .railbox .ago { font-size: .7rem; }
    .rdate { display: grid; grid-template-columns: 1fr 1fr; align-items: center; gap: 6px; }
    .rdate button.nb { min-width: 0; width: 100%; min-height: 40px; font-size: 1.3rem; padding: 0; }
    .rdl { grid-column: 1 / -1; text-align: center; font-size: .85rem; line-height: 1.2; text-transform: capitalize; }
    .rdate button.now { grid-column: 1 / -1; min-height: 40px; font-size: .85rem; padding: 0; }
    .vtl { flex: 1; min-height: 0; position: relative; border: 1px solid var(--divider-color); border-radius: 12px; background: var(--ha-card-background, var(--card-background-color, #1c1c1c)); touch-action: none; cursor: pointer; user-select: none; }
    .vin { position: absolute; inset: 16px 8px 16px 8px; }
    .vlab { position: absolute; left: 0; transform: translateY(-50%); font-size: .72rem; color: var(--secondary-text-color); }
    .vtrack { position: absolute; left: 34px; top: 0; bottom: 0; width: 6px; border-radius: 3px; background: linear-gradient(to bottom, var(--whc-blue) var(--p), var(--divider-color) var(--p) var(--now, 100%), rgba(127, 127, 127, .18) var(--now, 100%)); }
    .vthumb { position: absolute; left: 24px; top: var(--p); transform: translateY(-50%); width: 26px; height: 26px; border-radius: 50%; background: var(--whc-blue); border: 3px solid var(--card-background-color, #1c1c1c); box-shadow: 0 0 0 1px var(--whc-blue); box-sizing: border-box; }
    .vbub { position: absolute; left: 56px; top: var(--p); transform: translateY(-50%); font-size: .78rem; background: var(--secondary-background-color); padding: 2px 7px; border-radius: 10px; white-space: nowrap; pointer-events: none; }
    .empty { text-align: center; padding: 40px 10px; color: var(--secondary-text-color); }
    button.cta { min-height: 44px; padding: 0 22px; border-radius: 22px; border: 0; background: var(--primary-color, #03a9f4); color: #fff; font-size: 1rem; cursor: pointer; }
    .warn { margin-top: 10px; font-size: .8rem; color: #f0923c; }
    @container (min-width: 1000px) {
      .tiles { grid-template-columns: repeat(var(--n, 7), minmax(0, 1fr)); }
    }
    @container (min-width: 760px) {
      .bottom.two { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
    }
    @container (max-width: 640px) {
      .h-left { flex-basis: 100%; }
      .datenav { margin-left: 0; flex: 1; }
      .datenav .date { flex: 1; min-width: 0; }
    }
    @container (max-width: 420px) {
      .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .datenav .date { min-width: 0; flex: 1; font-size: .85rem; }
      .t-val { font-size: 1.6rem; }
    }
  `;
}

customElements.define("weather-hubcasale-card", WeatherHubcasaleCard);
(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({ type: "weather-hubcasale-card", name: "Weather Hubcasale", description: "Stazione meteo personale: blocchi con barra temporale, mappa radar e grafici in popup." });
