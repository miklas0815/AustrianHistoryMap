// Historische Datumsangaben als Text: "1529", "1529-09", "1529-09-27",
// mit vorangestelltem "~" für ungefähre Angaben ("~1460") und "-" für
// Jahre vor Christus ("-44"). Kalender: so wie in der Quelle angegeben.
// Intern wird mit Dezimaljahren gerechnet (1529.74 ≈ 27. September 1529),
// weil JavaScript-Date mit frühen und negativen Jahren unzuverlässig ist.

export type Precision = 'year' | 'month' | 'day';

export interface HistDate {
  year: number;
  month?: number; // 1–12
  day?: number; // 1–31
  precision: Precision;
  approx: boolean;
}

const DATE_RE = /^(~)?(-?\d{1,4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

export function parseHistDate(text: string): HistDate {
  const m = DATE_RE.exec(text.trim());
  if (!m) throw new Error(`Ungültiges Datum: "${text}"`);
  const year = Number(m[2]);
  const month = m[3] ? Number(m[3]) : undefined;
  const day = m[4] ? Number(m[4]) : undefined;
  if (month !== undefined && (month < 1 || month > 12)) throw new Error(`Ungültiger Monat: "${text}"`);
  if (day !== undefined && (day < 1 || day > daysInMonth(year, month!))) throw new Error(`Ungültiger Tag: "${text}"`);
  return {
    year,
    month,
    day,
    precision: day !== undefined ? 'day' : month !== undefined ? 'month' : 'year',
    approx: m[1] === '~',
  };
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

/** Dezimaljahr für den Beginn eines Tages. */
export function ymdToDecimal(year: number, month = 1, day = 1): number {
  let doy = day - 1;
  for (let m = 1; m < month; m++) doy += daysInMonth(year, m);
  return year + doy / daysInYear(year);
}

/** Beginn des durch das Datum bezeichneten Zeitraums. */
export function startDecimal(d: HistDate): number {
  return ymdToDecimal(d.year, d.month ?? 1, d.day ?? 1);
}

/** Ende (exklusiv) des durch das Datum bezeichneten Zeitraums: "1529" endet mit Ende 1529. */
export function endDecimal(d: HistDate): number {
  if (d.precision === 'year') return d.year + 1;
  if (d.precision === 'month') {
    return d.month === 12 ? d.year + 1 : ymdToDecimal(d.year, d.month! + 1, 1);
  }
  return startDecimal(d) + 1 / daysInYear(d.year);
}

const MONTHS = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTHS_SHORT = ['Jän.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];

export function formatYear(year: number): string {
  return year < 0 ? `${-year} v. Chr.` : String(year);
}

export function formatHistDate(d: HistDate): string {
  const prefix = d.approx ? 'um ' : '';
  if (d.precision === 'day') return `${prefix}${d.day}. ${MONTHS[d.month! - 1]} ${formatYear(d.year)}`;
  if (d.precision === 'month') return `${prefix}${MONTHS[d.month! - 1]} ${formatYear(d.year)}`;
  return prefix + formatYear(d.year);
}

export function formatRange(start: HistDate, end?: HistDate): string {
  if (!end) return formatHistDate(start);
  if (start.precision === 'year' && end.precision === 'year' && start.year === end.year && !start.approx && !end.approx) {
    return formatYear(start.year);
  }
  return `${formatHistDate(start)} – ${formatHistDate(end)}`;
}

/** Achsenbeschriftung für ein Dezimaljahr bei Monats-Schrittweite. */
export function formatMonthTick(year: number, monthIndex: number): string {
  return monthIndex === 0 ? formatYear(year) : MONTHS_SHORT[monthIndex];
}
