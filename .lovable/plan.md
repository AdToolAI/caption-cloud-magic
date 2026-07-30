## Ziel

Die Voice-Bibliothek (`UniversalVoiceLibraryPicker`) bekommt die gewählte Richtung **Cinematic Glass Noir**. Rein visuell — Filter, Kategorien, Suche, Infinite Scroll und Auswahl-Logik bleiben unverändert.

## Was sich ändert

**Dialograhmen**
- Breiterer Dialog (max-w-5xl), `rounded-2xl`, dünner heller Rand auf tiefem Schwarz, kräftiger Schatten.
- Kopf-, Filter- und Fußbereich bleiben fixiert (`shrink-0`), Liste scrollt weiterhin (der `min-h-0`-Fix bleibt erhalten).

**Header**
- Playfair-Display-Titel, größer, mit feinem Trenner und kursivem Kontextteil („Voice-Bibliothek | Content Creator").
- Untertitel als kleine Versalzeile mit Sperrung; die Trefferzahl und die Sprache werden farblich hervorgehoben (Cyan).

**Suche & Filter**
- Suchfeld höher, Lupe wechselt beim Fokus auf Gold, goldener Fokusring.
- Filter-Dropdowns kompakter, einheitlich als Glas-Pillen mit goldenem Hover-Rand.
- „Nur nativ" als eigener Glas-Block rechts mit Versal-Label.

**Kategorie-Chips**
- Aktiver Chip: gefülltes Gold mit dunkler Schrift und weichem Glow.
- Inaktive Chips: Glas mit goldenem Hover-Rand. Horizontale Scrollleiste wird ausgeblendet (kein grauer Balken mehr wie im Screenshot), stattdessen sanftes Auslaufen am Rand.

**Stimmen-Karten**
- Zweispaltiges Raster, luftigere Innenabstände.
- Hover: leichte Anhebung, goldener Rand, goldener Titel, Play-Button skaliert.
- Tags neu typisiert: Premium in Cyan, Nativ in Gold, Rest neutral — kleine Versalien.
- Beschreibung kursiv, zweizeilig gekappt.
- Ausgewählte/spielende Karte: goldener Rand, goldener Play-Button, pulsierender Punkt oben rechts.

**Scroll & Footer**
- Schmale goldene Scrollbar statt des unsichtbaren Standard-Thumbs.
- Footer als abgesetzte dunkle Leiste; „Weitere Stimmen laden" und der Zähler („60 von 3.405") bleiben, bekommen aber den Glas-Button-Stil.

## Technische Details

- Alle Farben kommen als semantische Tokens; wo Gold/Cyan im Prototyp hart kodiert sind, nutze ich die vorhandenen Tokens bzw. ergänze fehlende in `index.css` und `tailwind.config.ts` (kein `text-white`/`bg-[#...]` in Komponenten).
- Utility-Klassen `.no-scrollbar` und die goldene Scrollbar werden einmalig in `index.css` definiert, damit sie auch anderswo nutzbar sind.
- Die Karten werden in eine kleine Unterkomponente `VoiceCard` innerhalb des Pickers ausgelagert, damit die Datei lesbar bleibt.

## Betroffene Dateien

- `src/components/voices/UniversalVoiceLibraryPicker.tsx` (Layout, Header, Filter, Chips, Karten, Footer)
- `src/index.css` (Scrollbar-Utilities, evtl. neue Tokens)
- `tailwind.config.ts` (nur falls ein Token fehlt)

Keine Änderungen an `list-voices`, `useVoiceLibrary` oder der Auswahl-/Persistenz-Logik.
