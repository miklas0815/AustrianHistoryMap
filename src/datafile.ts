// Einheitliches Dateiformat für public/data/*.json: ein Eintrag pro Zeile, Felder in fester
// Reihenfolge. So zeigt die Versionsgeschichte bei jeder Änderung genau die betroffenen Einträge.

import type { CategoryFile, RawItem } from './data';

const ITEM_KEYS = ['id', 'title', 'short', 'start', 'end', 'importance', 'life', 'description', 'place', 'attributes', 'tags', 'sources'];

/** Felder in fester Reihenfolge; leere Angaben entfallen, unbekannte Felder bleiben am Ende erhalten. */
export function normalizeItem(item: RawItem): RawItem {
  const src = item as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const keys = [...ITEM_KEYS, ...Object.keys(src).filter((k) => !ITEM_KEYS.includes(k))];
  for (const k of keys) {
    const v = src[k];
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) continue;
    out[k] = v;
  }
  return out as unknown as RawItem;
}

export function formatCategoryFile(file: CategoryFile): string {
  const head: string[] = [`  "category": ${JSON.stringify(file.category)}`];
  if (file.note) head.push(`  "note": ${JSON.stringify(file.note)}`);
  if (file.sources?.length) head.push(`  "sources": ${JSON.stringify(file.sources)}`);
  const items = file.items.map((it) => '    ' + JSON.stringify(normalizeItem(it)));
  return `{\n${head.join(',\n')},\n  "items": [\n${items.join(',\n')}\n  ]\n}\n`;
}
