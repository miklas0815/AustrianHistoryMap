// Markierung auf der Zeitachse: eine Linie (Zeitpunkt) oder ein Zeitabschnitt,
// der über alle Kategorien hinweg hervorgehoben wird.

import { MONTHS_SHORT, formatYear } from './dates';

/** [Beginn, Ende] in Dezimaljahren; Beginn = Ende bedeutet eine Linie. */
export type Mark = [number, number];

export const isLine = (m: Mark) => m[0] === m[1];

/** Ab dieser Auflösung wird die Markierung monatsgenau beschriftet. */
const MONTH_PX_PER_YEAR = 40;

function formatTime(t: number, pxPerYear: number): string {
  // Kleine Toleranz (max. ~4 Tage): ein Klick genau auf „1914“ soll nicht als 1913 gelten.
  t += Math.min(0.5 / pxPerYear, 0.01);
  const year = Math.floor(t);
  if (pxPerYear < MONTH_PX_PER_YEAR) return formatYear(year);
  const month = Math.min(11, Math.floor((t - year) * 12));
  return `${MONTHS_SHORT[month]} ${formatYear(year)}`;
}

export function formatMark(m: Mark, pxPerYear: number): string {
  const a = formatTime(m[0], pxPerYear);
  const b = formatTime(m[1], pxPerYear);
  return a === b ? a : `${a} – ${b}`;
}

/** Liegt ein Eintrag (Zeitpunkt oder Zeitraum [t0, t1)) ganz oder teilweise in der Markierung? */
export function overlapsMark(it: { t0: number; t1: number }, m: Mark): boolean {
  return it.t0 <= m[1] && it.t1 >= m[0];
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
