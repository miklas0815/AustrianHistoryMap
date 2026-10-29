import { itemSpan, type Category, type Item } from './data';

/**
 * Ab welcher Auflösung (Pixel pro Jahr) eine Bedeutungsstufe eingeblendet wird.
 * Stufe 1 ist immer sichtbar; je weiter man hineinzoomt, desto mehr Details.
 */
const MIN_PX_PER_YEAR: Record<number, number> = { 1: 0, 2: 1.75, 3: 6, 4: 10, 5: 20 };
export const MAX_IMPORTANCE = 5;

/** Höchste sichtbare Bedeutungsstufe; detail (−2 … +2) verschiebt die Schwellen. */
export function visibleImportance(pxPerYear: number, detail = 0): number {
  const factor = Math.pow(2, -detail);
  let level = 1;
  for (let i = 2; i <= MAX_IMPORTANCE; i++) {
    if (pxPerYear >= MIN_PX_PER_YEAR[i] * factor) level = i;
  }
  return level;
}

export const ROW_H = 22;
export const BAR_H = 16;
export const LANE_PAD = 6;
const ROW_GAP = 8;
const LABEL_PAD = 5;
const POINT_R = 5;

export interface PlacedItem {
  item: Item;
  row: number;
  /** Pixelkoordinaten relativ zum Plotbereich (können außerhalb liegen). */
  x0: number;
  x1: number;
  /** Leer, wenn der Eintrag unbeschriftet bleibt (nur Tooltip). */
  label: string;
  labelX: number;
  labelAnchor: 'start' | 'end';
  labelInside: boolean;
  bold: boolean;
  /** Lebenszeit als blasser Hintergrundbalken (Pixel), falls vorhanden. */
  life?: [number, number];
}

export interface Lane {
  category: Category;
  rows: number;
  placed: PlacedItem[];
  /** Anzahl der Einträge im sichtbaren Zeitraum, die wegen der Bedeutung ausgeblendet sind. */
  hidden: number;
}

export interface LayoutInput {
  categories: Category[];
  items: Item[];
  /** Zeit → Pixel im Plotbereich. */
  x: (t: number) => number;
  domain: [number, number];
  plotWidth: number;
  maxImportance: number;
  measure: (text: string, bold: boolean) => number;
}

export function layoutLanes(input: LayoutInput): Lane[] {
  const { categories, items, x, domain, plotWidth, maxImportance, measure } = input;
  const byCat = new Map<string, Item[]>();
  for (const it of items) {
    const [s0, s1] = itemSpan(it);
    if (s1 < domain[0] || s0 > domain[1]) continue;
    const list = byCat.get(it.category) ?? [];
    list.push(it);
    byCat.set(it.category, list);
  }

  return categories.map((category) => {
    const inView = byCat.get(category.id) ?? [];
    const shown = inView
      .filter((it) => it.importance <= maxImportance)
      // Wichtigere Einträge zuerst verteilen, damit sie in den oberen Zeilen stehen.
      .sort((a, b) => a.importance - b.importance || a.t0 - b.t0);

    // Pro Zeile die belegten Pixelbereiche; ein Eintrag kommt in die erste Zeile, in der er frei ist.
    const rows: [number, number][][] = [];
    const placed: PlacedItem[] = shown.map((item) => {
      // Zeiträume der niedrigsten sichtbaren Stufe nur beschriften, wenn der Text in den
      // Balken passt – sonst würden z. B. die vielen kurzen Bürgermeister-Amtszeiten
      // die Spur sehr hoch machen. Beim Hineinzoomen erscheinen die Namen.
      // Mit Lebenszeit belegt der Eintrag die Zeile ohnehin – dann immer beschriften.
      const hasLife = item.lifeT0 !== undefined;
      const labelOutside = item.importance < maxImportance || maxImportance === MAX_IMPORTANCE || hasLife;
      const p = placeItem(item, x, plotWidth, measure, labelOutside);
      // Die Lebenszeit belegt die Zeile mit, damit kein anderer Eintrag darüber liegt.
      if (item.lifeT0 !== undefined && item.lifeT1 !== undefined) {
        const life: [number, number] = [x(item.lifeT0), x(item.lifeT1)];
        p.placed.life = life;
        // Liegt die Regierungszeit außerhalb des Ausschnitts, den Namen auf die Lebenszeit setzen.
        const reignHidden = p.placed.x1 < 0 || p.placed.x0 > plotWidth;
        if (reignHidden) {
          p.placed.label = item.short ?? item.title;
          p.placed.labelX = Math.max(life[0], 0) + LABEL_PAD;
          p.placed.labelAnchor = 'start';
          p.placed.labelInside = false;
        }
        const labelEnd = reignHidden ? p.placed.labelX + measure(p.placed.label, p.placed.bold) : -Infinity;
        p.extent = [Math.min(p.extent[0], Math.max(life[0], 0)), Math.max(p.extent[1], life[1], labelEnd)];
      }
      // Aneinandergrenzende Balken (z. B. aufeinanderfolgende Amtszeiten oder Epochen) dürfen
      // sich in einer Zeile berühren (beim Zeichnen bleibt eine 1-px-Fuge); nach einer
      // Beschriftung bleibt etwas Abstand. Halbe Pixel Rundung zählen noch als „berühren“.
      const endsWithText = p.placed.label !== '' && !p.placed.labelInside;
      const span: [number, number] = [p.extent[0] + 0.5, p.extent[1] + (endsWithText || item.isPoint ? ROW_GAP : 0)];
      let row = rows.findIndex((used) => used.every(([a, b]) => span[1] <= a || span[0] >= b));
      if (row === -1) {
        row = rows.length;
        rows.push([]);
      }
      rows[row].push(span);
      return { ...p.placed, row };
    });

    return { category, rows: Math.max(1, rows.length), placed, hidden: inView.length - shown.length };
  });
}

