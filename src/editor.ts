import { LitElement, html, nothing } from "lit";
import { EDITOR_HELPERS, EDITOR_LABELS, EDITOR_SCHEMA, fromEditorData, resolveSettings, toEditorData } from "./config";
import type { CardConfig } from "./config";
import type { Hass, Settings } from "./types";

/** Editor visuale della scheda: un modulo ha-form i cui valori diventano la configurazione della scheda. */
export class WeatherHubcasaleCardEditor extends LitElement {
  static properties = { hass: { attribute: false }, _config: { state: true }, _legacy: { state: true } };
  declare hass: Hass;
  declare _config: CardConfig | null;
  declare _legacy: Partial<Settings> | null;
  private _legacyAsked = false;

  constructor() { super(); this._config = null; this._legacy = null; }

  setConfig(config: CardConfig) { this._config = config ?? {}; }

  /** Una scheda creata prima dell'editor non ha `entities`: il modulo parte dalle preferenze salvate, cosi' non si rimappa tutto a mano. */
  protected willUpdate() {
    if (this._legacyAsked || !this.hass || !this._config || this._config.entities) return;
    this._legacyAsked = true;
    this.hass.callWS<Settings>({ type: "weather_hubcasale/get_settings" }).then((s) => { this._legacy = s; }).catch(() => { /* integrazione assente: nessuna preferenza salvata */ });
  }

  private _changed = (ev: CustomEvent) => {
    ev.stopPropagation();
    const config = fromEditorData(ev.detail.value as Record<string, unknown>, this._config);
    this._config = config;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config }, bubbles: true, composed: true }));
  };

  render() {
    if (!this.hass || !this._config) return nothing;
    const data = toEditorData(resolveSettings(this._config, this._legacy), this._config);
    return html`<ha-form
      .hass=${this.hass}
      .data=${data}
      .schema=${EDITOR_SCHEMA}
      .computeLabel=${(s: { name: string }) => EDITOR_LABELS[s.name] ?? s.name}
      .computeHelper=${(s: { name: string }) => EDITOR_HELPERS[s.name]}
      @value-changed=${this._changed}
    ></ha-form>`;
  }
}
customElements.define("weather-hubcasale-card-editor", WeatherHubcasaleCardEditor);
