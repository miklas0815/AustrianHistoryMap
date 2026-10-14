import { describe, expect, it } from 'vitest';
import { endDecimal, formatHistDate, formatRange, parseHistDate, startDecimal } from './dates';

describe('parseHistDate', () => {
  it('erkennt Genauigkeit und ungefähre Angaben', () => {
    expect(parseHistDate('1529')).toMatchObject({ year: 1529, precision: 'year', approx: false });
    expect(parseHistDate('1529-09')).toMatchObject({ month: 9, precision: 'month' });
    expect(parseHistDate('1529-09-27')).toMatchObject({ day: 27, precision: 'day' });
    expect(parseHistDate('~1460')).toMatchObject({ year: 1460, approx: true });
    expect(parseHistDate('-44')).toMatchObject({ year: -44 });
  });

  it('lehnt ungültige Angaben ab', () => {
    expect(() => parseHistDate('1529-13')).toThrow();
    expect(() => parseHistDate('1529-02-30')).toThrow();
    expect(() => parseHistDate('um 1500')).toThrow();
  });
});

describe('Dezimaljahre', () => {
  it('ein Jahr umfasst das ganze Jahr', () => {
    const d = parseHistDate('1529');
    expect(startDecimal(d)).toBe(1529);
    expect(endDecimal(d)).toBe(1530);
  });

  it('Monate und Tage liegen innerhalb des Jahres', () => {
    expect(endDecimal(parseHistDate('1529-12'))).toBe(1530);
    const sep27 = startDecimal(parseHistDate('1529-09-27'));
    expect(sep27).toBeGreaterThan(1529.73);
    expect(sep27).toBeLessThan(1529.75);
  });
});

describe('Formatierung', () => {
  it('formatiert deutsch', () => {
    expect(formatHistDate(parseHistDate('1529-09-27'))).toBe('27. September 1529');
    expect(formatHistDate(parseHistDate('~1460'))).toBe('um 1460');
    expect(formatHistDate(parseHistDate('1588-07'))).toBe('Juli 1588');
    expect(formatRange(parseHistDate('1502'), parseHistDate('1502'))).toBe('1502');
  });
});