function placeItem(
  item: Item,
  x: (t: number) => number,
  plotWidth: number,
  measure: (text: string, bold: boolean) => number,
  labelOutside: boolean,
): { placed: Omit<PlacedItem, 'row'>; extent: [number, number] } {
  const bold = item.importance <= 2;
  const x0 = x(item.t0);
  const base = { item, x0, bold, labelInside: false };

  if (item.isPoint) {
    const label = item.title;
    const w = measure(label, bold);
    const gap = POINT_R + 4;
    // Am rechten Rand die Beschriftung links vom Punkt setzen.
    if (x0 + gap + w > plotWidth && x0 - gap - w >= 0) {
      return {
        placed: { ...base, x1: x0, label, labelX: x0 - gap, labelAnchor: 'end' },
        extent: [x0 - gap - w, x0 + POINT_R],
      };
    }
    return {
      placed: { ...base, x1: x0, label, labelX: x0 + gap, labelAnchor: 'start' },
      extent: [x0 - POINT_R, x0 + gap + w],
    };
  }

  const x1 = Math.max(x(item.t1), x0 + 3);
  // Beschriftung am sichtbaren Anfang des Balkens, damit sie beim Verschieben mitwandert.
  const visLeft = Math.max(x0, 0);
  const visRight = Math.min(x1, plotWidth);
  const room = visRight - visLeft - 2 * LABEL_PAD;

  const candidates = item.short ? [item.title, item.short] : [item.title];
  for (const label of candidates) {
    if (measure(label, bold) <= room) {
      return {
        placed: { ...base, x1, label, labelX: visLeft + LABEL_PAD, labelAnchor: 'start', labelInside: true },
        extent: [visLeft, x1],
      };
    }
  }

  if (!labelOutside) {
    return { placed: { ...base, x1, label: '', labelX: 0, labelAnchor: 'start' }, extent: [visLeft, x1] };
  }

  const label = item.short ?? item.title;
  const w = measure(label, bold);
  const gap = 4;
  if (x1 + gap + w <= plotWidth) {
    return {
      placed: { ...base, x1, label, labelX: x1 + gap, labelAnchor: 'start' },
      extent: [visLeft, x1 + gap + w],
    };
  }
  if (x0 - gap - w >= 0) {
    return {
      placed: { ...base, x1, label, labelX: x0 - gap, labelAnchor: 'end' },
      extent: [x0 - gap - w, x1],
    };
  }
  // Kein Platz daneben: Text auf den Balken legen.
  return {
    placed: { ...base, x1, label, labelX: visLeft + LABEL_PAD, labelAnchor: 'start', labelInside: true },
    extent: [visLeft, Math.max(x1, visLeft + LABEL_PAD + w)],
  };
}

export function laneHeight(lane: Lane): number {
  return lane.rows * ROW_H + 2 * LANE_PAD;
}

// ---------- Senkrechte Darstellung: Zeit von oben nach unten, Kategorien als Spalten ----------

export const COL_BAR_W = 8;
export const COL_LABEL_H = 15;
const COL_LABEL_GAP = 4;
const COL_GAP_X = 6;
const COL_GAP_Y = 2;
const COL_MAX_LABEL_W = 170;

export interface ColumnItem {
  item: Item;
  /** x relativ zum Inhaltsbereich der Spalte; y in Pixeln relativ zum Plotbereich. */
  x: number;
  y0: number;
  y1: number;
  /** Leer, wenn der Eintrag unbeschriftet bleibt (nur Tooltip). */
  label: string;
  /** Grundlinie der Beschriftung. */
  labelY: number;
  bold: boolean;
  /** Lebenszeit als blasser Hintergrundbalken (Pixel), falls vorhanden. */
  life?: [number, number];
}

