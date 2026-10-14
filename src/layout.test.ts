import { describe, expect, it } from 'vitest';
import { toItem, type Category } from './data';
import { layoutColumns, layoutLanes, visibleImportance } from './layout';

const cat: Category = { id: 'c', name: 'Test', color: '#000000', file: 'c.json' };
const measure = (text: string) => text.length * 6;
const x = (t: number) => (t - 1500) * 10; // 10 px pro Jahr

describe('visibleImportance', () => {
  it('zeigt mit steigender Auflösung mehr Stufen', () => {
    expect(visibleImportance(0.5)).toBe(1);
    expect(visibleImportance(7)).toBe(3);
    expect(visibleImportance(50)).toBe(5);
  });

  it('Detailgrad verschiebt die Schwellen', () => {
    expect(visibleImportance(5, 1)).toBeGreaterThan(visibleImportance(5));
    expect(visibleImportance(5, -1)).toBeLessThan(visibleImportance(5));
  });
});

describe('layoutLanes', () => {
  const items = [
    toItem({ id: 'a', title: 'A', start: '1500', end: '1520', importance: 1 }, 'c'),
    toItem({ id: 'b', title: 'B', start: '1510', end: '1530', importance: 1 }, 'c'),
    toItem({ id: 'c', title: 'C', start: '1540', end: '1550', importance: 1 }, 'c'),
    toItem({ id: 'd', title: 'Detail', start: '1560', importance: 5 }, 'c'),
  ];
  const base = { categories: [cat], items, x, domain: [1500, 1600] as [number, number], plotWidth: 1000, measure };

  it('verteilt überlappende Einträge auf Zeilen', () => {
    const [lane] = layoutLanes({ ...base, maxImportance: 5 });
    const row = (id: string) => lane.placed.find((p) => p.item.id === id)!.row;
    expect(row('a')).toBe(0);
    expect(row('b')).toBe(1);
    expect(row('c')).toBe(0);
    expect(lane.rows).toBe(2);
  });

  it('blendet unbedeutende Einträge aus und zählt sie', () => {
    const [lane] = layoutLanes({ ...base, maxImportance: 3 });
    expect(lane.placed.map((p) => p.item.id)).not.toContain('d');
    expect(lane.hidden).toBe(1);
  });

  it('beschriftet innerhalb des Balkens, wenn Platz ist', () => {
    const [lane] = layoutLanes({ ...base, maxImportance: 5 });
    expect(lane.placed.find((p) => p.item.id === 'a')!.labelInside).toBe(true);
  });

  it('beschriftet kurze Balken der niedrigsten sichtbaren Stufe nicht', () => {
    const short = toItem({ id: 's', title: 'Ein langer Name', start: '1570', end: '1571', importance: 3 }, 'c');
    const [lane] = layoutLanes({ ...base, items: [short], maxImportance: 3 });
    expect(lane.placed[0].label).toBe('');
    const [zoomed] = layoutLanes({ ...base, items: [short], maxImportance: 4 });
    expect(zoomed.placed[0].label).toBe('Ein langer Name');
  });

  it('setzt Punktbeschriftungen am rechten Rand links vom Punkt', () => {
    const late = toItem({ id: 'l', title: 'Spätes Ereignis', start: '1598', importance: 1 }, 'c');
    const [lane] = layoutLanes({ ...base, items: [late], maxImportance: 5 });
    expect(lane.placed[0].labelAnchor).toBe('end');
  });

  it('setzt wichtigere Einträge in die oberen Zeilen', () => {
    const minor = toItem({ id: 'm', title: 'M', start: '1500', end: '1550', importance: 4 }, 'c');
    const major = toItem({ id: 'j', title: 'J', start: '1520', end: '1560', importance: 1 }, 'c');
    const [lane] = layoutLanes({ ...base, items: [minor, major], maxImportance: 5 });
    expect(lane.placed.find((p) => p.item.id === 'j')!.row).toBe(0);
    expect(lane.placed.find((p) => p.item.id === 'm')!.row).toBe(1);
  });
});

