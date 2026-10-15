// Der Zustand der Ansicht steht in der URL, damit jeder Ausschnitt als Link
// geteilt und später exakt wiederhergestellt werden kann.

import { parseMark, serializeMark, type Mark } from './mark';

export interface ViewState {
  from: number;
  to: number;
  /** Ausgewählte Kategorien; null = alle. */
  cats: string[] | null;
  /** Detailgrad −2 … +2. */
  detail: number;
  /** Ausrichtung: h = Zeit waagrecht (Standard), v = Zeit von oben nach unten. */
  orient: 'h' | 'v';
  /** Benutzerdefinierte Reihenfolge der Kategorien; null = Standard. */
  order: string[] | null;
  /** Markierte Linie oder markierter Zeitabschnitt. */
  mark?: Mark;
  sel?: string;
  /** Vorschau ungespeicherter Änderungen aus der Redaktionsseite. */
  preview?: boolean;
}

export const DEFAULT_VIEW: ViewState = { from: 768, to: 2020, cats: null, detail: 0, orient: 'h', order: null };

export function parseViewState(search: string): ViewState {
  const p = new URLSearchParams(search);
  const num = (key: string, fallback: number) => {
    const v = Number(p.get(key));
    return p.has(key) && Number.isFinite(v) ? v : fallback;
  };
  let from = num('from', DEFAULT_VIEW.from);
  let to = num('to', DEFAULT_VIEW.to);
  if (!(to > from)) ({ from, to } = DEFAULT_VIEW);
  const cats = p.get('cats');
  return {
    from,
    to,
    cats: cats === null ? null : cats.split(',').filter(Boolean),
    detail: Math.max(-2, Math.min(2, Math.round(num('detail', 0)))),
    orient: p.get('orient') === 'v' ? 'v' : 'h',
    order: p.get('order')?.split(',').filter(Boolean) ?? null,
    mark: parseMark(p.get('mark')),
    sel: p.get('sel') ?? undefined,
    preview: p.has('vorschau') || undefined,
  };
}

export function serializeViewState(s: ViewState): string {
  const p = new URLSearchParams();
  const round = (v: number) => String(Math.round(v * 100) / 100);
  p.set('from', round(s.from));
  p.set('to', round(s.to));
  if (s.cats) p.set('cats', s.cats.join(','));
  if (s.detail) p.set('detail', String(s.detail));
  if (s.orient === 'v') p.set('orient', 'v');
  if (s.order) p.set('order', s.order.join(','));
  if (s.mark) p.set('mark', serializeMark(s.mark));
  if (s.sel) p.set('sel', s.sel);
  if (s.preview) p.set('vorschau', '1');
  return '?' + p.toString().replace(/%2C/g, ',');
}
