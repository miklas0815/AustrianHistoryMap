import { describe, expect, it } from 'vitest';
import { toItem, type Category } from './data';
import { layoutLanes, visibleImportance } from './layout';

const cat: Category = { id: 'c', name: 'Test', color: '#000000', file: 'c.json' };
const measure = (text: string) => text.length * 6;
const x = (t: number) => (t - 1500) * 10; // 10 px pro Jahr

describe('visibleImportance', () => {
  it('zeigt mit steigender Auflösung mehr Stufen', () => {
    expect(visibleImportance(0.5)).toBe(1);
    expect(visibleImportance(5)).toBe(3);
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
});
