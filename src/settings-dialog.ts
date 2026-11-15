import { LitElement, html, css, nothing } from "lit";
import { ENTITY_KEYS, defaultSettings } from "./types";
import type { EntityKey, Hass, Settings } from "./types";

interface Field { key: EntityKey; label: string; hint: string[]; units: string[]; domains?: string[] }
interface Group { title: string; fields: Field[] }

/** Suggerimenti per ogni campo: classe del dispositivo o unita' di misura tipica (servono solo a ordinare l'elenco). */
const GROUPS: Group[] = [
  { title: "Temperatura", fields: [
    { key: "temperature", label: "Temperatura", hint: ["temperature"], units: ["°C", "°F"] },
    { key: "feels_like", label: "Temperatura percepita (facoltativa, altrimenti calcolata)", hint: ["temperature"], units: ["°C", "°F"] },
  ] },
  { title: "Umidità", fields: [
    { key: "humidity", label: "Umidità relativa", hint: ["humidity"], units: ["%"] },
    { key: "dew_point", label: "Punto di rugiada (facoltativo, altrimenti calcolato)", hint: ["temperature"], units: ["°C", "°F"] },
  ] },
  { title: "Vento", fields: [
    { key: "wind_speed", label: "Velocità del vento", hint: ["wind_speed", "speed"], units: ["km/h", "m/s", "mph", "kn"] },
    { key: "wind_gust", label: "Raffica", hint: ["wind_speed", "speed"], units: ["km/h", "m/s", "mph", "kn"] },
    { key: "wind_direction", label: "Direzione del vento (gradi)", hint: ["wind_direction"], units: ["°"] },
  ] },
  { title: "Precipitazioni", fields: [
    { key: "rain_rate", label: "Intensità (mm/h)", hint: ["precipitation_intensity"], units: ["mm/h", "mm"] },
    { key: "rain_day", label: "Totale del giorno (mm)", hint: ["precipitation"], units: ["mm"] },
  ] },
  { title: "Pressione", fields: [
    { key: "pressure", label: "Pressione", hint: ["pressure", "atmospheric_pressure"], units: ["hPa", "mbar", "kPa", "inHg"] },
  ] },
  { title: "Previsioni", fields: [
    { key: "weather", label: "Entità meteo per le previsioni (weather.…)", hint: [], units: [], domains: ["weather"] },
  ] },
  { title: "UV e radiazione", fields: [
    { key: "uv", label: "Indice UV (se manca il blocco resta nascosto)", hint: [], units: ["UV index", "UVI"] },
    { key: "radiation", label: "Radiazione solare (se manca il blocco resta nascosto)", hint: ["irradiance"], units: ["W/m²", "W/m2"] },
  ] },
];

/** Dialogo delle preferenze: sceglie i sensori di ogni blocco, la mappa e il titolo. */
export class WhcSettingsDialog extends LitElement {
  static properties = { hass: { attribute: false }, settings: { attribute: false }, _draft: { state: true }, _open: { state: true }, _q: { state: true }, _saving: { state: true }, _error: { state: true } };
  declare hass: Hass;
  declare settings: Settings;
  declare onSave: (s: Settings) => Promise<void>;
  declare _draft: Settings;
  declare _open: EntityKey | null;
  declare _q: string;
  declare _saving: boolean;
  declare _error: string;

  constructor() { super(); this._draft = defaultSettings(); this._open = null; this._q = ""; this._saving = false; this._error = ""; }

  connectedCallback() {
    super.connectedCallback();
    this._draft = { ...defaultSettings(), ...JSON.parse(JSON.stringify(this.settings ?? defaultSettings())) };
    this.addEventListener("click", this._close);
  }

