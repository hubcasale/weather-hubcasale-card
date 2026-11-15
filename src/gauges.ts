import { svg } from "lit";
import { clamp, tempColor, uvLevel } from "./logic";

/** Quadranti SVG dei sette blocchi. Tutti disegnati qui (nessuna immagine esterna), viewBox 120 x 92. */

const TEMP_MIN = -15, TEMP_MAX = 40;

export function tempGauge(t: number | null) {
  const stops = [-15, -5, 5, 14, 22, 30, 40];
  const f = t === null ? 0 : clamp((t - TEMP_MIN) / (TEMP_MAX - TEMP_MIN), 0, 1);
  const th = Math.PI * (1 - f);
  const mx = 60 + 44 * Math.cos(th), my = 62 - 44 * Math.sin(th);
  return svg`
    <svg viewBox="0 0 120 80" class="gauge" aria-hidden="true">
      <defs>
        <linearGradient id="tg" x1="16" y1="0" x2="104" y2="0" gradientUnits="userSpaceOnUse">
          ${stops.map((s, i) => svg`<stop offset="${(i / (stops.length - 1)) * 100}%" stop-color="${tempColor(s)}"/>`)}
        </linearGradient>
      </defs>
      <path d="M16 62 A44 44 0 0 1 104 62" fill="none" stroke="url(#tg)" stroke-width="7" stroke-linecap="round"/>
      ${t === null ? "" : svg`<circle cx="${mx}" cy="${my}" r="6" fill="#fff" stroke="${tempColor(t)}" stroke-width="3"/>`}
    </svg>`;
}

export function humidityRing(h: number | null) {
  const r = 34, c = 2 * Math.PI * r, f = h === null ? 0 : clamp(h / 100, 0, 1);
  return svg`
    <svg viewBox="0 0 120 80" class="gauge" aria-hidden="true">
      <circle cx="60" cy="42" r="${r}" fill="none" class="track" stroke-width="10"/>
      <circle cx="60" cy="42" r="${r}" fill="none" stroke="var(--whc-blue, #3d8fd1)" stroke-width="10"
        stroke-dasharray="${f * c} ${c}" transform="rotate(-90 60 42)" stroke-linecap="butt"/>
    </svg>`;
}

export function compass(deg: number | null) {
  const ticks = [];
  for (let a = 0; a < 360; a += 5) {
    const major = a % 45 === 0;
    const r1 = major ? 31 : 35, r2 = 40, rad = (a - 90) * Math.PI / 180;
    ticks.push(svg`<line x1="${60 + r1 * Math.cos(rad)}" y1="${42 + r1 * Math.sin(rad)}" x2="${60 + r2 * Math.cos(rad)}" y2="${42 + r2 * Math.sin(rad)}" class="${major ? "tick-major" : "tick"}"/>`);
  }
  const labels = [["N", 0], ["E", 90], ["S", 180], ["O", 270]].map(([l, a]) => {
    const rad = ((a as number) - 90) * Math.PI / 180;
    return svg`<text x="${60 + 25 * Math.cos(rad)}" y="${42 + 25 * Math.sin(rad) + 3}" text-anchor="middle" class="lbl">${l}</text>`;
  });
  return svg`
    <svg viewBox="0 0 120 80" class="gauge" aria-hidden="true">
      ${ticks}${labels}
      ${deg === null ? "" : svg`<g transform="rotate(${deg} 60 42)"><path d="M60 15 L66 30 L60 27 L54 30 Z" fill="var(--primary-text-color,#fff)"/><path d="M60 69 L57 57 L63 57 Z" fill="var(--secondary-text-color,#999)" opacity=".5"/></g>`}
    </svg>`;
}

export function niceMax(v: number): number {
  for (const m of [5, 10, 20, 50, 100, 200, 500]) if (v <= m) return m;
  return 1000;
}

