## Was das Problem wirklich ist

Zwei separate Overflow-Bugs, die zusammen den Eindruck "die Spalte zieht in die Breite und schneidet Text ab" erzeugen:

### Bug A — Icon-Rail (die schmale 56 px Spalte ganz links)

`src/components/studio-shell/StudioSidebarTabs.tsx` rendert unter jedem Icon ein Text-Label (`SCHNITT`, `LOOK & FARBE`, `EFFEKTE`, `UNTERTITEL`, `AUDIO`, `EXPORT`, `EINSTELLUNGEN`). Bei 56 px Spaltenbreite mit 9 px `uppercase tracking-wide` passen nur ~6 Zeichen pro Zeile — `line-clamp-2 break-words` bricht bei Leerzeichen, findet aber bei „UNTERTITEL", „EINSTELLUNGEN" und „EFFEKTE" keine sinnvolle Bruchstelle. Ergebnis: horizontal abgeschnitten, wie im Screenshot sichtbar (`UNTERT`, `LOOK &`, `EFFEKT`).

Der professionelle Standard (CapCut, Premiere, DaVinci Resolve, Figma, VS Code) ist an dieser Stelle: **Icon-only Rail mit Tooltip on Hover** — keine Textlabels unter dem Icon. Das ist keine Kompromisslösung, das ist die Referenz-Lösung.

### Bug B — Untertitel-Liste zwingt die ganze Sidebar in die Breite

`src/components/directors-cut/studio/CapCutSidebar.tsx` Zeilen 1616-1644 (Tab „Untertitel" → „Generated Captions Preview"):

- Der ScrollArea steht auf `overflow-x-auto` und der innere Container auf `min-w-[260px]`.
- Jede Caption-Zeile hat `whitespace-nowrap` — der eingegebene Text bleibt zwingend einzeilig.
- Das darunter liegende `<p className="line-clamp-2">` erbt `white-space: nowrap`, `line-clamp` greift nicht.

Effekt: Sobald der User einen langen Untertitel eingibt, dehnt die Zeile den inneren Container aus, der horizontale Scrollbalken erscheint, und optisch wirkt es, als würde die ganze linke Spalte in die Breite schießen und Text abschneiden — genau der Screenshot-Zustand.

Der Preview-Player-Fix aus dem letzten Turn ist davon nicht betroffen und bleibt bestehen.

## Fix — 2 Dateien

### 1. `src/components/studio-shell/StudioSidebarTabs.tsx` — Icon-only Rail

- Text-Label `<span>` unter dem Icon **entfernen** (sowohl für die normalen Tabs als auch für den Settings-Tab).
- Icon-Größe von `h-[18px] w-[18px]` → `h-5 w-5` (mehr Präsenz, wenn kein Label mehr da ist).
- Vertikales Padding auf `py-3` erhöhen und `min-h-[48px]` — ergibt gleichmäßige, quadratisch wirkende Buttons.
- Jedes `<TabsTrigger>` in einen Radix-`<Tooltip>` (`side="right"`) einwickeln, der das Label anzeigt — dieselben Tooltip-Primitives, die schon in `AppSidebar.tsx` verwendet werden.
- Count-Badge bleibt unverändert oben rechts.
- Active-State (gold left-border + Glow) bleibt exakt wie bisher.

### 2. `src/components/directors-cut/studio/CapCutSidebar.tsx` — Untertitel-Liste

Zeilen 1616-1644:

- `<ScrollArea>`: `max-h-48 overflow-x-auto` → `max-h-48` (nur vertikal). `<ScrollBar orientation="horizontal" />` entfernen.
- Inner `<div>`: `min-w-[260px]` **entfernen**, stattdessen `w-full min-w-0`.
- Caption-Zeile `className`: `whitespace-nowrap` → `whitespace-normal break-words`.
- `<span>` mit Zeitstempel bekommt `block` (statt inline), damit der Text darunter sauber umbricht.
- `<p className="line-clamp-2">` bleibt — greift dann korrekt, weil `white-space: normal` gilt.

Als Defense-in-Depth: auf der ScrollArea in Zeile 924 (`<ScrollArea className="flex-1 min-w-0">`) zusätzlich `overflow-hidden` gegen künftige Kindkomponenten, die versuchen zu expandieren.

## Nicht angefasst

- Preview-Player / Ping-Pong-Slot-Swap (letzter Fix bleibt aktiv).
- Render-Pipeline, Remotion-Templates, Edge Functions.
- Timeline-Component, Waveforms, Transitions.
- Andere Tabs (Cut / Look / FX / Audio / Export) — dort gibt es kein `whitespace-nowrap` mehr.

## Verifikation

1. Untertitel-Tab öffnen, einen sehr langen Text (>100 Zeichen) in eine Caption eingeben → Text bricht auf 2 Zeilen um, danach `…` via `line-clamp-2`. Die Sidebar bleibt exakt so breit wie vor der Eingabe. Kein horizontaler Scrollbalken mehr.
2. Icon-Rail: alle 7 Tabs zeigen nur noch das Icon. Hover auf jedem Tab → Radix-Tooltip rechts mit vollem Label („Schnitt", „Look & Farbe", „Effekte", „Untertitel", „Audio", „Export", „Einstellungen"). Count-Badge bleibt sichtbar.
3. Regression: `AppSidebar` (Hub-Sidebar) unverändert. Andere Studio-Tabs (Cut, Look, FX, Audio, Export) unverändert. Preview-Player-Übergänge weiterhin ohne Ruckler.

## Betroffene Dateien

- `src/components/studio-shell/StudioSidebarTabs.tsx` (~30 Zeilen Umbau)
- `src/components/directors-cut/studio/CapCutSidebar.tsx` (5 Zeilen: 924, 1616, 1617, 1628, 1644)