  static styles = css`
    :host { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.55); font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif); }
    .box { background: var(--card-background-color, #1c1c1c); color: var(--primary-text-color, #e1e1e1); border-radius: 14px; width: min(720px, 96vw); max-height: 92vh; display: flex; flex-direction: column; box-shadow: 0 8px 32px rgba(0,0,0,.5); }
    .head { display: flex; align-items: center; padding: 10px 14px 6px 18px; }
    .head h2 { margin: 0; font-size: 1.15rem; font-weight: 500; flex: 1; }
    button.x { border: 0; background: transparent; color: inherit; font-size: 1.6rem; min-width: 44px; min-height: 44px; border-radius: 22px; cursor: pointer; }
    .body { overflow: auto; padding: 4px 18px 8px; }
    h3 { font-size: .8rem; letter-spacing: .08em; text-transform: uppercase; color: var(--secondary-text-color, #9b9b9b); margin: 16px 0 6px; font-weight: 500; }
    .field { margin: 8px 0; position: relative; }
    label { display: block; font-size: .85rem; margin-bottom: 3px; color: var(--secondary-text-color, #9b9b9b); }
    .row { display: flex; gap: 6px; }
    input[type=text], input[type=number] { flex: 1; box-sizing: border-box; min-height: 44px; padding: 8px 10px; font-size: 1rem; color: inherit; background: var(--secondary-background-color, #2a2a2a); border: 1px solid var(--divider-color, #3a3a3a); border-radius: 8px; }
    button.clear { min-width: 44px; min-height: 44px; border: 1px solid var(--divider-color, #3a3a3a); background: transparent; color: inherit; border-radius: 8px; cursor: pointer; font-size: 1.1rem; }
    .list { position: absolute; z-index: 5; left: 0; right: 0; top: 100%; max-height: 260px; overflow: auto; background: var(--card-background-color, #1c1c1c); border: 1px solid var(--divider-color, #3a3a3a); border-radius: 8px; box-shadow: 0 6px 18px rgba(0,0,0,.45); }
    .item { padding: 8px 10px; min-height: 40px; box-sizing: border-box; cursor: pointer; border-bottom: 1px solid var(--divider-color, #3a3a3a); display: flex; flex-direction: column; justify-content: center; }
    .item:last-child { border-bottom: 0; }
    .item b { font-weight: 500; }
    .item small { color: var(--secondary-text-color, #9b9b9b); }
    .item.sug b::after { content: " ★"; color: #f0b43c; }
    .sw { display: flex; align-items: center; gap: 10px; min-height: 44px; }
    .sw input { width: 22px; height: 22px; }
    .foot { display: flex; gap: 10px; justify-content: flex-end; padding: 10px 18px 14px; border-top: 1px solid var(--divider-color, #3a3a3a); align-items: center; }
    .err { color: #e0463c; flex: 1; font-size: .9rem; }
    button.btn { min-height: 44px; padding: 0 20px; border-radius: 22px; border: 1px solid var(--divider-color, #3a3a3a); background: transparent; color: inherit; font-size: 1rem; cursor: pointer; }
    button.btn.pri { background: var(--primary-color, #03a9f4); border-color: transparent; color: #fff; }
    button.btn[disabled] { opacity: .5; }
  `;

  private _close = () => this.remove();

  private _name(id: string): string { return this.hass.states[id]?.attributes?.friendly_name ?? id; }

  private _candidates(f: Field): { id: string; sug: boolean }[] {
    const q = this._q.trim().toLowerCase();
    const out: { id: string; sug: boolean; rank: number }[] = [];
    for (const [id, st] of Object.entries(this.hass.states)) {
      const domains = f.domains ?? ["sensor", "number", "input_number"];
      if (!domains.includes(id.split(".")[0])) continue;
      const name = String(st.attributes?.friendly_name ?? "").toLowerCase();
      if (q && !id.includes(q) && !name.includes(q)) continue;
      const dc = st.attributes?.device_class, unit = st.attributes?.unit_of_measurement;
      const sug = (dc && f.hint.includes(dc)) || (unit && f.units.includes(unit));
      out.push({ id, sug: !!sug, rank: sug ? 0 : 1 });
    }
    out.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
    return out.slice(0, 40);
  }

