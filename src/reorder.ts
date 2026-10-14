// Benutzerdefinierte Reihenfolge der Kategorien.

/** Sortiert nach `order`; nicht genannte Einträge folgen in ihrer ursprünglichen Reihenfolge. */
export function applyOrder<T extends { id: string }>(items: T[], order: string[] | null): T[] {
  if (!order) return items;
  const rank = new Map(order.map((id, i) => [id, i]));
  return items
    .map((item, i) => ({ item, key: rank.get(item.id) ?? order.length + i }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.item);
}

/** Verschiebt `id` an die Position `toIndex` (bezogen auf die Liste ohne `id`). */
export function moveId(ids: string[], id: string, toIndex: number): string[] {
  const rest = ids.filter((x) => x !== id);
  const i = Math.max(0, Math.min(rest.length, toIndex));
  return [...rest.slice(0, i), id, ...rest.slice(i)];
}
