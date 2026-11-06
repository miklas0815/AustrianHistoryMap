// Zugriffsstatistik mit GoatCounter (https://www.goatcounter.com): ohne Cookies und ohne
// fremdes Skript. Ein Seitenaufruf wird als kleiner Bildaufruf an den Zähl-Endpunkt gemeldet
// (Parameter siehe https://www.goatcounter.com/code/pixel).

/** GoatCounter-Code = Name des Kontos, also <code>.goatcounter.com. Leer = keine Zählung. */
export const GOATCOUNTER_CODE = '';

/** Gleicher Schlüssel wie im offiziellen count.js: „t“ = dieses Gerät nicht zählen. */
export const SKIP_KEY = 'skipgc';

export function isCountingDisabledHere(): boolean {
  try {
    return localStorage.getItem(SKIP_KEY) === 't';
  } catch {
    return false;
  }
}

export function setCountingDisabledHere(disabled: boolean): void {
  try {
    if (disabled) localStorage.setItem(SKIP_KEY, 't');
    else localStorage.removeItem(SKIP_KEY);
  } catch { /* Speicher gesperrt */ }
}

function shouldCount(): boolean {
  if (!GOATCOUNTER_CODE) return false;
  const host = location.hostname;
  // Lokale Entwicklung, Vorschau aus der Redaktion, automatisierte Browser und eigene Geräte nicht zählen.
  if (location.protocol === 'file:' || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return false;
  if (new URLSearchParams(location.search).has('vorschau')) return false;
  if (navigator.webdriver) return false;
  return !isCountingDisabledHere();
}

function send(params: Record<string, string>): void {
  const q = new URLSearchParams({ ...params, rnd: Math.random().toString(36).slice(2) });
  const img = new Image(1, 1);
  img.src = `https://${GOATCOUNTER_CODE}.goatcounter.com/count?${q}`;
}

/** Seitenaufruf zählen; Ansichtsparameter (Zeitraum, Kategorien …) bleiben außen vor. */
export function countPageview(): void {
  if (!shouldCount()) return;
  let referrer = '';
  try {
    // Nur fremde Herkunft melden, nicht Wechsel innerhalb der eigenen Seite.
    if (document.referrer && new URL(document.referrer).host !== location.host) referrer = document.referrer;
  } catch { /* ungültiger Referrer */ }
  send({
    p: location.pathname,
    t: document.title,
    r: referrer,
    s: [screen.width, screen.height, window.devicePixelRatio || 1].join(','),
  });
}

/** Ereignis zählen, z. B. „export-pdf“. */
export function countEvent(name: string, title = name): void {
  if (!shouldCount()) return;
  send({ p: name, t: title, e: 'true' });
}