describe('layoutColumns', () => {
  const y = (t: number) => (t - 1500) * 10; // 10 px pro Jahr
  const base = { categories: [cat], y, domain: [1500, 1600] as [number, number], plotHeight: 1000, measure };

  it('setzt überlappende Zeiträume nebeneinander, ohne dass sie sich überdecken', () => {
    const a = toItem({ id: 'a', title: 'Erster', start: '1500', end: '1550', importance: 1 }, 'c');
    const b = toItem({ id: 'b', title: 'Zweiter', start: '1520', end: '1560', importance: 1 }, 'c');
    const [col] = layoutColumns({ ...base, items: [a, b], maxImportance: 5 });
    const pa = col.placed.find((p) => p.item.id === 'a')!;
    const pb = col.placed.find((p) => p.item.id === 'b')!;
    expect(pa.x).toBe(0);
    expect(pb.x).toBeGreaterThan(0);
    expect(col.width).toBeGreaterThan(pb.x);
  });

  it('nutzt die erste Spalte wieder, sobald dort Platz ist', () => {
    const a = toItem({ id: 'a', title: 'A', start: '1500', end: '1510', importance: 1 }, 'c');
    const b = toItem({ id: 'b', title: 'B', start: '1530', end: '1540', importance: 1 }, 'c');
    const [col] = layoutColumns({ ...base, items: [a, b], maxImportance: 5 });
    expect(col.placed.map((p) => p.x)).toEqual([0, 0]);
  });

  it('blendet unbedeutende Einträge aus und zählt sie', () => {
    const minor = toItem({ id: 'm', title: 'M', start: '1550', importance: 5 }, 'c');
    const [col] = layoutColumns({ ...base, items: [minor], maxImportance: 3 });
    expect(col.placed).toHaveLength(0);
    expect(col.hidden).toBe(1);
  });
});


describe('layoutColumns – aneinander anschließende Zeiträume', () => {
  it('setzt direkt aufeinanderfolgende Amtszeiten untereinander', () => {
    const y = (t: number) => (t - 1500) * 10;
    const a = toItem({ id: 'a', title: 'A', start: '1500', end: '1509', importance: 3 }, 'c');
    const b = toItem({ id: 'b', title: 'B', start: '1510', end: '1519', importance: 3 }, 'c');
    const [col] = layoutColumns({ categories: [cat], items: [a, b], y, domain: [1500, 1600], plotHeight: 1000, maxImportance: 5, measure });
    expect(col.placed.map((p) => p.x)).toEqual([0, 0]);
  });
});

describe('Lebenszeit', () => {
  const x = (t: number) => (t - 1500) * 10;
  const ruler = toItem({ id: 'r', title: 'Herrscher', start: '1540', end: '1560', importance: 1, life: { start: '1510', end: '1570' } }, 'c');
  const child = toItem({ id: 'k', title: 'Kind', start: '1520', end: '1530', importance: 2 }, 'c');

  it('wird als Hintergrundbalken mitgeführt und belegt die Zeile', () => {
    const [lane] = layoutLanes({ categories: [cat], items: [ruler, child], x, domain: [1500, 1600], plotWidth: 1000, maxImportance: 5, measure });
    const r = lane.placed.find((p) => p.item.id === 'r')!;
    expect(r.life).toEqual([100, 710]);
    // Das Kind liegt innerhalb der Lebenszeit und muss daher in eine eigene Zeile.
    expect(lane.placed.find((p) => p.item.id === 'k')!.row).toBe(1);
  });

  it('macht Einträge sichtbar, deren Lebenszeit in den Ausschnitt reicht', () => {
    const [lane] = layoutLanes({ categories: [cat], items: [ruler], x, domain: [1500, 1530], plotWidth: 1000, maxImportance: 5, measure });
    expect(lane.placed).toHaveLength(1);
  });
});

describe('Lebenszeit ohne sichtbare Regierungszeit', () => {
  it('trägt den Namen auf dem Lebenszeit-Balken', () => {
    const x = (t: number) => (t - 1500) * 10;
    const ruler = toItem({ id: 'r', title: 'Später Herrscher', start: '1620', end: '1630', importance: 1, life: { start: '1560', end: '1630' } }, 'c');
    const [lane] = layoutLanes({ categories: [cat], items: [ruler], x, domain: [1500, 1600], plotWidth: 1000, maxImportance: 5, measure });
    expect(lane.placed[0].label).toBe('Später Herrscher');
    expect(lane.placed[0].labelX).toBeGreaterThan(600);
    expect(lane.placed[0].labelX).toBeLessThan(1000);
  });
});
