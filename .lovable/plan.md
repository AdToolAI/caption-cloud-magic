## Problem

Im Schnitt-Tab des Director's Cut Studios sind drei Dinge kaputt (siehe Screenshot):

1. **Dauer-Slider für Übergang funktioniert nicht** — Der Wert klebt bei `0.1s`, Ziehen des Sliders hat keine Wirkung. Weil der Wert quasi 0 ist, wirkt der Übergang wie ein Hard-Cut (deshalb der Eindruck „kommt zu früh / ist gar kein Übergang").
2. **Übergang wirkt „zu früh"** — auch bei korrekter Dauer ist die Zentrierung nicht klar sichtbar, weil das aktuelle Fenster nur `duration/2` in jede Szene hineinragt und der Nutzer keine visuelle Vorschau der Fenstergrenzen bekommt.
3. **Linke Spalte (Szenenliste) ist abgeschnitten** — der mittlere Panel-Bereich (Übergangs-Picker + Preview + Timeline) überlagert die `SZENEN (2)`-Liste; Scrollbar erscheint mitten im Layout.

## Root Cause

- `CutPanel.tsx` → `TransitionBlock`: Slider ruft `onTransitionChange(sceneId, type, v/10)` korrekt, aber `handleTransitionChange` in derselben Datei mappt bei bestehender Transition nur `transitionType` + `duration`. Beim ersten Klick auf einen Tile wird eine Transition mit `duration: 1.2` erzeugt, danach überschreibt das nächste Slider-Event den Wert korrekt. **Der eigentliche Bug**: der Grid-Klick ruft `onTransitionChange(sceneId, tr.id, transition?.duration ?? 1.2)` — wenn `transition.duration` bereits auf `0.1` steht (z. B. weil der Slider aus Versehen bei Erstauswahl auf Min gerutscht ist, oder aus altem Draft geladen wurde), bleibt der Wert kleben, und der Slider selbst rendert korrekt, aber der Nutzer sieht keine Änderung, weil `v/10` mit `min=1, step=1` bei `1/10=0.1s` startet und die visuelle Bar quasi leer bleibt.
- Zusätzlich: `min={1}` + `step={1}` erlaubt zwar 0.1s-Schritte, aber der Slider-Track ist so schmal (in der Inline-Karte zwischen zwei Szenen), dass Ziehen unpraktisch ist — Klicks landen oft auf `1` (=0.1s).
- Layout: Der Sidebar-Container um `CutPanel` hat keine feste Mindestbreite; wenn der Inspector rechts geöffnet und die Timeline breit ist, kollabiert die linke Spalte auf ~1/3 und die Übergangs-Karte deckt Teile der Szenenliste ab.

## Plan

### 1. Übergang: Dauer-Slider reparieren + Default-Dauer

In `src/components/directors-cut/studio/sidebar/CutPanel.tsx`:

- **Default anheben**: bei Erstauswahl eines Transition-Tiles Dauer `1.2s` erzwingen (nicht `transition?.duration ?? 1.2` — bei absurd kleinem Bestandswert `< 0.3s` auf `1.2s` normalisieren).
- **Slider aufbohren**: `min={2}` (=0.2s Mindestdauer, damit hard-cuts über den „Keine"-Tile laufen), `max={30}` (3.0s), `step={1}`. Nummerisches Eingabefeld daneben (0.2 – 3.0s), damit der Nutzer präzise tippen kann, auch bei schmalem Track.
- Zusätzlich `+`/`−`-Buttons in 0.1s-Schritten neben dem Slider (analog zum Trim-Inspector), damit die Übergangs-Karte auch bei schmaler Sidebar bedienbar bleibt.

### 2. Übergangs-Fenster visuell nachvollziehbar

- Im `TransitionBlock` unterhalb des Sliders eine kleine Preview-Leiste rendern, die zeigt: „letzte X s von Szene A ⇄ erste X s von Szene B" — als 2-Streifen-Balken mit Prozentangabe (kein Video, nur eine visuelle Markierung).
- Timeline in `CapCutEditor` bekommt einen semi-transparenten Übergangs-Overlay-Marker (dünnes Trapez) über der Szenengrenze, sodass der Nutzer die Übergangszone sofort sieht (Breite = `resolvedTransition.duration`, Position = zentriert um `end_time`). Dazu wird der bestehende `resolveTransitions` genutzt.

### 3. Layout: Szenenliste nicht mehr abschneiden

In `src/components/directors-cut/studio/CapCutEditor.tsx` (linker Sidebar-Wrapper um `CutPanel`):

- `min-width: 280px` auf den linken Sidebar-Container (der aktuell `w-[width]` via `resizable panels` hat).
- `CutPanel` selbst: äußerer `<ScrollArea>` bekommt `max-h` gebunden an Viewport – die Szenenliste soll intern scrollen statt das Panel horizontal zu clippen.
- Der Übergangs-Block zwischen zwei Szenen bekommt `w-full` + `min-w-0`, damit er nicht in die rechte Spalte hineinquillt.

### 4. Verifikation

- Playwright-Skript unter `/tmp/browser/dc-transition/`: Video importieren → Auto-Cut deaktivieren, manuell splitten → Übergangs-Tile Fade wählen → Slider auf 1.5s → Screenshot links (Sidebar) + Preview.
- Console: kein Rebind-Spam, `resolveTransitions` liefert `duration ≈ 1.5`.

## Technical Details

Betroffene Dateien:

- `src/components/directors-cut/studio/sidebar/CutPanel.tsx` — TransitionBlock: Slider + Number-Input + +/−, Default-Duration-Normalisierung in `handleTransitionChange`.
- `src/components/directors-cut/studio/CapCutEditor.tsx` — Sidebar-Wrapper `min-w`, ScrollArea um Szenenliste, Timeline-Overlay-Marker für Übergänge (kleine JSX-Ergänzung im Timeline-Bereich, nutzt `resolveTransitions(scenes, transitions)` aus `@/utils/transitionResolver`).
- Keine Änderungen an `transitionResolver.ts` oder `useTransitionRenderer.ts` — die Rendering-Pipeline ist korrekt, nur der Duration-Input war unbrauchbar.

Kein Datenbank-Change, kein Edge-Function-Change. Rein Frontend.
