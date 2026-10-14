// Der Zustand der Ansicht steht in der URL, damit jeder Ausschnitt als Link
// geteilt und später exakt wiederhergestellt werden kann.

export interface ViewState {
  from: number;
  to: number;
  /** Ausgewählte Kategorien; null = alle. */
  cats: string[] | null;
  /** Detailgrad −2 … +2. */
  detail: number;
  sel?: string;
}

export const DEFAULT_VIEW: ViewState = { from: 1500, to: 1715, cats: null, detail: 0 };

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
    sel: p.get('sel') ?? undefined,
  };
}

export function serializeViewState(s: ViewState): string {
  const p = new URLSearchParams();
  const round = (v: number) => String(Math.round(v * 100) / 100);
  p.set('from', round(s.from));
  p.set('to', round(s.to));
  if (s.cats) p.set('cats', s.cats.join(','));
  if (s.detail) p.set('detail', String(s.detail));
  if (s.sel) p.set('sel', s.sel);
  return '?' + p.toString().replace(/%2C/g, ',');
}
