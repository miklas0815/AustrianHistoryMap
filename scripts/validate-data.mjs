// Prüft die Datendateien unter public/data, bevor gebaut oder hochgeladen wird.
// Aufruf: npm run validate
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIR = new URL('../public/data/', import.meta.url).pathname;
const DATE_RE = /^(~)?(-?\d{1,4})(?:-(\d{2})(?:-(\d{2}))?)?$/;
const KNOWN_FIELDS = new Set(['id', 'title', 'short', 'start', 'end', 'importance', 'description', 'place', 'attributes', 'tags', 'sources']);

const errors = [];
const warnings = [];
const fail = (where, msg) => errors.push(`${where}: ${msg}`);

function readJson(file) {
  try {
    return JSON.parse(readFileSync(join(DIR, file), 'utf8'));
  } catch (err) {
    fail(file, `kein gültiges JSON (${err.message})`);
    return null;
  }
}

// Sortierbarer Schlüssel; nur für den Vergleich Beginn ≤ Ende.
function dateKey(text) {
  const m = DATE_RE.exec(text);
  if (!m) return null;
  const month = m[3] ? Number(m[3]) : 1;
  const day = m[4] ? Number(m[4]) : 1;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return Number(m[2]) * 10000 + month * 100 + day;
}

const index = readJson('categories.json');
const ids = new Map();
let count = 0;

for (const cat of index?.categories ?? []) {
  for (const key of ['id', 'name', 'color', 'file']) if (!cat[key]) fail('categories.json', `Kategorie ohne "${key}"`);
  if (cat.color && !/^#[0-9a-fA-F]{6}$/.test(cat.color)) fail('categories.json', `${cat.id}: Farbe "${cat.color}" ist kein #RRGGBB-Wert`);
  if (!cat.file || !existsSync(join(DIR, cat.file))) {
    fail('categories.json', `${cat.id}: Datei "${cat.file}" fehlt`);
    continue;
  }
  const data = readJson(cat.file);
  if (!data) continue;
  if (data.category !== cat.id) fail(cat.file, `"category" ist "${data.category}", erwartet "${cat.id}"`);
  if (!Array.isArray(data.items)) {
    fail(cat.file, '"items" fehlt oder ist keine Liste');
    continue;
  }
  data.items.forEach((it, i) => {
    const where = `${cat.file} [${i}] ${it.id ?? ''}`.trim();
    count++;
    if (!it.id || typeof it.id !== 'string') fail(where, 'fehlende "id"');
    else if (ids.has(it.id)) fail(where, `doppelte id (auch in ${ids.get(it.id)})`);
    else ids.set(it.id, cat.file);
    if (!it.title) fail(where, 'fehlender "title"');
    if (!Number.isInteger(it.importance) || it.importance < 1 || it.importance > 5) fail(where, '"importance" muss eine ganze Zahl 1–5 sein');
    const start = typeof it.start === 'string' ? dateKey(it.start) : null;
    if (start === null) fail(where, `ungültiges "start": ${JSON.stringify(it.start)} (erwartet z. B. "1529", "1529-09", "1529-09-27", "~1460")`);
    if (it.end !== undefined) {
      const end = typeof it.end === 'string' ? dateKey(it.end) : null;
      if (end === null) fail(where, `ungültiges "end": ${JSON.stringify(it.end)}`);
      else if (start !== null && end < start) fail(where, 'Ende liegt vor dem Beginn');
    }
    if (it.place && (typeof it.place.name !== 'string' || (it.place.lat !== undefined && typeof it.place.lat !== 'number'))) fail(where, 'ungültiger "place"');
    for (const key of Object.keys(it)) if (!KNOWN_FIELDS.has(key)) warnings.push(`${where}: unbekanntes Feld "${key}"`);
  });
}

for (const w of warnings) console.warn('Warnung:', w);
if (errors.length) {
  for (const e of errors) console.error('Fehler:', e);
  console.error(`\n${errors.length} Fehler in den Daten.`);
  process.exit(1);
}
console.log(`Daten in Ordnung: ${index.categories.length} Kategorien, ${count} Einträge.`);
