// Redaktionsseite: alle Einträge aller Kategorien in einer Liste sichten, bearbeiten,
// ergänzen und als Commit in GitHub speichern (von dort automatisch veröffentlicht).

import './editor.css';
import { PREVIEW_KEY, fetchJson, type Category, type CategoryFile, type PreviewData, type RawItem } from '../data';
import { DATE_HINT, dateKey, slugify, validateItem } from '../validate';
import { DATA_DIR, GitHub, REPO } from './github';
import {
  applyDraft, buildCategoryFile, changedFileTexts, entriesFromFiles, isDirty, newKey, status, toDraft,
  type Entry,
} from './model';

const TOKEN_KEY = 'zeitleiste.redaktion.token';
const DRAFT_KEY = 'zeitleiste.redaktion.entwurf';
const IMPORTANCE_HINTS: Record<number, string> = {
  1: '1 – sehr bedeutend, immer sichtbar',
  2: '2 – bedeutend',
  3: '3 – wichtig (letzte Stufe für Österreichbezug)',
  4: '4 – Detail / internationaler Kontext',
  5: '5 – nur bei starkem Zoom',
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const rowsEl = $<HTMLTableSectionElement>('rows');
const formPanel = $<HTMLElement>('form-panel');

let gh: GitHub | null = null;
let categories: Category[] = [];
let files = new Map<string, CategoryFile>();
/** Blob-SHAs beim Laden (nur bei Zugriff über GitHub). */
let shas = new Map<string, string>();
let entries: Entry[] = [];
let selected: string | null = null;
/** Neue Einträge, deren id noch automatisch aus dem Titel folgt. */
const autoId = new Set<string>();
let sortKey = 'start';
let sortDir = 1;
let idCounts = new Map<string, number>();

// ---------- Hilfsfunktionen ----------

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & Record<string, unknown> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'dataset') Object.assign(n.dataset, v);
    else (n as unknown as Record<string, unknown>)[k] = v;
  }
  n.append(...children);
  return n;
}

let toastTimer = 0;
function toast(html: string, ms = 6000): void {
  const t = $('toast');
  t.innerHTML = html;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.hidden = true), ms);
}

const errMsg = (err: unknown) => (err instanceof Error ? err.message : String(err));
const catById = (id: string) => categories.find((c) => c.id === id);
const yearOf = (d?: string) => (d && dateKey(d) !== null ? Math.floor(dateKey(d)! / 10000) : undefined);

function storage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

// ---------- Laden ----------

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function loadFromWeb(): Promise<void> {
  const index = await fetchJson<{ categories: Category[] }>('data/categories.json');
  categories = index.categories;
  const list = await Promise.all(categories.map((c) => fetchJson<CategoryFile>('data/' + c.file)));
  files = new Map(categories.map((c, i) => [c.file, list[i]]));
  shas = new Map();
}

async function loadFromGitHub(client: GitHub): Promise<void> {
  const repoFiles = await client.readDataFiles();
  const byName = new Map(repoFiles.map((f) => [f.path.slice(DATA_DIR.length), f]));
  const index = byName.get('categories.json');
  if (!index) throw new Error('categories.json fehlt im Repository');
  categories = (JSON.parse(index.text) as { categories: Category[] }).categories;
  files = new Map();
  for (const c of categories) {
    const f = byName.get(c.file);
    if (!f) throw new Error(`${c.file} fehlt im Repository`);
    files.set(c.file, JSON.parse(f.text) as CategoryFile);
  }
  shas = new Map(repoFiles.map((f) => [f.path, f.sha]));
}

