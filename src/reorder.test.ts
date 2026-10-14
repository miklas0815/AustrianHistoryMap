import { describe, expect, it } from 'vitest';
import { applyOrder, moveId } from './reorder';

const items = ['a', 'b', 'c', 'd'].map((id) => ({ id }));

describe('applyOrder', () => {
  it('lässt die Reihenfolge ohne Vorgabe unverändert', () => {
    expect(applyOrder(items, null).map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('sortiert nach Vorgabe und hängt neue Kategorien hinten an', () => {
    expect(applyOrder(items, ['c', 'a']).map((x) => x.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('ignoriert unbekannte IDs', () => {
    expect(applyOrder(items, ['x', 'd']).map((x) => x.id)).toEqual(['d', 'a', 'b', 'c']);
  });
});

describe('moveId', () => {
  it('verschiebt nach vorne und hinten', () => {
    expect(moveId(['a', 'b', 'c', 'd'], 'c', 0)).toEqual(['c', 'a', 'b', 'd']);
    expect(moveId(['a', 'b', 'c', 'd'], 'a', 3)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('begrenzt die Zielposition', () => {
    expect(moveId(['a', 'b'], 'a', 99)).toEqual(['b', 'a']);
    expect(moveId(['a', 'b'], 'b', -5)).toEqual(['b', 'a']);
  });
});