  private _pick(key: EntityKey, id: string) { this._draft = { ...this._draft, entities: { ...this._draft.entities, [key]: id } }; this._open = null; this._q = ""; }

  private async _save() {
    this._saving = true; this._error = "";
    try { await this.onSave(this._draft); this.remove(); }
    catch (e: any) { this._error = e?.message ? String(e.message) : "Salvataggio non riuscito."; this._saving = false; }
  }

  private _field(f: Field) {
    const cur = this._draft.entities[f.key];
    const open = this._open === f.key;
    return html`<div class="field"><label>${f.label}</label>
      <div class="row">
        <input type="text" .value=${open ? this._q : cur ? `${this._name(cur)} (${cur})` : ""} placeholder="Nessun sensore" @focus=${() => { this._open = f.key; this._q = ""; }} @input=${(e: Event) => { this._open = f.key; this._q = (e.target as HTMLInputElement).value; }} />
        <button class="clear" aria-label="Svuota" @click=${(e: Event) => { e.stopPropagation(); this._pick(f.key, ""); }}>×</button>
      </div>
      ${open ? html`<div class="list">${this._candidates(f).map((c) => { const st = this.hass.states[c.id]; return html`<div class="item ${c.sug ? "sug" : ""}" @click=${(e: Event) => { e.stopPropagation(); this._pick(f.key, c.id); }}><b>${this._name(c.id)}</b><small>${c.id} · ${st?.state}${st?.attributes?.unit_of_measurement ? " " + st.attributes.unit_of_measurement : ""}</small></div>`; })}</div>` : nothing}
    </div>`;
  }

  render() {
    return html`
      <div class="box" @click=${(e: Event) => e.stopPropagation()}>
        <div class="head"><h2>Preferenze</h2><button class="x" aria-label="Chiudi" @click=${this._close}>×</button></div>
        <div class="body" @click=${(e: Event) => { e.stopPropagation(); this._open = null; }}>
          <h3>Generale</h3>
          <div class="field"><label>Titolo (facoltativo)</label><div class="row"><input type="text" .value=${this._draft.title} placeholder="Nome della stazione" @input=${(e: Event) => (this._draft = { ...this._draft, title: (e.target as HTMLInputElement).value })} /></div></div>
          ${GROUPS.map((g) => html`<h3>${g.title}</h3>${g.fields.map((f) => this._field(f))}`)}
          <label class="sw"><input type="checkbox" .checked=${this._draft.forecast.enabled} @change=${(e: Event) => (this._draft = { ...this._draft, forecast: { enabled: (e.target as HTMLInputElement).checked } })} /> Mostra le previsioni (Weather Forecast Extended Card)</label>
          <h3>Mappa</h3>
          <label class="sw"><input type="checkbox" .checked=${this._draft.map.enabled} @change=${(e: Event) => (this._draft = { ...this._draft, map: { ...this._draft.map, enabled: (e.target as HTMLInputElement).checked } })} /> Mostra la mappa radar (Weather Radar Card)</label>
          <div class="field"><label>Zoom iniziale (3 = regione, 12 = quartiere)</label><div class="row"><input type="number" min="3" max="12" .value=${String(this._draft.map.zoom)} @input=${(e: Event) => (this._draft = { ...this._draft, map: { ...this._draft.map, zoom: Number((e.target as HTMLInputElement).value) || 7 } })} /></div></div>
          <p style="font-size:.8rem;color:var(--secondary-text-color)">I blocchi senza sensore restano nascosti. Le preferenze valgono per tutti i dispositivi.</p>
        </div>
        <div class="foot"><span class="err">${this._error}</span>
          <button class="btn" @click=${this._close}>Annulla</button>
          <button class="btn pri" ?disabled=${this._saving} @click=${this._save}>${this._saving ? "Salvo…" : "Salva"}</button></div>
      </div>`;
  }
}
customElements.define("whc-settings-dialog", WhcSettingsDialog);
void ENTITY_KEYS;