export interface Column {
  category: Category;
  /** Breite des Inhalts (ohne Innenabstand). */
  width: number;
  placed: ColumnItem[];
  hidden: number;
}

export interface ColumnLayoutInput {
  categories: Category[];
  items: Item[];
  /** Zeit → Pixel im Plotbereich (senkrecht). */
  y: (t: number) => number;
  domain: [number, number];
  plotHeight: number;
  maxImportance: number;
  measure: (text: string, bold: boolean) => number;
}

interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * Verteilt die Einträge jeder Kategorie innerhalb ihrer Spalte: senkrechter Balken
 * (bzw. Raute) mit waagrechter Beschriftung rechts davon. Jeder Eintrag wird so weit
 * links wie möglich platziert, ohne Balken oder Beschriftungen anderer zu überdecken.
 */
export function layoutColumns(input: ColumnLayoutInput): Column[] {
  const { categories, items, y, domain, maxImportance, measure } = input;
  const byCat = new Map<string, Item[]>();
  for (const it of items) {
    const [s0, s1] = itemSpan(it);
    if (s1 < domain[0] || s0 > domain[1]) continue;
    const list = byCat.get(it.category) ?? [];
    list.push(it);
    byCat.set(it.category, list);
  }

  return categories.map((category) => {
    const inView = byCat.get(category.id) ?? [];
    const shown = inView
      .filter((it) => it.importance <= maxImportance)
      .sort((a, b) => a.importance - b.importance || a.t0 - b.t0);

    const used: Rect[] = [];
    let width = 0;
    const placed = shown.map((item): ColumnItem => {
      const bold = item.importance <= 2;
      const y0 = y(item.t0);
      const y1 = item.isPoint ? y0 : Math.max(y(item.t1), y0 + 3);
      const life: [number, number] | undefined =
        item.lifeT0 !== undefined && item.lifeT1 !== undefined ? [y(item.lifeT0), y(item.lifeT1)] : undefined;
      // Liegt die Regierungszeit außerhalb des Ausschnitts, steht der Name am Beginn der Lebenszeit.
      const reignHidden = !!life && (y1 < 0 || y0 > input.plotHeight);
      const visTop = item.isPoint ? y0 - COL_LABEL_H / 2 : Math.max(reignHidden ? life![0] : y0, 0);

      // Kurze Balken der niedrigsten sichtbaren Stufe bleiben unbeschriftet (wie waagrecht).
      const edgeLevel = item.importance === maxImportance && maxImportance < MAX_IMPORTANCE;
      const labelled = item.isPoint || !edgeLevel || !!life || y1 - Math.max(y0, 0) >= 2 * COL_LABEL_H;
      let label = '';
      if (labelled) {
        label = item.title;
        if (item.short && measure(label, bold) > COL_MAX_LABEL_W) label = item.short;
      }
      const labelW = label ? measure(label, bold) : 0;

      const shapes = (x: number): Rect[] => {
        const bar: Rect = item.isPoint
          ? { x0: x, x1: x + COL_BAR_W + COL_GAP_X, y0: y0 - 6, y1: y0 + 6 + COL_GAP_Y }
          : // Aufeinanderfolgende Zeiträume (z. B. Amtszeiten) dürfen direkt aneinander anschließen.
            { x0: x, x1: x + COL_BAR_W + COL_GAP_X, y0: Math.min(y0, life?.[0] ?? y0), y1: Math.max(y1, life?.[1] ?? y1) };
        if (!label) return [bar];
        const text: Rect = {
          x0: x,
          x1: x + COL_BAR_W + COL_LABEL_GAP + labelW + COL_GAP_X,
          y0: visTop,
          y1: visTop + COL_LABEL_H + COL_GAP_Y,
        };
        return [bar, text];
      };

      // Mögliche Positionen: ganz links oder direkt rechts neben einem belegten Bereich.
      const probe = shapes(0);
      const yMin = Math.min(...probe.map((r) => r.y0));
      const yMax = Math.max(...probe.map((r) => r.y1));
      const candidates = [0, ...used.filter((r) => r.y0 < yMax && yMin < r.y1).map((r) => r.x1)].sort((a, b) => a - b);
      const x = candidates.find((cx) => shapes(cx).every((s) => used.every((u) => !overlaps(s, u)))) ?? 0;

      const rects = shapes(x);
      used.push(...rects);
      width = Math.max(width, ...rects.map((r) => r.x1 - COL_GAP_X));
      const labelY = item.isPoint ? y0 + 4 : visTop + 11;
      return { item, x, y0, y1, label, labelY, bold, life };
    });

    return { category, width, placed, hidden: inView.length - shown.length };
  });
}
