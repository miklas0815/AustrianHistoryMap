// Markierung auf der Zeitachse: eine Linie (Zeitpunkt) oder ein Zeitabschnitt,
// der über alle Kategorien hinweg hervorgehoben wird.

import { MONTHS_SHORT, formatYear } from './dates';

/** [Beginn, Ende] in Dezimaljahren; Beginn = Ende bedeutet eine Linie. */
export type Mark = [number, number];

export const isLine = (m: Mark) => m[0] === m[1];

/** Ab dieser Auflösung wird die Markierung monatsgenau beschriftet. */
const MONTH_PX_PER_YEAR = 40;

/**
 * `side` +1 für den Beginn, −1 für das Ende eines Abschnitts. Kleine Toleranz (max. ~4 Tage):
 * Ein Beginn genau auf „1914“ soll nicht als 1913 gelten, und ein Ende genau am Jahreswechsel
 * 1520.0 (Zeitraum bis einschließlich 1519) nicht als 1520.
 */
function formatTime(t: number, pxPerYear: number, side: 1 | -1): string {
  t += side * Math.min(0.5 / pxPerYear, 0.01);
  const year = Math.floor(t);
  if (pxPerYear < MONTH_PX_PER_YEAR) return formatYear(year);
  const month = Math.min(11, Math.floor((t - year) * 12));
  return `${MONTHS_SHORT[month]} ${formatYear(year)}`;
}

export function formatMark(m: Mark, pxPerYear: number): string {
  if (isLine(m)) return formatTime(m[0], pxPerYear, 1);
  const a = formatTime(m[0], pxPerYear, 1);
  const b = formatTime(m[1], pxPerYear, -1);
  return a === b ? a : `${a} – ${b}`;
}

/**
 * Liegt ein Eintrag (Zeitraum [t0, t1)) ganz oder teilweise in der Markierung? Was genau an
 * der Grenze endet oder beginnt (z. B. die vorige Epoche), zählt nicht dazu.
 */
export function overlapsMark(it: { t0: number; t1: number }, m: Mark): boolean {
  if (isLine(m)) return it.t0 <= m[0] && it.t1 > m[0];
  return it.t0 < m[1] && it.t1 > m[0];
}

export function parseMark(text: string | null): Mark | undefined {
  if (!text) return undefined;
  const [a, b = a] = text.split(',').map(Number);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  return a <= b ? [a, b] : [b, a];
}

export function serializeMark(m: Mark): string {
  const r = (v: number) => String(Math.round(v * 100) / 100);
  return isLine(m) ? r(m[0]) : `${r(m[0])},${r(m[1])}`;
}
