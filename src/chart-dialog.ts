import { LitElement, html, css, svg, nothing } from "lit";
import { downsample, fmt, niceTicks } from "./logic";
import type { Series } from "./types";

export interface ChartSeries { label: string; color: string; unit: string; data: Series; style?: "line" | "dots" | "area" }
export interface ChartSpec { title: string; series: ChartSeries[]; dayStart: number; yMin?: number; yMax?: number; decimals?: number }

/** Popup con il grafico del giorno: si attacca al body, si chiude toccando fuori o con la X; tocco/mouse mostra i valori. */
export class WhcChartDialog extends LitElement {
  static properties = { spec: { attribute: false }, _cursor: { state: true } };
  declare spec: ChartSpec | null;
  declare _cursor: number | null;

  constructor() { super(); this.spec = null; this._cursor = null; }

  static styles = css`
    :host { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.55); font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif); }
    .box { background: var(--card-background-color, #1c1c1c); color: var(--primary-text-color, #e1e1e1); border-radius: 14px; width: min(920px, 96vw); max-height: 92vh; overflow: auto; padding: 14px 16px 16px; box-shadow: 0 8px 32px rgba(0,0,0,.5); }
    .head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
    .head h2 { margin: 0; font-size: 1.1rem; font-weight: 500; flex: 1; }
    button.x { border: 0; background: transparent; color: inherit; font-size: 1.6rem; line-height: 1; min-width: 44px; min-height: 44px; border-radius: 22px; cursor: pointer; }
    .legend { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: .85rem; color: var(--secondary-text-color, #9b9b9b); margin: 2px 0 8px; }
    .legend span.sw { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
    svg { width: 100%; height: auto; display: block; touch-action: none; cursor: crosshair; }
    .grid { stroke: var(--divider-color, #3a3a3a); stroke-width: 1; }
    .axis { fill: var(--secondary-text-color, #9b9b9b); font-size: 11px; }
    .read { display: flex; flex-wrap: wrap; gap: 4px 18px; font-size: .95rem; min-height: 1.4em; margin-top: 6px; }
    .empty { padding: 40px 0; text-align: center; color: var(--secondary-text-color, #9b9b9b); }
  `;

  private _close = () => this.remove();

  private _geom() { return { w: 880, h: 340, l: 46, r: 14, t: 12, b: 28 }; }

  private _onMove(ev: PointerEvent) {
    const g = this._geom(), el = ev.currentTarget as SVGSVGElement, rect = el.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * g.w;
    this._cursor = Math.min(1, Math.max(0, (x - g.l) / (g.w - g.l - g.r)));
  }

  render() {
    const spec = this.spec;
    if (!spec) return nothing;
    const g = this._geom();
    const day0 = spec.dayStart, day1 = day0 + 86400e3;
    const all = spec.series.flatMap((s) => s.data.map((p) => p.v));
    const has = all.length > 0;
    let lo = spec.yMin ?? (has ? Math.min(...all) : 0), hi = spec.yMax ?? (has ? Math.max(...all) : 1);
    if (spec.yMin === undefined || spec.yMax === undefined) {
      const pad = (hi - lo) * 0.1 || 1;
      if (spec.yMin === undefined) lo -= pad;
      if (spec.yMax === undefined) hi += pad;
    }
    const X = (ts: number) => g.l + ((ts - day0) / (day1 - day0)) * (g.w - g.l - g.r);
    const Y = (v: number) => g.t + (1 - (v - lo) / (hi - lo)) * (g.h - g.t - g.b);
    const yTicks = niceTicks(lo, hi, 5);
    const dec = spec.decimals ?? ((yTicks[1] ?? 1) - (yTicks[0] ?? 0) < 1 ? 1 : 0);
    const cursorTs = this._cursor === null ? null : day0 + this._cursor * (day1 - day0);
    const reading = cursorTs === null ? [] : spec.series.map((s) => {
      let best: number | null = null;
      for (const p of s.data) { if (p.ts <= cursorTs) best = p.v; else break; }
      return { s, v: best };
    });
    return html`
      <div class="box" @click=${(e: Event) => e.stopPropagation()}>
        <div class="head"><h2>${spec.title}</h2><button class="x" aria-label="Chiudi" @click=${this._close}>×</button></div>
        <div class="legend">${spec.series.map((s) => html`<span><span class="sw" style="background:${s.color}"></span>${s.label}${s.unit ? ` (${s.unit})` : ""}</span>`)}</div>
        ${has ? html`
        <svg viewBox="0 0 ${g.w} ${g.h}" @pointermove=${this._onMove} @pointerdown=${this._onMove} @pointerleave=${() => (this._cursor = null)}>
          ${yTicks.map((v) => svg`<line class="grid" x1="${g.l}" x2="${g.w - g.r}" y1="${Y(v)}" y2="${Y(v)}"/><text class="axis" x="${g.l - 6}" y="${Y(v) + 4}" text-anchor="end">${fmt(v, dec)}</text>`)}
          ${[0, 3, 6, 9, 12, 15, 18, 21, 24].map((h) => svg`<line class="grid" x1="${X(day0 + h * 3600e3)}" x2="${X(day0 + h * 3600e3)}" y1="${g.t}" y2="${g.h - g.b}" opacity=".5"/><text class="axis" x="${X(day0 + h * 3600e3)}" y="${g.h - 8}" text-anchor="middle">${String(h % 24).padStart(2, "0")}:00</text>`)}
          ${spec.series.map((s) => {
            const pts = downsample(s.data.filter((p) => p.ts >= day0 && p.ts <= day1), 420);
            if (pts.length === 0) return nothing;
            if (s.style === "dots") return svg`${pts.map((p) => svg`<circle cx="${X(p.ts)}" cy="${Y(p.v)}" r="2.2" fill="${s.color}"/>`)}`;
            const d = pts.map((p, i) => `${i ? "L" : "M"}${X(p.ts).toFixed(1)} ${Y(p.v).toFixed(1)}`).join(" ");
            const area = s.style === "area" ? svg`<path d="${d} L${X(pts[pts.length - 1].ts)} ${g.h - g.b} L${X(pts[0].ts)} ${g.h - g.b} Z" fill="${s.color}" opacity=".18"/>` : nothing;
            return svg`${area}<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>`;
          })}
          ${cursorTs === null ? nothing : svg`<line x1="${X(cursorTs)}" x2="${X(cursorTs)}" y1="${g.t}" y2="${g.h - g.b}" stroke="var(--primary-text-color,#fff)" stroke-width="1" opacity=".6"/>`}
        </svg>
        <div class="read">${cursorTs === null
            ? html`<span style="color:var(--secondary-text-color)">Tocca il grafico per leggere i valori.</span>`
            : html`<b>${new Date(cursorTs).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</b>${reading.map((r) => html`<span><span class="sw" style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${r.s.color};margin-right:5px"></span>${fmt(r.v, dec)} ${r.s.unit}</span>`)}`}
        </div>` : html`<div class="empty">Nessun dato per questo giorno.</div>`}
      </div>`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener("click", this._close);
    this._esc = (e: KeyboardEvent) => { if (e.key === "Escape") this._close(); };
    window.addEventListener("keydown", this._esc);
  }
  disconnectedCallback() { super.disconnectedCallback(); window.removeEventListener("keydown", this._esc); }
  private _esc: (e: KeyboardEvent) => void = () => {};
}
customElements.define("whc-chart-dialog", WhcChartDialog);