async function load(): Promise<void> {
  rowsEl.replaceChildren(el('tr', {}, el('td', { colSpan: 8, className: 'ed-loading' }, 'Daten werden geladen …')));
  const token = readToken();
  gh = null;
  if (token) {
    const client = new GitHub(token);
    try {
      await client.connect();
      gh = client;
    } catch (err) {
      toast(`Anmeldung fehlgeschlagen: ${errMsg(err)}. Die Daten werden nur zum Ansehen geladen.`, 10000);
    }
  }
  try {
    if (gh) await loadFromGitHub(gh);
    else await loadFromWeb();
  } catch (err) {
    rowsEl.replaceChildren(el('tr', {}, el('td', { colSpan: 8, className: 'ed-error' }, `Daten konnten nicht geladen werden: ${errMsg(err)}`)));
    return;
  }
  entries = entriesFromFiles(categories, files);
  restoreDraft();
  renderAccount();
  fillCategorySelect();
  refresh();
}

// ---------- Entwurf ----------

let draftTimer = 0;
function saveDraft(): void {
  clearTimeout(draftTimer);
  draftTimer = window.setTimeout(() => {
    const draft = toDraft(entries);
    try {
      if (draft.length) storage()?.setItem(DRAFT_KEY, JSON.stringify(draft));
      else storage()?.removeItem(DRAFT_KEY);
    } catch { /* Speicher voll oder gesperrt: Entwurf geht beim Schließen verloren */ }
  }, 300);
}

function restoreDraft(): void {
  let raw: string | null = null;
  try {
    raw = storage()?.getItem(DRAFT_KEY) ?? null;
  } catch { /* ignorieren */ }
  if (!raw) return;
  try {
    const draft = JSON.parse(raw);
    const lost = applyDraft(entries, draft);
    const n = entries.filter(isDirty).length;
    if (n) toast(`${n} ungespeicherte Änderung${n === 1 ? '' : 'en'} aus der letzten Sitzung wiederhergestellt.` +
      (lost ? ` ${lost} Änderung(en) ließen sich nicht mehr zuordnen (Eintrag inzwischen gelöscht oder umbenannt).` : ''), 9000);
  } catch { /* defekter Entwurf */ }
}

// ---------- Konto ----------

function renderAccount(): void {
  const box = $('account');
  if (gh) {
    const logout = el('button', { type: 'button', textContent: 'Abmelden' });
    logout.addEventListener('click', () => {
      try { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY); } catch { /* */ }
      load();
    });
    box.replaceChildren(el('span', { className: 'ed-ok' }, `✓ Angemeldet${gh.login ? ' als ' + gh.login : ''} · speichert in „${gh.branch}“`), logout);
  } else {
    const login = el('button', { type: 'button', className: 'primary', textContent: 'Anmelden zum Speichern' });
    login.addEventListener('click', openLogin);
    box.replaceChildren(el('span', { className: 'ed-muted' }, 'Nur ansehen – Änderungen bleiben im Browser, bis Sie sich anmelden.'), login);
  }
}

function openLogin(): void {
  $<HTMLParagraphElement>('login-error').hidden = true;
  $<HTMLDialogElement>('login-dialog').showModal();
  $<HTMLInputElement>('token').focus();
}

function setupLogin(): void {
  const dialog = $<HTMLDialogElement>('login-dialog');
  $('login-cancel').addEventListener('click', () => dialog.close());
  $<HTMLFormElement>('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = $<HTMLInputElement>('token').value.trim();
    const errorEl = $<HTMLParagraphElement>('login-error');
    const submit = $<HTMLButtonElement>('login-submit');
    submit.disabled = true;
    try {
      const client = new GitHub(token);
      await client.connect();
      try {
        localStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(TOKEN_KEY);
        ($<HTMLInputElement>('remember').checked ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
      } catch { /* Speicher gesperrt: Anmeldung gilt nur bis zum Neuladen */ }
      dialog.close();
      $<HTMLInputElement>('token').value = '';
      // Entwurf sichern und mit dem aktuellen Stand aus GitHub neu laden.
      clearTimeout(draftTimer);
      const draft = toDraft(entries);
      if (draft.length) storage()?.setItem(DRAFT_KEY, JSON.stringify(draft));
      await load();
      toast('Angemeldet. Änderungen werden jetzt in GitHub gespeichert.');
    } catch (err) {
      errorEl.textContent = errMsg(err);
      errorEl.hidden = false;
    } finally {
      submit.disabled = false;
    }
  });
}

