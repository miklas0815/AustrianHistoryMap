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
  return { ...raw, category, startDate, endDate, t0, t1, isPoint: !raw.end };
}

export async function loadDataset(baseUrl = 'data/'): Promise<Dataset> {
  const res = await fetch(baseUrl + 'categories.json');
  if (!res.ok) throw new Error(`categories.json konnte nicht geladen werden (${res.status})`);
  const { categories } = (await res.json()) as { categories: Category[] };

  const files = await Promise.all(
    categories.map(async (cat) => {
      const r = await fetch(baseUrl + cat.file);
      if (!r.ok) throw new Error(`${cat.file} konnte nicht geladen werden (${r.status})`);
      return (await r.json()) as CategoryFile;
    }),
  );

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
