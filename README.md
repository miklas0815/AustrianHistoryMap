# Österreichische Geschichte – Zeitleiste

Interaktive Zeitleiste mit auswählbaren Kategorien (Herrscher, Wiener Bürgermeister,
Baumeister, Komponisten, Maler, technologische Neuerungen, Ereignisse in Österreich
und international). Zoomen blendet je nach
Bedeutung mehr oder weniger Einträge ein; die aktuelle Ansicht lässt sich als PDF
oder JPEG speichern und als Link teilen.

Startdatenbestand: 1500–1600.

## Bedienung

- **Mausrad / Ziehen**: zoomen und verschieben (Trackpad waagrecht: verschieben)
- **Kategorien**: oben ein-/ausschalten
- **Detailgrad**: zeigt bei gleicher Zoomstufe mehr oder weniger Einträge
- **Klick auf einen Eintrag**: Details mit Ort, Wikipedia-Suche und Kartenlink
- **PDF / JPEG**: speichert genau die aktuelle Ansicht mit Titel und Datum
- **Link**: kopiert eine URL, die diese Ansicht wiederherstellt
  (z. B. `?from=1520&to=1540&cats=herrscher-at,ereignisse-at`)

## Entwicklung

```bash
npm install
npm run dev        # lokaler Server mit Live-Reload
npm test           # Unit-Tests
npm run validate   # Daten prüfen
npm run build      # prüft Daten + Typen, erzeugt dist/
```

## Veröffentlichen (easyname)

### Automatisch über GitHub Actions

Bei jedem Push auf den Standard-Branch baut GitHub die Seite, prüft Daten und
Tests und lädt das Ergebnis per FTP auf den Webspace
(`.github/workflows/deploy.yml`). Einmalig einzurichten unter
**GitHub → Settings → Secrets and variables → Actions**:

| Art | Name | Inhalt |
|---|---|---|
| Secret | `FTP_SERVER` | FTP-Server laut easyname-Kundenbereich |
| Secret | `FTP_USERNAME` | FTP-Benutzername |
| Secret | `FTP_PASSWORD` | FTP-Passwort |
| Variable | `FTP_TARGET_DIR` | Zielordner am Server, z. B. `/html/zeitleiste` (Standard `/`) |
| Variable | `FTP_PROTOCOL` | `ftp` (Standard; verschlüsselt per TLS, wenn der Server es anbietet) oder `sftp` |

Solange die Secrets fehlen, wird nur gebaut und nichts hochgeladen. Einen Upload
kann man auch manuell starten: **Actions → Build und Deploy → Run workflow**.
Das fertige Paket steht bei jedem Lauf zusätzlich als Download („website“) bereit.

Am Server wird nichts gelöscht; andere Dateien im Zielordner bleiben erhalten.
Daten bitte nur noch im Repository ändern – direkte Änderungen am Server werden
beim nächsten Deploy überschrieben.

### Manuell

1. `npm run build`
2. Den **Inhalt** von `dist/` per FTP/SFTP in das gewünschte Verzeichnis am
   Webspace hochladen (funktioniert auch in einem Unterordner).

Es wird nur statisches Hosting benötigt – kein PHP, keine Datenbank.

## Daten pflegen

Alle Daten liegen in `public/data/`:

- `categories.json` – Kategorien mit Name, Farbe, Reihenfolge und Datei
- eine Datei pro Kategorie, z. B. `ereignisse-at.json`

Ein Eintrag:

