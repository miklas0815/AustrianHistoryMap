import { describe, expect, it } from 'vitest';
import type { Category, CategoryFile } from '../data';
import { formatCategoryFile } from '../datafile';
import { applyDraft, changedFileTexts, entriesFromFiles, status, toDraft } from './model';

const cats: Category[] = [
  { id: 'a', name: 'A', color: '#000000', file: 'a.json' },
  { id: 'b', name: 'B', color: '#ffffff', file: 'b.json' },
];
const files = () => new Map<string, CategoryFile>([
  ['a.json', { category: 'a', note: 'Hinweis', items: [{ id: 'x', title: 'X', start: '1500', importance: 1 }, { id: 'y', title: 'Y', start: '1600', importance: 2 }] }],
  ['b.json', { category: 'b', items: [{ id: 'z', title: 'Z', start: '1700', importance: 3 }] }],
]);

describe('Redaktionsmodell', () => {
  it('erkennt Änderungen und schreibt nur betroffene Dateien', () => {
    const f = files();
    const entries = entriesFromFiles(cats, f);
    expect(entries.map(status)).toEqual(['', '', '']);
    entries[0].item.title = 'X neu';
    expect(status(entries[0])).toBe('geändert');
    const out = changedFileTexts(cats, f, entries);
    expect(out.map((o) => o.file)).toEqual(['a.json']);
    const written = JSON.parse(out[0].text) as CategoryFile;
    expect(written.note).toBe('Hinweis');
    expect(written.items.map((i) => i.title)).toEqual(['X neu', 'Y']);
  });

  it('verschiebt Einträge zwischen Kategorien und löscht', () => {
    const f = files();
    const entries = entriesFromFiles(cats, f);
    entries[1].cat = 'b';
    entries[2].deleted = true;
    const out = new Map(changedFileTexts(cats, f, entries).map((o) => [o.file, JSON.parse(o.text) as CategoryFile]));
    expect(out.get('a.json')!.items.map((i) => i.id)).toEqual(['x']);
    expect(out.get('b.json')!.items.map((i) => i.id)).toEqual(['y']);
  });

  it('stellt einen Entwurf wieder her', () => {
    const before = entriesFromFiles(cats, files());
    before[0].item = { ...before[0].item, importance: 4 };
    before.push({ key: 'n', cat: 'b', item: { id: 'neu', title: 'Neu', start: '1800', importance: 3 }, deleted: false });
    const draft = JSON.parse(JSON.stringify(toDraft(before)));
    const after = entriesFromFiles(cats, files());
    expect(applyDraft(after, draft)).toBe(0);
    expect(after.map(status)).toEqual(['geändert', '', '', 'neu']);
  });
});

describe('Datendateien', () => {
  it('liegen im einheitlichen Format vor (eine Zeile pro Eintrag)', () => {
    const texts = import.meta.glob('../../public/data/*.json', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    const names = Object.keys(texts).filter((n) => !n.endsWith('categories.json'));
    expect(names.length).toBeGreaterThan(10);
    for (const name of names) expect(formatCategoryFile(JSON.parse(texts[name])), name).toBe(texts[name]);
  });
});
