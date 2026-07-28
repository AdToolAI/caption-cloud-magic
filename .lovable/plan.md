## Ziel
Alle Hub-Karten (Planen, Optimieren, Analysieren, Erstellen, Team, Gaming) bekommen cinematische Cover-Bilder im Bond-Gold-Stil — wie die AI-Arsenal-Cards auf der Startseite. Gleichzeitig werden alle Karten in einer Reihe auf identische Höhe fixiert; längere Texte skalieren die Schriftgröße runter statt die Karte zu strecken.

## Umfang
- Nur `HubPage.tsx` (Layout + Cover-Slot) und `hubConfig.ts` (Cover-Zuordnung).
- 6 Hubs mit zusammen ~35 Sub-Items → 35 neue Cover-Bilder unter `src/assets/hub-covers/<hub>/<slug>.jpg`.
- Kein Backend, keine Logik-Änderung.

## Design pro Karte
```
┌──────────────────────────┐
│  Cover 16:9 (Bond-Gold)  │ ← neu, mit gold/cyan Glow-Overlay
│  + Icon-Chip oben links  │
├──────────────────────────┤
│  Titel (clamp 1 Zeile)   │
│  Beschreibung (clamp 2)  │ ← Schrift schrumpft dynamisch
└──────────────────────────┘
```
- Fixe Karten-Höhe via `h-full` auf `<Link>` + Grid mit `auto-rows-fr`.
- Cover: `aspect-video`, `object-cover`, dunkler Gradient-Overlay + Hover-Zoom (`scale-105`).
- Titel: `text-base font-semibold line-clamp-1`.
- Beschreibung: `text-[13px] leading-snug line-clamp-2` (kleiner als jetzt, damit kein Overflow bei langen Strings wie „GPT-5.5 Pro, Gemini 3.1 Pro & Claude 4.1 Opus…").
- Kein Zeilenumbruch-Sprung mehr: gleicher Rhythmus in allen Karten.

## Bild-Rezeptur (Bond-2028)
- Palette: Deep Black `#050816`, Gold `#F5C76A`, Cyan-Akzent.
- Jedes Cover thematisch: z. B. Analytics-Dashboard = holografische Chart-Wall, PostHog = Event-Stream-Konsole, Trend-Radar = Radar-Sweep, Music Studio = leuchtende Waveform, Cast & World = Character-Loadout, Video Composer = Timeline mit Fadenkreuz etc.
- Konsistente Framing/Grade wie die bestehenden `landing/ai-arsenal/gen/*` Assets.
- Generierung via `imagegen--generate_image` (fast tier, 1280×720), Ausgabe als `.jpg`.

## Änderungen
### `src/config/hubConfig.ts`
- `HubSubItem` erweitern um `cover?: string` (ES-Modul-Import-Pfad).
- Jedes der ~35 Items bekommt ein Cover zugewiesen.

### `src/pages/HubPage.tsx`
- Grid: `auto-rows-fr` ergänzen, Karten mit `flex flex-col h-full`.
- Card-Body: Cover-`<img>` in `aspect-video` Container mit Overlay + Icon-Chip absolute; darunter Textblock in `flex-1`.
- Text-Clamps + kleinere `desc`-Schrift.
- Bestehende Shimmer/Hover-Glow bleiben; kein Icon-Kasten mehr im Textteil (Icon wandert aufs Cover), so gewinnen wir die vertikale Konsistenz.

### Neue Assets
- `src/assets/hub-covers/planen/*.jpg` (4)
- `.../optimieren/*.jpg` (7)
- `.../analysieren/*.jpg` (5)
- `.../erstellen/*.jpg` (18)
- `.../team/*.jpg` (4)
- `.../gaming/*.jpg` (1)

## Nicht-Ziele
- Keine neuen Routen, keine Text-/Übersetzungs-Änderung an den Karten-Labels.
- Keine Änderung am Sidebar-Navigations-Aufbau selbst.
- Startseite bleibt unverändert.

## Verifikation
- `tsgo` grün.
- Preview auf `/hub/analysieren`, `/hub/erstellen`, `/hub/optimieren` prüfen: alle Karten gleiche Höhe, Cover sichtbar, kein Text-Overflow.
