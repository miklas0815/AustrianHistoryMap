import { endDecimal, parseHistDate, startDecimal, type HistDate } from './dates';

export interface Place {
  name: string;
  lat?: number;
  lon?: number;
}

/** Ein Datensatz, wie er in den JSON-Dateien unter public/data steht. */
export interface RawItem {
  id: string;
  title: string;
  /** Kurzform für die Beschriftung, wenn der Platz knapp ist. */
  short?: string;
  start: string;
  end?: string;
  /** 1 = sehr bedeutend … 5 = Detail. */
  importance: number;
  /** Lebenszeit einer Person, wenn der Balken etwas anderes zeigt (z. B. die Regierungszeit); ohne end lebt sie noch. */
  life?: { start: string; end?: string };
  description?: string;
  place?: Place;
  attributes?: Record<string, string>;
  tags?: string[];
  sources?: string[];
}

export interface CategoryFile {
  category: string;
  note?: string;
  sources?: string[];
  items: RawItem[];
}

export interface Category {
  id: string;
  name: string;
  color: string;
  file: string;
  description?: string;
  note?: string;
  sources?: string[];
}

export interface Item extends RawItem {
  category: string;
  startDate: HistDate;
  endDate?: HistDate;
  /** Dezimaljahre; t1 ist exklusiv. Bei Zeitpunkten ist isPoint gesetzt. */
  t0: number;
  t1: number;
  isPoint: boolean;
  lifeStart?: HistDate;
  lifeEnd?: HistDate;
  /** Lebenszeit in Dezimaljahren, falls angegeben. */
  lifeT0?: number;
  lifeT1?: number;
}

/** Gesamter Zeitraum, den ein Eintrag belegt (inklusive Lebenszeit). */
export function itemSpan(it: Item): [number, number] {
  return [Math.min(it.t0, it.lifeT0 ?? it.t0), Math.max(it.t1, it.lifeT1 ?? it.t1)];
}

export interface Dataset {
  categories: Category[];
  items: Item[];
}

export function toItem(raw: RawItem, category: string): Item {
  const startDate = parseHistDate(raw.start);
  const endDate = raw.end ? parseHistDate(raw.end) : undefined;
  const t0 = startDecimal(startDate);
  const t1 = endDecimal(endDate ?? startDate);
  if (t1 < t0) throw new Error(`${raw.id}: Ende liegt vor dem Beginn`);
  // Ohne Enddatum ist ein Eintrag ein Zeitpunkt, auch wenn nur das Jahr bekannt ist.
  const item: Item = { ...raw, category, startDate, endDate, t0, t1, isPoint: !raw.end };
  if (raw.life) {
    item.lifeStart = parseHistDate(raw.life.start);
    item.lifeT0 = startDecimal(item.lifeStart);
    if (raw.life.end) {
      item.lifeEnd = parseHistDate(raw.life.end);
      item.lifeT1 = endDecimal(item.lifeEnd);
    } else {
      // Ohne Sterbedatum lebt die Person noch: Balken bis heute.
      const now = new Date();
      item.lifeT1 = Math.max(t1, now.getFullYear() + now.getMonth() / 12);
    }
    if (item.lifeT1 < item.lifeT0) throw new Error(`${raw.id}: Lebensende liegt vor der Geburt`);
  }
  return item;
}

/**
 * Lädt eine JSON-Datei. Kommt sie unvollständig an (abgebrochene Verbindung, Datei
 * gerade im Upload, kaputter Cache-Eintrag), wird sie einmal frisch vom Server geholt.
 */
export async function fetchJson<T>(url: string, fetchFn: typeof fetch = fetch): Promise<T> {
  let lastError: unknown;
  for (const cache of ['default', 'reload'] as RequestCache[]) {
    try {
      const res = await fetchFn(url, { cache });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return JSON.parse(await res.text()) as T;
    } catch (err) {
      lastError = err;
    }
  }
  const name = url.split('/').pop();
  throw new Error(`${name} konnte nicht geladen werden (${lastError instanceof Error ? lastError.message : String(lastError)})`);
}

export async function loadDataset(baseUrl = 'data/'): Promise<Dataset> {
  const { categories } = await fetchJson<{ categories: Category[] }>(baseUrl + 'categories.json');
  const files = await Promise.all(categories.map((cat) => fetchJson<CategoryFile>(baseUrl + cat.file)));
  return buildDataset(categories, files);
}

/** Speicherort der Vorschau, die die Redaktionsseite für die Zeitleiste ablegt. */
export const PREVIEW_KEY = 'zeitleiste.vorschau';

export interface PreviewData {
  categories: Category[];
  files: CategoryFile[];
}

/** Daten aus der Redaktionsvorschau (ungespeicherte Änderungen) oder null. */
export function loadPreview(): Dataset | null {
  try {
    const raw = localStorage.getItem(PREVIEW_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PreviewData;
    return buildDataset(p.categories.map((c) => ({ ...c })), p.files);
  } catch {
    return null;
  }
}

/** files[i] gehört zu categories[i]. */
export function buildDataset(categories: Category[], files: CategoryFile[]): Dataset {
  const items: Item[] = [];
  files.forEach((file, i) => {
    const cat = categories[i];
    cat.note = file.note;
    cat.sources = file.sources;
    for (const raw of file.items) {
      try {
        items.push(toItem(raw, cat.id));
      } catch (err) {
        console.warn(`Datensatz übersprungen (${cat.file}):`, err);
      }
    }
  });
  return { categories, items };
}
