# Director's Cut — Grafik-Overlays (Banner, Schilder, Lower Thirds)

Heute kann der Director's Cut nur reinen Text: 6 Animationen, 9 Rasterpositionen, vier Schriftgrößen, eine Hintergrundfarbe. Alles, was in echten Werbeclips wirkt — Lower Thirds, Banner-Balken, Preis-Störer, Pfeile, Schilder, Logo-Bugs, Ticker — muss der Kunde heute außerhalb bauen.

Dieses Vorhaben macht aus dem Text-Overlay eine echte **Grafik-Ebene**: gleiche Timeline, gleicher Export, aber mit Bausteinen statt nur Buchstaben.

## Hinweis: UDC-Feature-Freeze

Der Director's Cut steht laut `.lovable/UDC-FEATURE-FREEZE.md` unter Feature-Freeze. Die Freigabe dieses Plans gilt als ausdrückliche Entsperrung für genau diesen Bereich (Overlay-Layer inkl. Export); alles andere im UDC bleibt eingefroren. Nach Umsetzung wird das Freeze-Dokument entsprechend fortgeschrieben.

## Was der Kunde bekommt

**1. Overlay-Bibliothek statt Textliste**
Ein Katalog mit fertigen, markenkonformen Bausteinen in Kategorien:
- *Lower Third* — Name/Rolle, 3 Stile (Balken, Linie, Glas)
- *Banner* — Voll- oder Halbbreite oben/unten, mit optionalem zweitem Text
- *Störer / Badge* — Kreis oder Pill, z. B. „-30 %", „NEU", „Nur heute"
- *Schild / Karte* — abgerundete Karte mit Titel, Untertitel, optionalem Icon
- *CTA-Button* — Button-Optik mit Pfeil
- *Ticker* — durchlaufendes Band am unteren Rand
- *Logo-Bug / Watermark* — Bild oder Text, dauerhaft eingeblendet
- *Callout* — Pfeil oder Linie plus Label, um etwas im Bild zu markieren
- *Zitat* — großes Anführungszeichen mit Quellenzeile
- *Progress-Bar* — mitlaufender Fortschrittsbalken für die Clip-Dauer

**2. Freie Platzierung und Größe**
Ziehen im Vorschaubild, Anfasser zum Skalieren, Einrasten an Drittel-Linien und Safe-Zone-Rahmen für 9:16 / 1:1 / 16:9.

**3. Mehr Gestaltungsmittel**
Eigene Farben für Fläche, Rand und Text, Eckenradius, Deckkraft, Rahmenstärke, Schlagschatten, Verlauf, Rotation, freie Schriftgröße statt vier Stufen, Marken-Schriften.

**4. Mehr Animation**
Zusätzlich zu den bestehenden sechs: Slide von jeder Seite, Wipe/Reveal, Pop, Blur-In, Zeilen-Stagger, Ticker-Loop — jeweils mit getrennter Ein- und Ausblende-Animation.

**5. Brand Kit direkt angebunden**
Ein Klick „Markenfarben anwenden" zieht Farben, Logo und Schriften aus dem Brand Kit in alle Overlays der Sequenz.

**6. Timeline-Bedienung**
Overlays erscheinen als Balken auf der Timeline; Start/Ende per Ziehen, Duplizieren, an Szenenwechsel andocken.

## Technische Umsetzung

**Datenmodell** (`src/types/directors-cut.ts`)
`TextOverlay` wird zu `OverlayElement`: neues Feld `kind` (`text` | `lowerThird` | `banner` | `badge` | `card` | `cta` | `ticker` | `logo` | `callout` | `quote` | `progress`), `box` (relative x/y/w/h wie im Post Designer), `enter`/`exit`-Animation, erweitertes `style` (fill, border, radius, opacity, gradient, rotation, numerische fontSize), `slots` für Titel/Untertitel/Icon/Bild.
Alle bestehenden Felder bleiben optional erhalten; eine Migrationsfunktion `upgradeOverlay()` hebt Alt-Overlays (Rasterposition + Größenstufe) verlustfrei auf das neue Modell an, damit gespeicherte Projekte weiterlaufen.

**Renderer — eine Quelle für Vorschau und Export**
Neuer geteilter Renderer `src/remotion/components/OverlayElementRenderer.tsx` mit einer Zeichnung pro `kind`, aufgebaut in relativen Koordinaten (analog `src/lib/post-design/schema.ts`), damit Studio-Vorschau und 1080p/4K-Export pixelgleich sind. `TextOverlayRenderer.tsx` bleibt als Kompatibilitätspfad für Alt-Daten bestehen und delegiert an den neuen Renderer.

**Export-Kette**
- `src/remotion/templates/DirectorsCutVideo.tsx`: `TextOverlaySchema` zu `OverlayElementSchema` erweitern (alle neuen Felder optional, damit alte Payloads valide bleiben).
- `supabase/functions/render-directors-cut/index.ts`: Overlay-Normalisierung auf snake_case-Vertrag erweitern (Render-API-Schema-Regel), unbekannte `kind`-Werte fallen auf `text` zurück.

**UI**
- `OverlayLibrary.tsx` — Katalog mit Live-Vorschau-Kacheln.
- `OverlayInspector.tsx` — kontextsensitive Einstellungen je `kind`.
- `OverlayCanvasEditor.tsx` — Drag/Resize/Snapping über dem Vorschauvideo.
- `TextOverlayEditor2028.tsx` wird zur Hülle, die diese drei zusammenführt; `SpecialEffectsStep.tsx` bindet sie unverändert ein.
- Neue Presets in `src/lib/directors-cut/overlayPresets.ts`; Brand-Kit-Anbindung analog `src/lib/post-design/brand.ts`.

**Absicherung**
- Vitest-Regressionstest: Alt-Overlay-JSON → `upgradeOverlay()` → identische Darstellung wie zuvor.
- Vitest: jeder `kind` erzeugt ein schema-valides Export-Payload.
- Preflight-Regeln (`ciPreflight.ts`) bleiben unangetastet — keine neuen Checks.

## Reihenfolge

1. Datenmodell + Migration + Tests
2. Geteilter Renderer inkl. Export-Schema
3. Bibliothek und Presets
4. Canvas-Editor mit Drag/Resize/Snapping
5. Inspector, Brand-Kit-Anbindung, Timeline-Balken
6. Freeze-Dokument aktualisieren

## Was nicht Teil davon ist

Keyframe-Animation eigener Pfade, Video-in-Video-Overlays, animierte Sticker/GIFs und mehrsprachige Overlay-Varianten — bewusst außen vor, damit Export und Render stabil bleiben.
