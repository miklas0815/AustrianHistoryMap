// Zeichnet die Zeitleiste als reines SVG mit Inline-Attributen (kein CSS),
// damit dieselbe Grafik am Bildschirm, im PDF (svg2pdf) und als JPEG
// identisch aussieht.

import { BAR_H, LANE_PAD, ROW_H, laneHeight, type Lane } from './layout';
import { computeTicks } from './ticks';

export const FONT = 'Helvetica, Arial, sans-serif';
export const FONT_SIZE = 11.5;
const AXIS_H = 28;
const COMPACT_TITLE_H = 16;

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface RenderOptions {
  lanes: Lane[];
  width: number;
  /** Breite der linken Spalte mit Kategorienamen; 0 = kompakte Darstellung (Titel über der Spur). */
  gutter: number;
  plotWidth: number;
  x: (t: number) => number;
  domain: [number, number];
  selectedId?: string;
  /** Eindeutiges Präfix für IDs (clipPath), damit mehrere SVGs koexistieren können. */
  idPrefix: string;
  header?: { title: string; subtitle: string };
  footer?: string;
}

type Attrs = Record<string, string | number | undefined>;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs, parent?: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined) node.setAttribute(k, String(v));
  parent?.appendChild(node);
  return node;
}

function text(content: string, attrs: Attrs, parent: Element): SVGTextElement {
  const t = el('text', { 'font-family': FONT, 'font-size': FONT_SIZE, fill: '#222', ...attrs }, parent);
  t.textContent = content;
  return t;
}

