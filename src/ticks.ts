import { formatMonthTick, formatYear, ymdToDecimal } from './dates';

export interface Tick {
  t: number;
  label: string;
}

const YEAR_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
const MONTH_STEPS = [1, 2, 3, 6];

/** Achsenteilung mit etwa einer Beschriftung pro minSpacing Pixel. */
export function computeTicks(domain: [number, number], plotWidth: number, minSpacing = 70): Tick[] {
  const [d0, d1] = domain;
  const span = d1 - d0;
  const maxTicks = Math.max(2, Math.floor(plotWidth / minSpacing));

  if (span <= maxTicks) {
    const monthStep = MONTH_STEPS.find((m) => (span * 12) / m <= maxTicks);
    if (monthStep !== undefined) {
      const ticks: Tick[] = [];
      for (let y = Math.floor(d0); y <= Math.ceil(d1); y++) {
        for (let m = 0; m < 12; m += monthStep) {
          const t = ymdToDecimal(y, m + 1, 1);
          if (t >= d0 && t <= d1) ticks.push({ t, label: formatMonthTick(y, m) });
        }
      }
      return ticks;
    }
  }

  const step = YEAR_STEPS.find((s) => span / s <= maxTicks) ?? YEAR_STEPS[YEAR_STEPS.length - 1];
  const ticks: Tick[] = [];
  for (let y = Math.ceil(d0 / step) * step; y <= d1; y += step) ticks.push({ t: y, label: formatYear(y) });
  return ticks;
}