// ---------- Liste ----------

function errorsOf(e: Entry): Record<string, string> {
  if (e.deleted) return {};
  return validateItem(e.item, (id) => (idCounts.get(id) ?? 0) > 1);
}

function countIds(): void {
  idCounts = new Map();
  for (const e of entries) if (!e.deleted && e.item.id) idCounts.set(e.item.id, (idCounts.get(e.item.id) ?? 0) + 1);
}

function fillCategorySelect(): void {
  const sel = $<HTMLSelectElement>('f-cat');
  const current = sel.value;
  sel.replaceChildren(el('option', { value: '', textContent: 'Alle Kategorien' }), ...categories.map((c) => el('option', { value: c.id, textContent: c.name })));
  sel.value = current;
  const imp = $('f-imp');
  if (!imp.childElementCount) {
    for (let i = 1; i <= 5; i++) {
      const cb = el('input', { type: 'checkbox', checked: true, value: String(i) });
      cb.addEventListener('change', refresh);
      imp.append(el('label', { title: IMPORTANCE_HINTS[i] }, cb, ` ${i}`));
    }
  }
}

function matches(e: Entry): boolean {
  const q = $<HTMLInputElement>('q').value.trim().toLowerCase();
  const cat = $<HTMLSelectElement>('f-cat').value;
  const st = $<HTMLSelectElement>('f-status').value;
  const imps = new Set([...document.querySelectorAll<HTMLInputElement>('#f-imp input:checked')].map((c) => Number(c.value)));
  const from = Number($<HTMLInputElement>('f-from').value || -Infinity);
  const to = Number($<HTMLInputElement>('f-to').value || Infinity);
  const it = e.item;
  if (cat && e.cat !== cat) return false;
  if (!imps.has(it.importance) && Number.isInteger(it.importance) && it.importance >= 1 && it.importance <= 5) return false;
  if (st === 'dirty' && !isDirty(e)) return false;
  if (st === 'error' && !Object.keys(errorsOf(e)).length) return false;
  const y0 = yearOf(it.start);
  const y1 = yearOf(it.end) ?? y0;
  if (y0 !== undefined && (y1! < from || y0 > to)) return false;
  if (q) {
    const hay = [it.id, it.title, it.short, it.description, it.place?.name, ...Object.values(it.attributes ?? {}), ...(it.tags ?? [])]
      .filter(Boolean).join(' ').toLowerCase();
    if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}

function sortValue(e: Entry): string | number {
  const it = e.item;
  switch (sortKey) {
    case 'cat': return categories.findIndex((c) => c.id === e.cat);
    case 'title': return it.title?.toLowerCase() ?? '';
    case 'start': return dateKey(it.start ?? '') ?? -Infinity;
    case 'end': return dateKey(it.end ?? '') ?? -Infinity;
    case 'importance': return it.importance;
    case 'life': return dateKey(it.life?.start ?? '') ?? -Infinity;
    case 'place': return it.place?.name?.toLowerCase() ?? '';
    case 'status': return status(e) || (Object.keys(errorsOf(e)).length ? 'fehler' : '~');
  }
  return 0;
}

function rowFor(e: Entry): HTMLTableRowElement {
  const it = e.item;
  const cat = catById(e.cat);
  const st = status(e);
  const errors = Object.keys(errorsOf(e)).length;
  const tr = el('tr', { dataset: { key: e.key } });
  tr.className = [st && `st-${st === 'geändert' ? 'changed' : st === 'neu' ? 'new' : 'deleted'}`, errors && 'st-error', e.key === selected && 'selected'].filter(Boolean).join(' ');
  const swatch = el('span', { className: 'swatch' });
  swatch.style.background = cat?.color ?? '#999';
  tr.append(
    el('td', { className: 'c-cat', title: cat?.name ?? e.cat }, swatch, cat?.name ?? e.cat),
    el('td', { className: 'c-title' }, it.title || '(ohne Titel)'),
    el('td', { className: 'c-date' }, it.start ?? ''),
    el('td', { className: 'c-date' }, it.end ?? ''),
    el('td', { className: 'c-imp' }, String(it.importance ?? '')),
    el('td', { className: 'c-date' }, it.life ? `${it.life.start ?? ''} – ${it.life.end ?? ''}` : ''),
    el('td', { className: 'c-place' }, it.place?.name ?? ''),
    el('td', { className: 'c-status' }, errors ? `⚠ ${errors} Fehler` : st),
  );
  return tr;
}

let refreshTimer = 0;
function scheduleRefresh(): void {
  clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(refresh, 120);
}

function refresh(): void {
  countIds();
  const shown = entries.filter(matches);
  shown.sort((a, b) => {
    const va = sortValue(a);
    const vb = sortValue(b);
    return (va < vb ? -1 : va > vb ? 1 : 0) * sortDir || (dateKey(a.item.start ?? '') ?? 0) - (dateKey(b.item.start ?? '') ?? 0);
  });
  const frag = document.createDocumentFragment();
  for (const e of shown) frag.append(rowFor(e));
  rowsEl.replaceChildren(frag);
  if (!shown.length) rowsEl.append(el('tr', {}, el('td', { colSpan: 8, className: 'ed-loading' }, 'Keine Einträge für diese Filter.')));
  const total = entries.filter((e) => !(e.deleted && !e.orig)).length;
  $('count').textContent = `${shown.length} von ${total} Einträgen`;
  for (const th of document.querySelectorAll<HTMLElement>('th[data-sort]')) {
    th.classList.toggle('sorted', th.dataset.sort === sortKey);
    th.dataset.dir = sortDir > 0 ? '▲' : '▼';
  }
  updateChanges();
}

function refreshRow(e: Entry): void {
  countIds();
  const old = rowsEl.querySelector(`tr[data-key="${e.key}"]`);
  if (old) old.replaceWith(rowFor(e));
  updateChanges();
}

function updateChanges(): void {
  const dirty = entries.filter(isDirty);
  const n = dirty.length;
  $('change-count').textContent = n ? `${n} ungespeicherte Änderung${n === 1 ? '' : 'en'}` : 'Keine Änderungen';
  $('changes').classList.toggle('has-changes', n > 0);
  $<HTMLButtonElement>('save').disabled = n === 0;
  $<HTMLButtonElement>('discard').disabled = n === 0;
}

// ---------- Formular ----------

interface FieldDef {
  name: string;
  label: string;
  kind?: 'text' | 'textarea' | 'select-cat' | 'select-imp';
  hint?: string;
  rows?: number;
  half?: boolean;
}

const FIELDS: (FieldDef | string)[] = [
  { name: 'cat', label: 'Kategorie', kind: 'select-cat' },
  { name: 'title', label: 'Titel' },
  { name: 'short', label: 'Kurzform', hint: 'optional, für die Beschriftung bei wenig Platz', half: true },
  { name: 'id', label: 'id', hint: 'eindeutig; nur Kleinbuchstaben, Ziffern, Bindestriche', half: true },
  { name: 'start', label: 'Beginn', hint: DATE_HINT, half: true },
  { name: 'end', label: 'Ende', hint: 'leer = Zeitpunkt (Raute)', half: true },
  { name: 'importance', label: 'Bedeutung', kind: 'select-imp' },
  'Lebenszeit (blasser Balken hinter der Amts-/Regierungszeit; ohne Tod = lebt noch)',
  { name: 'lifeStart', label: 'Geburt', half: true },
  { name: 'lifeEnd', label: 'Tod', half: true },
  { name: 'description', label: 'Beschreibung', kind: 'textarea', rows: 4 },
  'Ort',
  { name: 'placeName', label: 'Name' },
  { name: 'lat', label: 'Breite', hint: 'z. B. 48.2082', half: true },
  { name: 'lon', label: 'Länge', hint: 'z. B. 16.3738', half: true },
  'Weitere Angaben',
  { name: 'attributes', label: 'Zusatzangaben', kind: 'textarea', rows: 3, hint: 'eine pro Zeile: „Amt: Bundeskanzler“' },
  { name: 'tags', label: 'Schlagwörter', hint: 'durch Komma getrennt' },
  { name: 'sources', label: 'Quellen', kind: 'textarea', rows: 2, hint: 'eine Adresse pro Zeile' },
];

/** Formularfeld → Fehlerschlüssel aus validateItem. */
const ERROR_FIELD: Record<string, string> = { lifeStart: 'lifeStart', lifeEnd: 'lifeEnd', placeName: 'place', lat: 'place', lon: 'place' };

function valuesOf(e: Entry): Record<string, string> {
  const it = e.item;
  return {
    cat: e.cat,
    title: it.title ?? '',
    short: it.short ?? '',
    id: it.id ?? '',
    start: it.start ?? '',
    end: it.end ?? '',
    importance: String(it.importance ?? 3),
    lifeStart: it.life?.start ?? '',
    lifeEnd: it.life?.end ?? '',
    description: it.description ?? '',
    placeName: it.place?.name ?? '',
    lat: it.place?.lat !== undefined ? String(it.place.lat) : '',
    lon: it.place?.lon !== undefined ? String(it.place.lon) : '',
    attributes: Object.entries(it.attributes ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n'),
    tags: (it.tags ?? []).join(', '),
    sources: (it.sources ?? []).join('\n'),
  };
}

function readForm(form: HTMLFormElement, base: RawItem): { cat: string; item: RawItem } {
  const v = (n: string) => ((form.elements.namedItem(n) as HTMLInputElement | null)?.value ?? '').trim();
  const num = (n: string) => (v(n) === '' ? undefined : Number(v(n).replace(',', '.')));
  const lines = (n: string) => v(n).split('\n').map((s) => s.trim()).filter(Boolean);
  const item: RawItem = {
    ...base,
    id: v('id'),
    title: v('title'),
    short: v('short') || undefined,
    start: v('start'),
    end: v('end') || undefined,
    importance: Number(v('importance')),
    life: v('lifeStart') || v('lifeEnd') ? { start: v('lifeStart'), ...(v('lifeEnd') ? { end: v('lifeEnd') } : {}) } : undefined,
    description: v('description') || undefined,
    place: v('placeName') || v('lat') || v('lon')
      ? { name: v('placeName'), ...(num('lat') !== undefined ? { lat: num('lat') } : {}), ...(num('lon') !== undefined ? { lon: num('lon') } : {}) }
      : undefined,
    attributes: lines('attributes').length
      ? Object.fromEntries(lines('attributes').map((l) => {
          const i = l.indexOf(':');
          return i < 0 ? [l, ''] : [l.slice(0, i).trim(), l.slice(i + 1).trim()];
        }))
      : undefined,
    tags: v('tags') ? v('tags').split(',').map((s) => s.trim()).filter(Boolean) : undefined,
    sources: lines('sources').length ? lines('sources') : undefined,
  };
  return { cat: v('cat'), item };
}

function uniqueId(base: string, self: Entry): string {
  const taken = (id: string) => entries.some((e) => e !== self && !e.deleted && e.item.id === id);
  let id = base || 'eintrag';
  for (let i = 2; taken(id); i++) id = `${base}-${i}`;
  return id;
}

function select(key: string | null): void {
  selected = key;
  for (const tr of rowsEl.querySelectorAll('tr.selected')) tr.classList.remove('selected');
  if (key) rowsEl.querySelector(`tr[data-key="${key}"]`)?.classList.add('selected');
  renderForm();
}

function renderForm(): void {
  const e = entries.find((x) => x.key === selected);
  if (!e) {
    formPanel.replaceChildren(el('p', { className: 'ed-empty' }, 'Einen Eintrag in der Liste anklicken, um ihn anzusehen und zu bearbeiten.'));
    return;
  }
  const values = valuesOf(e);
  const form = el('form', { className: 'ed-entry', autocomplete: 'off' });
  form.addEventListener('submit', (ev) => ev.preventDefault());

  const st = status(e);
  const head = el('div', { className: 'ed-form-head' },
    el('h2', {}, e.item.title || 'Neuer Eintrag'),
    el('span', { className: `ed-badge ${st ? 'b-' + (st === 'geändert' ? 'changed' : st === 'neu' ? 'new' : 'deleted') : ''}` }, st || 'unverändert'));
  form.append(head);

  let grid = el('div', { className: 'ed-grid' });
  form.append(grid);
  for (const f of FIELDS) {
    if (typeof f === 'string') {
      form.append(el('h3', {}, f));
      grid = el('div', { className: 'ed-grid' });
      form.append(grid);
      continue;
    }
    let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (f.kind === 'textarea') input = el('textarea', { rows: f.rows ?? 3 });
    else if (f.kind === 'select-cat') input = el('select', {}, ...categories.map((c) => el('option', { value: c.id, textContent: c.name })));
    else if (f.kind === 'select-imp') input = el('select', {}, ...[1, 2, 3, 4, 5].map((i) => el('option', { value: String(i), textContent: IMPORTANCE_HINTS[i] })));
    else input = el('input', { type: 'text', spellcheck: f.name === 'description' || f.name === 'title' });
    input.name = f.name;
    input.value = values[f.name];
    input.disabled = e.deleted;
    const label = el('label', { className: `ed-field${f.half ? ' half' : ''}` }, f.label, input);
    if (f.hint) label.append(el('small', {}, f.hint));
    label.append(el('em', { className: 'ed-field-error', dataset: { for: ERROR_FIELD[f.name] ?? f.name } }));
    grid.append(label);
  }

  // Aktionen
  const actions = el('div', { className: 'ed-actions' });
  const btn = (text: string, title: string, fn: () => void, cls = '') => {
    const b = el('button', { type: 'button', textContent: text, title, className: cls });
    b.addEventListener('click', fn);
    actions.append(b);
    return b;
  };
  btn('In Zeitleiste zeigen', 'Vorschau mit allen ungespeicherten Änderungen in neuem Tab', () => openPreview(e));
  btn('Duplizieren', 'Kopie als neuen Eintrag anlegen', () => duplicate(e));
  if (isDirty(e)) btn(e.orig ? 'Änderungen zurücknehmen' : 'Verwerfen', 'Diesen Eintrag auf den gespeicherten Stand zurücksetzen', () => revert(e));
  if (e.orig) btn(e.deleted ? 'Wiederherstellen' : 'Löschen', '', () => toggleDelete(e), e.deleted ? '' : 'danger');
  form.append(actions);

  form.addEventListener('input', (ev) => {
    const target = ev.target as HTMLInputElement;
    if (target.name === 'id') autoId.delete(e.key);
    const { cat, item } = readForm(form, e.item);
    e.cat = cat;
    e.item = item;
    if (autoId.has(e.key) && target.name === 'title') {
      e.item.id = uniqueId(slugify(item.title), e);
      (form.elements.namedItem('id') as HTMLInputElement).value = e.item.id;
    }
    (head.firstChild as HTMLElement).textContent = e.item.title || 'Neuer Eintrag';
    const s = status(e);
    const badge = head.lastChild as HTMLElement;
    badge.textContent = s || 'unverändert';
    badge.className = `ed-badge ${s ? 'b-' + (s === 'geändert' ? 'changed' : s === 'neu' ? 'new' : 'deleted') : ''}`;
    refreshRow(e);
    showErrors(form, e);
    saveDraft();
  });

  formPanel.replaceChildren(form);
  showErrors(form, e);
}

function showErrors(form: HTMLFormElement, e: Entry): void {
  countIds();
  const errors = errorsOf(e);
  for (const em of form.querySelectorAll<HTMLElement>('.ed-field-error')) {
    const msg = errors[em.dataset.for!];
    em.textContent = msg ?? '';
    em.closest('label')!.classList.toggle('invalid', !!msg);
  }
}

function addEntry(cat: string, item: RawItem): Entry {
  const e: Entry = { key: newKey(), cat, item, deleted: false };
  entries.push(e);
  return e;
}

function newEntry(): void {
  const cat = $<HTMLSelectElement>('f-cat').value || entries.find((x) => x.key === selected)?.cat || categories[0].id;
  const e = addEntry(cat, { id: '', title: '', start: '', importance: 3 });
  autoId.add(e.key);
  $<HTMLSelectElement>('f-status').value = '';
  $<HTMLInputElement>('q').value = '';
  refresh();
  select(e.key);
  rowsEl.querySelector('tr.selected')?.scrollIntoView({ block: 'center' });
  (formPanel.querySelector('[name="title"]') as HTMLInputElement | null)?.focus();
  saveDraft();
}

function duplicate(src: Entry): void {
  const item = structuredClone(src.item);
  const e = addEntry(src.cat, item);
  item.id = uniqueId(src.item.id, e);
  refresh();
  select(e.key);
  saveDraft();
}

function revert(e: Entry): void {
  if (!e.orig) {
    entries = entries.filter((x) => x !== e);
    select(null);
  } else {
    e.cat = e.orig.cat;
    e.item = structuredClone(e.orig.item);
    e.deleted = false;
    renderForm();
  }
  refresh();
  saveDraft();
}

function toggleDelete(e: Entry): void {
  e.deleted = !e.deleted;
  refresh();
  renderForm();
  saveDraft();
}

// ---------- Vorschau ----------

function openPreview(focus?: Entry): void {
  const data: PreviewData = {
    categories,
    files: categories.map((c) => buildCategoryFile(c, files.get(c.file), entries)),
  };
  try {
    localStorage.setItem(PREVIEW_KEY, JSON.stringify(data));
  } catch {
    toast('Die Vorschau konnte nicht abgelegt werden (Browser-Speicher gesperrt oder voll).');
    return;
  }
  const p = new URLSearchParams({ vorschau: '1' });
  const y0 = yearOf(focus?.item.life?.start) ?? yearOf(focus?.item.start);
  if (focus && y0 !== undefined && !focus.deleted) {
    const y1 = Math.max(yearOf(focus.item.end) ?? y0, yearOf(focus.item.life?.end) ?? y0);
    const pad = Math.max(15, (y1 - y0) * 0.6);
    p.set('from', String(Math.round(y0 - pad)));
    p.set('to', String(Math.round(y1 + pad)));
    p.set('sel', focus.item.id);
  }
  window.open('./?' + p.toString(), 'zeitleiste-vorschau');
}

// ---------- Speichern ----------

function changeSummary(): { label: string; lines: string[] } {
  const dirty = entries.filter(isDirty);
  const count = (s: string) => dirty.filter((e) => status(e) === s).length;
  const parts = [['geändert', count('geändert')], ['neu', count('neu')], ['gelöscht', count('gelöscht')]].filter(([, n]) => n).map(([s, n]) => `${n} ${s}`);
  const lines = dirty.map((e) => `${status(e)}: ${e.item.title} (${catById(e.cat)?.name ?? e.cat})`);
  return { label: parts.join(', '), lines };
}

function openSave(): void {
  if (!gh) {
    openLogin();
    return;
  }
  countIds();
  const broken = entries.filter((e) => isDirty(e) && Object.keys(errorsOf(e)).length);
  if (broken.length) {
    $<HTMLSelectElement>('f-status').value = 'error';
    refresh();
    select(broken[0].key);
    toast(`${broken.length} geänderte${broken.length === 1 ? 'r Eintrag hat' : ' Einträge haben'} noch Fehler – bitte zuerst korrigieren.`);
    return;
  }
  const { label, lines } = changeSummary();
  $('save-list').replaceChildren(...lines.map((l) => el('li', {}, l)));
  $<HTMLTextAreaElement>('save-message').value = `Redaktion: ${label}\n\n${lines.join('\n')}`;
  $<HTMLParagraphElement>('save-error').hidden = true;
  $<HTMLDialogElement>('save-dialog').showModal();
}

function setupSave(): void {
  const dialog = $<HTMLDialogElement>('save-dialog');
  $('save-cancel').addEventListener('click', () => dialog.close());
  $<HTMLFormElement>('save-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!gh) return;
    const submit = $<HTMLButtonElement>('save-submit');
    const errorEl = $<HTMLParagraphElement>('save-error');
    submit.disabled = true;
    submit.textContent = 'Wird gespeichert …';
    try {
      const changed = changedFileTexts(categories, files, entries).map((f) => ({ path: DATA_DIR + f.file, text: f.text }));
      const result = await gh.commit(changed, shas, $<HTMLTextAreaElement>('save-message').value.trim());
      // Gespeicherten Stand als neue Ausgangsbasis übernehmen.
      for (const f of changed) files.set(f.path.slice(DATA_DIR.length), JSON.parse(f.text) as CategoryFile);
      shas = result.shas;
      entries = entries.filter((e) => !e.deleted);
      for (const e of entries) e.orig = { cat: e.cat, item: structuredClone(e.item) };
      autoId.clear();
      try { storage()?.removeItem(DRAFT_KEY); } catch { /* */ }
      dialog.close();
      // Filter „nur geänderte/fehlerhafte“ würde jetzt eine leere Liste zeigen.
      $<HTMLSelectElement>('f-status').value = '';
      refresh();
      renderForm();
      toast(`Gespeichert (Commit <code>${result.commit.slice(0, 7)}</code>). Die Zeitleiste wird jetzt neu gebaut und ist in etwa 2–3 Minuten aktualisiert – ` +
        `<a href="https://github.com/${REPO.owner}/${REPO.repo}/actions" target="_blank" rel="noopener">Fortschritt ansehen ↗</a>`, 15000);
    } catch (err) {
      errorEl.textContent = errMsg(err);
      errorEl.hidden = false;
    } finally {
      submit.disabled = false;
      submit.textContent = 'Speichern und veröffentlichen';
    }
  });
}

// ---------- Start ----------

function setup(): void {
  for (const id of ['q', 'f-from', 'f-to']) $(id).addEventListener('input', scheduleRefresh);
  for (const id of ['f-cat', 'f-status']) $(id).addEventListener('change', refresh);
  for (const th of document.querySelectorAll<HTMLElement>('th[data-sort]')) {
    th.addEventListener('click', () => {
      if (sortKey === th.dataset.sort) sortDir = -sortDir;
      else {
        sortKey = th.dataset.sort!;
        sortDir = 1;
      }
      refresh();
    });
  }
  rowsEl.addEventListener('click', (ev) => {
    const tr = (ev.target as Element).closest<HTMLElement>('tr[data-key]');
    if (tr) select(tr.dataset.key!);
  });
  $('new').addEventListener('click', newEntry);
  $('preview').addEventListener('click', () => openPreview(entries.find((x) => x.key === selected)));
  $('save').addEventListener('click', openSave);
  $('discard').addEventListener('click', () => {
    const n = entries.filter(isDirty).length;
    if (!confirm(`Alle ${n} ungespeicherten Änderungen verwerfen?`)) return;
    entries = entries.filter((e) => e.orig);
    for (const e of entries) {
      e.cat = e.orig!.cat;
      e.item = structuredClone(e.orig!.item);
      e.deleted = false;
    }
    autoId.clear();
    try { storage()?.removeItem(DRAFT_KEY); } catch { /* */ }
    refresh();
    renderForm();
  });
  setupLogin();
  setupSave();
}

setup();
load();