/** Zeichnet in das übergebene SVG und liefert dessen Höhe. */
export function renderTimeline(svg: SVGSVGElement, o: RenderOptions): number {
  svg.replaceChildren();
  const compact = o.gutter === 0;
  const headerH = o.header ? 58 : 0;
  const footerH = o.footer ? 30 : 0;
  // In der Normalansicht braucht die linke Spalte Platz für Name und Hinweiszeile.
  const laneHeights = o.lanes.map((l) => (compact ? laneHeight(l) + COMPACT_TITLE_H : Math.max(laneHeight(l), 42)));
  const lanesH = laneHeights.reduce((a, b) => a + b, 0);
  const top = headerH + AXIS_H;
  const height = top + lanesH + footerH + 1;

  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('width', String(o.width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${o.width} ${height}`);

  el('rect', { x: 0, y: 0, width: o.width, height, fill: '#ffffff' }, svg);

  if (o.header) {
    text(o.header.title, { x: 12, y: 26, 'font-size': 18, 'font-weight': 'bold' }, svg);
    text(o.header.subtitle, { x: 12, y: 46, 'font-size': 11, fill: '#555' }, svg);
  }

  const defs = el('defs', {}, svg);
  const clipId = `${o.idPrefix}-clip`;
  const clip = el('clipPath', { id: clipId }, defs);
  el('rect', { x: 0, y: 0, width: o.plotWidth, height: lanesH + AXIS_H }, clip);

  // Spurhintergründe über die volle Breite
  let y = top;
  o.lanes.forEach((_lane, i) => {
    el('rect', { x: 0, y, width: o.width, height: laneHeights[i], fill: i % 2 ? '#ffffff' : '#f6f6f4' }, svg);
    y += laneHeights[i];
  });

  const plot = el('g', { transform: `translate(${o.gutter},${headerH})` }, svg);
  const clipped = el('g', { 'clip-path': `url(#${clipId})` }, plot);

  // Achse und Gitterlinien
  const ticks = computeTicks(o.domain, o.plotWidth);
  for (const tick of ticks) {
    const tx = o.x(tick.t);
    el('line', { x1: tx, x2: tx, y1: AXIS_H - 6, y2: AXIS_H + lanesH, stroke: '#dddddd', 'stroke-width': 1 }, clipped);
    text(tick.label, { x: tx + 3, y: AXIS_H - 10, 'font-size': 11, fill: '#555' }, clipped);
  }
  el('line', { x1: 0, x2: o.plotWidth, y1: AXIS_H, y2: AXIS_H, stroke: '#999999', 'stroke-width': 1 }, plot);

  // Einträge
  y = AXIS_H;
  o.lanes.forEach((lane, i) => {
    const color = lane.category.color;
    const laneTop = y + (compact ? COMPACT_TITLE_H : 0);
    if (compact) {
      el('rect', { x: 4, y: y + 5, width: 8, height: 8, rx: 2, fill: color }, plot);
      text(lane.category.name + hiddenHint(lane), { x: 16, y: y + 12.5, 'font-size': 10.5, 'font-weight': 'bold', fill: '#333' }, plot);
    }
    for (const p of lane.placed) {
      const it = p.item;
      const rowY = laneTop + LANE_PAD + p.row * ROW_H;
      const midY = rowY + ROW_H / 2;
      const selected = it.id === o.selectedId;
      const g = el('g', { 'data-id': it.id, cursor: 'pointer' }, clipped);
      if (it.isPoint) {
        const r = it.importance <= 2 ? 6 : 5;
        el('path', {
          d: `M${p.x0} ${midY - r} L${p.x0 + r} ${midY} L${p.x0} ${midY + r} L${p.x0 - r} ${midY} Z`,
          fill: color,
          stroke: selected ? '#000000' : '#ffffff',
          'stroke-width': selected ? 2 : 1,
        }, g);
      } else {
        const barY = midY - BAR_H / 2;
        // Ungefähre Anfangs-/Enddaten: Balken läuft in Stufen aus (funktioniert auch im PDF).
        if (it.startDate.approx) fadeTail(g, p.x0, barY, color, -1);
        if (it.endDate?.approx) fadeTail(g, p.x1, barY, color, 1);
        el('rect', {
          x: p.x0,
          y: barY,
          width: Math.max(p.x1 - p.x0, 3),
          height: BAR_H,
          rx: 3,
          fill: color,
          stroke: selected ? '#000000' : 'none',
          'stroke-width': selected ? 2 : 0,
        }, g);
      }
      if (p.label) {
        text(p.label, {
          x: p.labelX,
          y: midY + 4,
          fill: p.labelInside ? '#ffffff' : '#222222',
          'font-weight': p.bold ? 'bold' : 'normal',
          'text-anchor': p.labelAnchor,
        }, g);
      }
    }
    y += laneHeights[i];
  });

  // Kategorienamen in der linken Spalte (über allem, damit nichts hineinragt)
  if (!compact) {
    el('rect', { x: 0, y: top, width: o.gutter - 1, height: lanesH, fill: '#ffffff', 'fill-opacity': 0.94 }, svg);
    y = top;
    o.lanes.forEach((lane, i) => {
      el('rect', { x: 10, y: y + LANE_PAD + 4, width: 10, height: 10, rx: 2, fill: lane.category.color }, svg);
      text(lane.category.name, { x: 26, y: y + LANE_PAD + 13, 'font-size': 12, 'font-weight': 'bold', fill: '#222' }, svg);
      const hint = hiddenHint(lane).trim();
      if (hint) text(hint, { x: 26, y: y + LANE_PAD + 28, 'font-size': 10, fill: '#888' }, svg);
      y += laneHeights[i];
    });
    el('line', { x1: o.gutter - 0.5, x2: o.gutter - 0.5, y1: headerH, y2: top + lanesH, stroke: '#cccccc' }, svg);
  }
  el('line', { x1: 0, x2: o.width, y1: top + lanesH + 0.5, y2: top + lanesH + 0.5, stroke: '#cccccc' }, svg);

  if (o.footer) text(o.footer, { x: 12, y: top + lanesH + 20, 'font-size': 9.5, fill: '#777' }, svg);

  return height;
}

const FADE_STEPS = [0.55, 0.32, 0.14];
const FADE_W = 5;

function fadeTail(parent: Element, edge: number, y: number, color: string, dir: -1 | 1): void {
  FADE_STEPS.forEach((opacity, i) => {
    const x = dir === 1 ? edge + i * FADE_W : edge - (i + 1) * FADE_W;
    el('rect', { x, y: y + 2, width: FADE_W, height: BAR_H - 4, fill: color, 'fill-opacity': opacity }, parent);
  });
}

function hiddenHint(lane: Lane): string {
  return lane.hidden > 0 ? `  +${lane.hidden} weitere beim Zoomen` : '';
}