```json
{
  "id": "osmanenbelagerung-1529",
  "title": "Erste Wiener Osmanenbelagerung",
  "short": "Osmanenbelagerung",
  "start": "1529-09-27",
  "end": "1529-10-14",
  "importance": 1,
  "description": "…",
  "place": { "name": "Wien", "lat": 48.2082, "lon": 16.3738 },
  "attributes": { "Verteidiger": "Niklas Graf Salm" },
  "sources": ["https://…"]
}
```

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `id` | ja | eindeutig über alle Dateien |
| `title` | ja | Beschriftung |
| `start` | ja | `"1529"`, `"1529-09"`, `"1529-09-27"`; `"~1460"` = um 1460 |
| `end` | nein | ohne `end` ist der Eintrag ein Zeitpunkt (Raute), mit `end` ein Zeitraum (Balken) |
| `importance` | ja | 1 = sehr bedeutend … 5 = Detail; steuert, ab welcher Zoomstufe der Eintrag erscheint |
| `short` | nein | Kurzform, wenn der volle Titel nicht in den Balken passt |
| `description`, `place`, `attributes`, `tags`, `sources` | nein | Detailansicht |

Bei Personen zeigt der Balken je nach Kategorie die Regierungs- bzw. Amtszeit
(Herrscher, Bürgermeister) oder die Lebensdaten (Baumeister, Komponisten, Maler).
Bei Baumeistern, Komponisten und Malern haben in Österreich bzw. am Habsburgerhof
tätige Personen Vorrang (Bedeutung 1–3); internationale Namen dienen als Kontext
(meist 4–5) und erscheinen erst beim Hineinzoomen. Ungefähre Daten
(`~`) werden mit auslaufenden Balkenenden dargestellt.

Nach jeder Änderung `npm run validate` ausführen. Das Skript meldet ungültige
Daten, doppelte IDs und falsche Felder.

### Wie die Bedeutung wirkt

Wie viele Stufen sichtbar sind, hängt davon ab, wie viele Pixel ein Jahr gerade
breit ist (`src/layout.ts`, `MIN_PX_PER_YEAR`). Auf einem breiten Bildschirm sind
bei 100 Jahren die Stufen 1–4 sichtbar, am Handy 1–2. Kurze Balken der
niedrigsten sichtbaren Stufe bleiben unbeschriftet, bis man hineinzoomt.
Innerhalb einer Spur stehen wichtigere Einträge in den oberen Zeilen.

### Bedeutungsstufen vergeben

| Stufe | Personen (Baumeister, Komponisten, Maler) | Ereignisse und Neuerungen | sichtbar ab (Desktop) |
|---|---|---|---|
| 1 | prägende Figuren mit Österreichbezug | 2–3 Highlights pro Jahrhundert und Kategorie | immer |
| 2 | wichtige Figuren mit Österreichbezug | ca. 4–5 weitere Wendepunkte | ca. 400 Jahre im Bild |
| 3 | weitere Personen mit Österreichbezug | wichtige Ereignisse | ca. 200 Jahre |
| 4 | internationale Größen als Kontext | Ergänzungen | ca. 120 Jahre |
| 5 | weitere internationale Personen | Details | ca. 60 Jahre |

Je weniger Einträge auf den oberen Stufen stehen, desto übersichtlicher ist die
herausgezoomte Ansicht.

## Aufbau

```
public/data/        Daten (JSON), werden zur Laufzeit geladen
src/dates.ts        historische Datumsangaben ↔ Dezimaljahre, deutsche Formatierung
src/data.ts         Laden der Daten
src/layout.ts       Bedeutungsfilter und Zeilenverteilung pro Kategorie
src/ticks.ts        Achsenteilung (Jahrhunderte bis Monate)
src/render.ts       Zeichnen als SVG (identisch für Bildschirm, PDF, JPEG)
src/export.ts       PDF (jsPDF + svg2pdf.js) und JPEG (Canvas)
src/state.ts        Ansicht ↔ URL
src/main.ts         Zoom, Bedienelemente, Detailansicht
scripts/validate-data.mjs   Datenprüfung
```

## Datenquellen

Die Startdaten wurden aus allgemein zugänglichen Nachschlagewerken zusammengestellt
(u. a. Wikipedia, Wien Geschichte Wiki) und sollten vor einer Veröffentlichung
fachlich geprüft werden. Die Amtszeiten der Wiener Bürgermeister des
16. Jahrhunderts sind meist nur jahresgenau überliefert und in der Literatur teils
umstritten.
