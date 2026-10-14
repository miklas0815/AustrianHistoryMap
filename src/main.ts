import './style.css';
import { scaleLinear } from 'd3-scale';
import { select } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior } from 'd3-zoom';
import { loadDataset, type Category, type Dataset, type Item } from './data';
import { formatRange, formatYear } from './dates';
import { exportImage, exportPdf, type PdfFormat } from './export';
import { layoutLanes, visibleImportance, type Lane } from './layout';
import { FONT, FONT_SIZE, renderTimeline } from './render';
import { DEFAULT_VIEW, parseViewState, serializeViewState, type ViewState } from './state';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const chartEl = $<HTMLDivElement>('chart');
const svgEl = document.getElementById('timeline') as unknown as SVGSVGElement;
const tooltipEl = $<HTMLDivElement>('tooltip');
const detailEl = $<HTMLElement>('detail-panel');
const statusEl = $<HTMLSpanElement>('status');
const fromInput = $<HTMLInputElement>('from');
const toInput = $<HTMLInputElement>('to');
const detailInput = $<HTMLInputElement>('detail');

const MIN_SPAN_YEARS = 1;
const RIGHT_PAD = 16;

let data: Dataset;
let itemsById = new Map<string, Item>();
let state: ViewState = parseViewState(location.search);
let extent: [number, number] = [1400, 1700];
let gutter = 190;
let plotWidth = 800;
let baseX = scaleLinear();
let zoomBehavior: ZoomBehavior<SVGSVGElement, unknown>;
let lastLanes: Lane[] = [];
let lastMaxImportance = 1;

// ---------- Textmessung für das Layout ----------

const measureCtx = document.createElement('canvas').getContext('2d')!;
const measureCache = new Map<string, number>();
function measure(text: string, bold: boolean): number {
  const key = (bold ? 'b|' : 'n|') + text;
  let w = measureCache.get(key);
  if (w === undefined) {
    measureCtx.font = `${bold ? 'bold ' : ''}${FONT_SIZE}px ${FONT}`;
    w = measureCtx.measureText(text).width;
    measureCache.set(key, w);
  }
  return w;
}

// ---------- Zustand ----------

function selectedCategories(): Category[] {
  return state.cats ? data.categories.filter((c) => state.cats!.includes(c.id)) : data.categories;
}

let urlTimer: number | undefined;
function syncUrl(): void {
  clearTimeout(urlTimer);
  urlTimer = window.setTimeout(() => history.replaceState(null, '', serializeViewState(state)), 150);
}

// ---------- Zeichnen ----------

let frame = 0;
function scheduleRender(): void {
  if (!frame) frame = requestAnimationFrame(() => { frame = 0; render(); });
}

function currentX(): (t: number) => number {
  const s = scaleLinear().domain([state.from, state.to]).range([0, plotWidth]);
  return (t) => s(t);
}

function render(): void {
  const cats = selectedCategories();
  const pxPerYear = plotWidth / (state.to - state.from);
  lastMaxImportance = visibleImportance(pxPerYear, state.detail);
  const x = currentX();
  lastLanes = layoutLanes({
    categories: cats,
    items: data.items,
    x,
    domain: [state.from, state.to],
    plotWidth,
    maxImportance: lastMaxImportance,
    measure,
  });
  renderTimeline(svgEl, {
    lanes: lastLanes,
    width: gutter + plotWidth + RIGHT_PAD,
    gutter,
    plotWidth,
    x,
    domain: [state.from, state.to],
    selectedId: state.sel,
    idPrefix: 'screen',
  });

  fromInput.value = String(Math.round(state.from));
  toInput.value = String(Math.round(state.to));
  const shown = lastLanes.reduce((n, l) => n + l.placed.length, 0);
  const hidden = lastLanes.reduce((n, l) => n + l.hidden, 0);
  statusEl.textContent =
    `${formatYear(Math.round(state.from))}–${formatYear(Math.round(state.to))} · ` +
    `Bedeutung 1–${lastMaxImportance} · ${shown} Einträge sichtbar` +
    (hidden ? `, ${hidden} weitere beim Hineinzoomen` : '');
  syncUrl();
}

// ---------- Zoom ----------

function measureLayout(): void {
  const width = chartEl.clientWidth;
  gutter = width < 700 ? 0 : 190;
  plotWidth = Math.max(200, width - gutter - RIGHT_PAD);
  baseX = scaleLinear().domain(extent).range([gutter, gutter + plotWidth]);
  zoomBehavior
    .extent([[gutter, 0], [gutter + plotWidth, 1]])
    .translateExtent([[gutter, -Infinity], [gutter + plotWidth, Infinity]])
    .scaleExtent([1, (extent[1] - extent[0]) / MIN_SPAN_YEARS]);
}

/** Zeigt den Zeitraum [from, to] an (über die Zoom-Transformation). */
function showRange(from: number, to: number): void {
  const k = (extent[1] - extent[0]) / (to - from);
  const tx = gutter - k * baseX(from);
  select(svgEl).call(zoomBehavior.transform, zoomIdentity.translate(tx, 0).scale(k));
}