export function rainCylinder(mm: number | null) {
  const max = niceMax(mm ?? 0), f = mm === null ? 0 : clamp(mm / max, 0, 1);
  const top = 10, bottom = 66, h = bottom - top, level = bottom - h * f;
  return svg`
    <svg viewBox="0 0 120 80" class="gauge" aria-hidden="true">
      <path d="M44 ${top} v${h} a16 5 0 0 0 32 0 v${-h}" fill="none" class="outline" stroke-width="2"/>
      <ellipse cx="60" cy="${top}" rx="16" ry="5" fill="none" class="outline" stroke-width="2"/>
      ${f > 0 ? svg`<path d="M44 ${level} v${bottom - level} a16 5 0 0 0 32 0 v${-(bottom - level)} a16 5 0 0 1 -32 0 Z" fill="var(--whc-blue, #3d8fd1)" opacity=".85"/>` : ""}
      ${[0.25, 0.5, 0.75].map((q) => svg`<line x1="${44}" x2="${50}" y1="${bottom - h * q}" y2="${bottom - h * q}" class="tick"/>`)}
      <text x="84" y="${top + 4}" class="lbl small">${max}</text>
    </svg>`;
}

export function pressureDial(p: number | null) {
  const lo = p === null ? 990 : Math.round(p / 10) * 10 - 30, hi = lo + 60;
  const start = 225, sweep = 270;
  const ang = (v: number) => start + ((v - lo) / (hi - lo)) * sweep;
  const pt = (a: number, r: number) => { const rad = (a - 90) * Math.PI / 180; return [60 + r * Math.cos(rad), 42 + r * Math.sin(rad)]; };
  const ticks = [];
  for (let v = lo; v <= hi; v += 2) {
    const major = (v - lo) % 10 === 0;
    const [x1, y1] = pt(ang(v), major ? 28 : 33), [x2, y2] = pt(ang(v), 38);
    ticks.push(svg`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${major ? "tick-major" : "tick"}"/>`);
    if (major) { const [tx, ty] = pt(ang(v), 21); ticks.push(svg`<text x="${tx}" y="${ty + 2.5}" text-anchor="middle" class="lbl tiny">${v}</text>`); }
  }
  const needle = p === null ? "" : (() => { const [x, y] = pt(ang(clamp(p, lo, hi)), 31); return svg`<line x1="60" y1="42" x2="${x}" y2="${y}" stroke="var(--whc-red, #e0463c)" stroke-width="2.4" stroke-linecap="round"/><circle cx="60" cy="42" r="3.5" fill="var(--whc-red, #e0463c)"/>`; })();
  return svg`
    <svg viewBox="0 0 120 80" class="gauge" aria-hidden="true">
      <circle cx="60" cy="42" r="40" class="dial"/>
      ${ticks}${needle}
    </svg>`;
}

export function uvPyramid(uv: number | null) {
  const bars = [];
  const n = 11, h = 5, gap = 1.6, baseY = 76;
  for (let idx = 1; idx <= n; idx++) {            // fascia 1 = base (larga), 11 = vertice
    const width = 70 - (idx - 1) * 5.2;
    const on = uv !== null && idx <= Math.round(uv);
    bars.push(svg`<rect x="${60 - width / 2}" y="${baseY - idx * (h + gap)}" width="${width}" height="${h}" rx="1.2" fill="${on ? uvLevel(idx).color : "var(--whc-track, #3a3d44)"}"/>`);
  }
  return svg`<svg viewBox="0 0 120 80" class="gauge" aria-hidden="true">${bars}</svg>`;
}

export function radiationSun(w: number | null) {
  const f = w === null ? 0 : clamp(Math.sqrt(w / 1000), 0, 1);
  const r = 7 + 17 * f;
  return svg`
    <svg viewBox="0 0 120 80" class="gauge" aria-hidden="true">
      <circle cx="60" cy="40" r="34" class="disc"/>
      ${w !== null && w > 0 ? svg`<circle cx="60" cy="40" r="${r + 6}" fill="#f0b43c" opacity=".18"/><circle cx="60" cy="40" r="${r + 3}" fill="#f0b43c" opacity=".3"/>` : ""}
      <circle cx="60" cy="40" r="${w === null || w <= 0 ? 7 : r}" fill="${w !== null && w > 0 ? "#f0b43c" : "var(--whc-track, #3a3d44)"}"/>
    </svg>`;
}
