// Prüfregeln für einen Eintrag – dieselben wie scripts/validate-data.mjs, damit die
// Redaktionsseite Fehler schon beim Tippen meldet und der Build danach nicht scheitert.

import type { RawItem } from './data';

const DATE_RE = /^(~)?(-?\d{1,4})(?:-(\d{2})(?:-(\d{2}))?)?$/;
export const DATE_HINT = 'z. B. 1529, 1529-09, 1529-09-27 oder ~1460 (ungefähr)';
export const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

/** Sortierbarer Schlüssel eines Datums oder null, wenn das Format nicht stimmt. */
export function dateKey(text: string): number | null {
  const m = DATE_RE.exec(text);
  if (!m) return null;
  const month = m[3] ? Number(m[3]) : 1;
  const day = m[4] ? Number(m[4]) : 1;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return Number(m[2]) * 10000 + month * 100 + day;
}

/** Fehler je Feld (Feldname → Meldung). `idTaken` meldet, ob die id schon anderweitig vergeben ist. */
export function validateItem(it: RawItem, idTaken: (id: string) => boolean): Record<string, string> {
  const e: Record<string, string> = {};
  if (!it.id) e.id = 'Pflichtfeld';
  else if (!ID_RE.test(it.id)) e.id = 'nur Kleinbuchstaben, Ziffern und Bindestriche';
  else if (idTaken(it.id)) e.id = 'diese id ist schon vergeben';
  if (!it.title?.trim()) e.title = 'Pflichtfeld';
  if (!Number.isInteger(it.importance) || it.importance < 1 || it.importance > 5) e.importance = 'ganze Zahl 1–5';

  const start = it.start ? dateKey(it.start) : null;
  if (!it.start) e.start = 'Pflichtfeld';
  else if (start === null) e.start = `ungültiges Datum – ${DATE_HINT}`;
  if (it.end) {
    const end = dateKey(it.end);
    if (end === null) e.end = `ungültiges Datum – ${DATE_HINT}`;
    else if (start !== null && end < start) e.end = 'liegt vor dem Beginn';
  }
  if (it.life) {
    const ls = it.life.start ? dateKey(it.life.start) : null;
    if (!it.life.start) e.lifeStart = 'Geburt fehlt (oder Lebenszeit ganz leer lassen)';
    else if (ls === null) e.lifeStart = `ungültiges Datum – ${DATE_HINT}`;
    if (it.life.end) {
      const le = dateKey(it.life.end);
      if (le === null) e.lifeEnd = `ungültiges Datum – ${DATE_HINT}`;
      else if (ls !== null && le < ls) e.lifeEnd = 'liegt vor der Geburt';
    }
  }
  if (it.place) {
    if (!it.place.name?.trim()) e.place = 'Ortsname fehlt (oder Ort ganz leer lassen)';
    for (const k of ['lat', 'lon'] as const) {
      const v = it.place[k];
      if (v !== undefined && !Number.isFinite(v)) e.place = 'Koordinaten müssen Zahlen sein (z. B. 48.2082)';
    }
  }
  return e;
}

/** Vorschlag für eine id aus dem Titel: „Johann Strauss (Sohn)“ → „johann-strauss-sohn“. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