function setupZoom(): void {
  zoomBehavior = d3zoom<SVGSVGElement, unknown>()
    // Waagrechtes Scrollen (Trackpad) verschiebt, senkrechtes zoomt.
    .filter((event: Event) => {
      if (event.type === 'wheel') {
        const w = event as WheelEvent;
        return Math.abs(w.deltaY) >= Math.abs(w.deltaX);
      }
      const m = event as MouseEvent;
      return !m.ctrlKey && !m.button;
    })
    .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
      const [from, to] = event.transform.rescaleX(baseX).domain();
      state.from = from;
      state.to = to;
      hideTooltip();
      scheduleRender();
    });
  select(svgEl).call(zoomBehavior).on('dblclick.zoom', null);

  svgEl.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      e.preventDefault();
      const k = (extent[1] - extent[0]) / (state.to - state.from);
      select(svgEl).call(zoomBehavior.translateBy, -e.deltaX / k, 0);
    }
  }, { passive: false });
}

function zoomBy(factor: number): void {
  const mid = (state.from + state.to) / 2;
  const half = (state.to - state.from) / 2 / factor;
  showRange(mid - half, mid + half);
}

// ---------- Kategorien ----------

function renderCategoryChips(): void {
  const container = $<HTMLDivElement>('categories');
  container.replaceChildren();
  for (const cat of data.categories) {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.type = 'button';
    btn.title = cat.description ?? '';
    const on = !state.cats || state.cats.includes(cat.id);
    btn.setAttribute('aria-pressed', String(on));
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.background = cat.color;
    btn.append(sw, cat.name);
    btn.addEventListener('click', () => toggleCategory(cat.id));
    container.appendChild(btn);
  }
}

function toggleCategory(id: string): void {
  const all = data.categories.map((c) => c.id);
  const current = new Set(state.cats ?? all);
  if (current.has(id)) current.delete(id);
  else current.add(id);
  const next = all.filter((c) => current.has(c));
  state.cats = next.length === all.length ? null : next;
  renderCategoryChips();
  scheduleRender();
}

// ---------- Tooltip und Details ----------

function itemFromEvent(e: Event): Item | undefined {
  const target = (e.target as Element).closest('[data-id]');
  return target ? itemsById.get(target.getAttribute('data-id')!) : undefined;
}

function hideTooltip(): void {
  tooltipEl.hidden = true;
}

function setupInteraction(): void {
  svgEl.addEventListener('pointermove', (e) => {
    const it = itemFromEvent(e);
    if (!it || e.buttons) return hideTooltip();
    tooltipEl.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = it.title;
    const dates = document.createElement('div');
    dates.className = 't-dates';
    dates.textContent = formatRange(it.startDate, it.endDate) + (it.place ? ` · ${it.place.name}` : '');
    tooltipEl.append(title, dates);
    tooltipEl.hidden = false;
    const pad = 14;
    const w = tooltipEl.offsetWidth;
    const left = e.clientX + pad + w > window.innerWidth ? e.clientX - pad - w : e.clientX + pad;
    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top = `${e.clientY + pad}px`;
  });
  svgEl.addEventListener('pointerleave', hideTooltip);
  svgEl.addEventListener('click', (e) => {
    const it = itemFromEvent(e);
    if (it) showDetail(it);
  });
}

function showDetail(it: Item | undefined): void {
  state.sel = it?.id;
  if (!it) {
    detailEl.hidden = true;
    scheduleRender();
    return;
  }
  const cat = data.categories.find((c) => c.id === it.category)!;
  const node = (tag: string, text?: string, cls?: string) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };

  const close = node('button', '×', 'close') as HTMLButtonElement;
  close.setAttribute('aria-label', 'Schließen');
  close.addEventListener('click', () => showDetail(undefined));

  const catLabel = node('div', cat.name, 'cat');
  catLabel.style.color = cat.color;
  const parts: Node[] = [close, catLabel, node('h2', it.title), node('div', formatRange(it.startDate, it.endDate), 'dates')];
  if (it.description) parts.push(node('p', it.description));

  const rows: [string, string][] = [];
  if (it.place) rows.push(['Ort', it.place.name]);
  for (const [k, v] of Object.entries(it.attributes ?? {})) rows.push([k, v]);
  rows.push(['Bedeutung', `${it.importance} von 5`]);
  const dl = node('dl');
  for (const [k, v] of rows) dl.append(node('dt', k), node('dd', v));
  parts.push(dl);

  const links = node('div', undefined, 'links');
  const link = (href: string, label: string) => {
    const a = node('a', label) as HTMLAnchorElement;
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener';
    links.appendChild(a);
  };
  link(`https://de.wikipedia.org/w/index.php?search=${encodeURIComponent(it.title)}`, 'In Wikipedia suchen ↗');
  if (it.place?.lat !== undefined && it.place.lon !== undefined) {
    link(`https://www.openstreetmap.org/?mlat=${it.place.lat}&mlon=${it.place.lon}#map=8/${it.place.lat}/${it.place.lon}`, `${it.place.name} auf der Karte ↗`);
  }
  for (const src of [...(it.sources ?? []), ...(cat.sources ?? [])]) link(src, `Quelle: ${decodeURIComponent(src.replace(/^https?:\/\//, '')).slice(0, 60)}`);
  parts.push(links);
  if (cat.note) parts.push(node('p', cat.note, 'note'));

  detailEl.replaceChildren(...parts);
  detailEl.hidden = false;
  if (window.matchMedia('(max-width: 760px)').matches) detailEl.scrollIntoView({ behavior: 'smooth' });
  scheduleRender();
}

