// Arbeitskopie aller Einträge über alle Kategorien hinweg, mit Änderungsverfolgung.

import type { Category, CategoryFile, RawItem } from '../data';
import { formatCategoryFile, normalizeItem } from '../datafile';

export interface Entry {
  /** Interner Schlüssel, bleibt auch bei geänderter id gleich. */
  key: string;
  cat: string;
  item: RawItem;
  /** Stand beim Laden; fehlt bei neuen Einträgen. */
  orig?: { cat: string; item: RawItem };
  deleted: boolean;
}

export type Status = 'neu' | 'geändert' | 'gelöscht' | '';

const same = (a: RawItem, b: RawItem) => JSON.stringify(normalizeItem(a)) === JSON.stringify(normalizeItem(b));

export function status(e: Entry): Status {
  if (!e.orig) return e.deleted ? '' : 'neu';
  if (e.deleted) return 'gelöscht';
  return e.cat !== e.orig.cat || !same(e.item, e.orig.item) ? 'geändert' : '';
}

export const isDirty = (e: Entry) => status(e) !== '';

let counter = 0;
export const newKey = () => `k${++counter}`;

export function entriesFromFiles(categories: Category[], files: Map<string, CategoryFile>): Entry[] {
  const out: Entry[] = [];
  for (const cat of categories) {
    for (const item of files.get(cat.file)?.items ?? []) {
      out.push({ key: newKey(), cat: cat.id, item: structuredClone(item), orig: { cat: cat.id, item }, deleted: false });
    }
  }
  return out;
}

/** Kategorien, deren Datei sich durch die Änderungen ändert. */
export function affectedCategories(entries: Entry[]): Set<string> {
  const cats = new Set<string>();
  for (const e of entries) {
    if (!isDirty(e)) continue;
    if (!e.deleted) cats.add(e.cat);
    if (e.orig) cats.add(e.orig.cat);
  }
  return cats;
}

/**
 * Setzt die Datei einer Kategorie aus der Arbeitskopie zusammen. Die Reihenfolge der
 * bestehenden Einträge bleibt erhalten; neue und verschobene Einträge kommen ans Ende.
 */
export function buildCategoryFile(cat: Category, base: CategoryFile | undefined, entries: Entry[]): CategoryFile {
  const items = entries.filter((e) => e.cat === cat.id && !e.deleted).map((e) => normalizeItem(e.item));
  return { category: cat.id, note: base?.note, sources: base?.sources, items };
}

export function changedFileTexts(categories: Category[], files: Map<string, CategoryFile>, entries: Entry[]): { file: string; text: string }[] {
  const cats = affectedCategories(entries);
  return categories.filter((c) => cats.has(c.id)).map((c) => ({
    file: c.file,
    text: formatCategoryFile(buildCategoryFile(c, files.get(c.file), entries)),
  }));
}

// ---------- Entwurf (ungespeicherte Änderungen im Browser sichern) ----------

export interface DraftEntry {
  origId?: string;
  origCat?: string;
  cat: string;
  item: RawItem;
  deleted: boolean;
}

export function toDraft(entries: Entry[]): DraftEntry[] {
  return entries.filter(isDirty).map((e) => ({ origId: e.orig?.item.id, origCat: e.orig?.cat, cat: e.cat, item: e.item, deleted: e.deleted }));
}

/** Überträgt einen Entwurf auf frisch geladene Einträge; liefert die Zahl nicht mehr zuordenbarer Änderungen. */
export function applyDraft(entries: Entry[], draft: DraftEntry[]): number {
  let lost = 0;
  for (const d of draft) {
    if (!d.origId) {
      entries.push({ key: newKey(), cat: d.cat, item: d.item, deleted: false });
      continue;
    }
    const e = entries.find((x) => x.orig?.item.id === d.origId && x.orig?.cat === d.origCat);
    if (!e) {
      lost++;
      continue;
    }
    e.cat = d.cat;
    e.item = d.item;
    e.deleted = d.deleted;
  }
  return lost;
}
