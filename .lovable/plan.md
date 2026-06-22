# Storyboard-Loading: Cinematic Stage Panel statt kurzem Spinner

## Ziel
Wenn das Storyboard nach dem Briefing generiert wird (10–20s, manchmal länger), erscheint ab sofort ein **vollflächiges Bond-2028 Panel** im selben Stil wie das Welcome-Moment / Countdown — statt der jetzigen kleinen Card mit Spinner. Das Panel bleibt sichtbar, **solange `isGeneratingStoryboard === true`**, zeigt News aus dem News-Radar und genug Lesefutter gegen das Warten.

## Was der User sieht

1. User klickt "Storyboard generieren" im Briefing.
2. Die Storyboard-Tab wird aktiv und **statt der Empty-State-Card** öffnet sich ein vollflächiges Panel (gleicher Look wie `StagePanel` / `StageWelcomeMoment`):
   - Dunkler Bond-Black Background mit goldenem Cinemascope-Frame
   - Gold-Wordmark oben: "BUILDING YOUR STORYBOARD"
   - Untertitel: "Der Director arbeitet — Skript, Cast & Szenen werden komponiert."
   - **Mittig**: animierte Status-Zeile, die alle ~2.5s durch die Phasen rotiert
     (`Analysiere Briefing` → `Wähle Cast` → `Plane Szenen-Bögen` → `Schreibe Skripte` → `Setze Kamera & Look` → `Finalisiere Storyboard`)
   - **Darunter rotierender "Director's Notes"-Karussell** mit Lesefutter: 6–8 kuratierte Tipps zum Composer-Workflow (Frame-Chain, Cast Consistency, Engine pro Szene, Talking Head etc.), jeweils 1 Absatz, alle ~6s wechselnd, mit smoothem fade
   - **Unten**: News-Ticker im Bond-Stil mit Live-Items aus `useNewsRadar()`:
     - Horizontal scrollende goldene Marquee-Zeile "AdTool News Radar · LIVE"
     - Max. 8 Items, Format `[Kategorie] Headline — Source`
     - Endlos-Loop bis Panel sich schließt
   - Dezenter Progress-Hinweis "~10–20 Sekunden — du musst nicht warten, wir benachrichtigen dich" + dezenter indeterminater Gold-Bar
3. Sobald `isGeneratingStoryboard` auf `false` flippt → Panel fade/iris-out (200ms), Storyboard erscheint normal.

## Technische Umsetzung

**Neue Datei:** `src/components/video-composer/stage/StageStoryboardLoader.tsx`
- Props: `language: string` (für News-Radar Sprache, optional)
- Nutzt `useNewsRadar()` für Live-News (Fallback bereits eingebaut)
- Interne State-Machine für Phase-Rotation (`setInterval` 2500ms) und Notes-Karussell (`setInterval` 6000ms)
- Wiederverwendet visuelle Patterns aus `StagePanel.tsx` (Cinemascope-Frame, Gold-Akzente, Playfair Display Headings, Inter Body) — gleicher Bond-2028 Look wie Welcome-Moment, aber **ohne** Countdown (das ist eine eigene Sequence)
- Reduced-motion-Safe: deaktiviert Marquee + Phase-Rotation bei `prefers-reduced-motion`
- Pure Frontend, keine neuen Edge-Functions / Backend-Calls (News kommt aus existierendem `useNewsRadar`)

**Edit:** `src/components/video-composer/StoryboardTab.tsx` (Zeilen 583–599)
- Ersetzt den aktuellen Loader-Card-Branch durch `<StageStoryboardLoader />`
- Empty-State (keine Generierung läuft) bleibt unverändert

**Content (DE / EN / ES Lokalisierung):**
- 6 Phase-Strings: "Briefing analysieren", "Cast wählen", "Szenen-Bögen planen", "Skripte schreiben", "Kamera & Look setzen", "Finalisieren"
- 8 Director's-Notes als Lesefutter (je ~2–3 Sätze)
- Header / Subheader / Footer-Hinweis
- Alle Strings via `useTranslation()` mit Keys unter `videoComposer.storyboardLoader.*`

## Out of scope
- Kein Skip-Button (Generierung läuft serverseitig sowieso weiter)
- Keine echte Progress-Anzeige aus dem Backend (kein neuer Endpoint) — Phase-Rotation ist visuell, kein Live-Status
- Welcome-Moment / Countdown bleibt unverändert
- Kein Audio

## Geschätzter Aufwand
~0.4 Tage. 1 neue Komponente (~250 Zeilen), 1 Edit, 3 Sprach-Pakete erweitert.
