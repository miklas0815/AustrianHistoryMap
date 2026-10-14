import { describe, expect, it } from 'vitest';
import { formatMark, overlapsMark, parseMark, serializeMark } from './mark';

describe('Markierung', () => {
  it('beschriftet jahres- oder monatsgenau', () => {
    expect(formatMark([1683.7, 1683.7], 5)).toBe('1683');
    expect(formatMark([1914.2, 1918.9], 5)).toBe('1914 – 1918');
    expect(formatMark([1683.7, 1683.7], 100)).toBe('Sep. 1683');
    expect(formatMark([1914.01, 1914.05], 10)).toBe('1914');
    expect(formatMark([1913.998, 1918.5], 5)).toBe('1914 – 1918');
  });

  it('erkennt Überschneidungen', () => {
    expect(overlapsMark({ t0: 1910, t1: 1915 }, [1914, 1918])).toBe(true);
    expect(overlapsMark({ t0: 1919, t1: 1919.1 }, [1914, 1918])).toBe(false);
    expect(overlapsMark({ t0: 1683.7, t1: 1683.71 }, [1683.7, 1683.7])).toBe(true);
  });

  it('liest und schreibt die URL-Form', () => {
    expect(parseMark('1918,1914')).toEqual([1914, 1918]);
    expect(parseMark('1683.5')).toEqual([1683.5, 1683.5]);
    expect(parseMark('x')).toBeUndefined();
    expect(serializeMark([1683.456, 1683.456])).toBe('1683.46');
    expect(serializeMark([1914, 1918.5])).toBe('1914,1918.5');
  });
});