// ---------- Export ----------

function exportFileBase(): string {
  return `zeitleiste-${Math.round(state.from)}-${Math.round(state.to)}`;
}

function buildExportSvg(): { svg: SVGSVGElement; cleanup: () => void } {
  const holder = document.createElement('div');
  holder.style.cssText = 'position:absolute;left:-10000px;top:0;';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  holder.appendChild(svg);
  document.body.appendChild(holder);

  const cats = selectedCategories();
  const stamp = new Date().toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  // Für den Export immer mit Kategorienspalte, auch wenn am Handy kompakt angezeigt wird.
  const exportGutter = 190;
  renderTimeline(svg, {
    lanes: lastLanes,
    width: exportGutter + plotWidth + RIGHT_PAD,
    gutter: exportGutter,
    plotWidth,
    x: currentX(),
    domain: [state.from, state.to],
    idPrefix: 'export',
    header: {
      title: `Österreichische Geschichte ${formatYear(Math.round(state.from))}–${formatYear(Math.round(state.to))}`,
      subtitle: `${cats.map((c) => c.name).join(' · ')}  —  Bedeutungsstufen 1–${lastMaxImportance}`,
    },
    footer: `Stand ${stamp} · ${location.href}`,
  });
  return { svg, cleanup: () => holder.remove() };
}

async function runExport(button: HTMLButtonElement, task: (svg: SVGSVGElement) => Promise<void>): Promise<void> {
  button.disabled = true;
  const { svg, cleanup } = buildExportSvg();
  try {
    await task(svg);
  } catch (err) {
    console.error(err);
    alert('Export fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    cleanup();
    button.disabled = false;
  }
}

function setupControls(): void {
  $('zoom-in').addEventListener('click', () => zoomBy(1.6));
  $('zoom-out').addEventListener('click', () => zoomBy(1 / 1.6));
  $('reset').addEventListener('click', () => showRange(DEFAULT_VIEW.from, DEFAULT_VIEW.to));

  const applyRange = () => {
    const from = Number(fromInput.value);
    const to = Number(toInput.value);
    if (Number.isFinite(from) && Number.isFinite(to) && to - from >= MIN_SPAN_YEARS) showRange(from, to);
  };
  fromInput.addEventListener('change', applyRange);
  toInput.addEventListener('change', applyRange);

  detailInput.value = String(state.detail);
  detailInput.addEventListener('input', () => {
    state.detail = Number(detailInput.value);
    scheduleRender();
  });

  const pdfButton = $<HTMLButtonElement>('export-pdf');
  pdfButton.addEventListener('click', () =>
    runExport(pdfButton, (svg) => exportPdf(svg, exportFileBase() + '.pdf', $<HTMLSelectElement>('pdf-format').value as PdfFormat)),
  );
  const jpegButton = $<HTMLButtonElement>('export-jpeg');
  jpegButton.addEventListener('click', () =>
    runExport(jpegButton, (svg) => exportImage(svg, exportFileBase() + '.jpg', 'image/jpeg')),
  );
  const linkButton = $<HTMLButtonElement>('copy-link');
  linkButton.addEventListener('click', async () => {
    history.replaceState(null, '', serializeViewState(state));
    try {
      await navigator.clipboard.writeText(location.href);
      linkButton.textContent = 'Kopiert ✓';
    } catch {
      prompt('Link zu dieser Ansicht:', location.href);
    }
    setTimeout(() => (linkButton.textContent = 'Link'), 1500);
  });
}

// ---------- Start ----------

async function main(): Promise<void> {
  try {
    data = await loadDataset();
  } catch (err) {
    statusEl.textContent = 'Daten konnten nicht geladen werden: ' + (err instanceof Error ? err.message : String(err));
    return;
  }
  itemsById = new Map(data.items.map((it) => [it.id, it]));
  const t0 = Math.min(...data.items.map((i) => i.t0), state.from);
  const t1 = Math.max(...data.items.map((i) => i.t1), state.to);
  extent = [Math.floor(t0) - 10, Math.ceil(t1) + 10];

  setupZoom();
  measureLayout();
  setupInteraction();
  setupControls();
  renderCategoryChips();

  const initial = { from: state.from, to: state.to };
  showRange(Math.max(initial.from, extent[0]), Math.min(initial.to, extent[1]));
  if (state.sel && itemsById.has(state.sel)) showDetail(itemsById.get(state.sel));
  else state.sel = undefined;

  new ResizeObserver(() => {
    const { from, to } = state;
    measureLayout();
    showRange(from, to);
  }).observe(chartEl);
}

main();
