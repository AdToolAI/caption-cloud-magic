
# Universal Cut — Tiefenanalyse & Redesign-Plan

## 1. Was heute nicht funktioniert (Analyse anhand deines Screenshots)

| Problem | Konkret sichtbar | Warum es weh tut |
|---|---|---|
| **Zwei getrennte Welten** | Links "Szenen (0)" Liste + "Am Playhead teilen"-Button, unten separate Timeline mit "+"-Kachel. Beide zeigen "dasselbe" aber unabhängig. | User muss zwischen zwei mentalen Modellen wechseln — Szenen-Kartenliste ≠ Timeline. In CapCut/Premiere/Descript gibt es **nur die Timeline**. |
| **Schneiden vs. Hinzufügen kollidieren** | "Am Playhead teilen" liegt in der Sidebar, "Video hinzufügen" auch. Timeline-Track hat sein eigenes "+" Placeholder. | Keine klare Aktion "wo passiert was". |
| **Timeline ist visuell tot** | Videotrack zeigt nur ein leeres Kästchen mit ⊕ statt Szenen-Thumbnails auf Zeitachse. Keine Waveform sichtbar (Audio-Tracks kollabiert als "O…", "V…", "M…"). | Man sieht nicht **was man schneidet**. Top-Tier Editors zeigen Thumbnail-Strip + Waveform als Primäransicht. |
| **Preview + Werkzeug getrennt** | Player oben, Timeline unten, Tools links, Properties rechts → 4 Panels, jedes ~25%. | Zu viele Blickzentren. CapCut löst das mit **3-Panel-Layout**: Media/AI (klein links), Preview (groß mittig-oben), Timeline (breit unten), Properties (kontextuell rechts, sonst versteckt). |
| **Master Volume immer sichtbar, "Select clip to edit"** | Properties-Panel ist "leer" bis man klickt → 25% Screen-Real-Estate verschwendet. | Properties sollte **kontextuell einklappbar** sein (wie Premiere Essential Panels / CapCut). |
| **"Schritt-Wizard" für einen NLE** | Die Sidebar links suggeriert lineare Schritte (Schnitt → Effekte → Farbe → …). | Ein Editor ist **nicht linear** — man iteriert. Descript & CapCut haben *einen* Arbeitsplatz mit Tabs für Werkzeugkategorien, nicht einen Wizard. |
| **Keine "Insert"-Semantik** | Man kann nicht in der Mitte einer Szene ein neues Video droppen — "Video hinzufügen" hängt ans Ende. | Ripple-Insert am Playhead ist Basiskompetenz jedes NLEs. |
| **Kein Drag-Handle-Feedback** | Snap-Toggle sichtbar, aber keine Trim-Handles, keine Ripple/Roll-Edit-Hover-States. | User sieht nicht, was greifbar ist. |

## 2. Wie Top-Tier Programme es lösen

```text
CAPCUT WEB / DESKTOP
┌──────────────┬────────────────────────────────────┬─────────────┐
│ Media | AI   │           PREVIEW (groß)            │ Properties  │
│ Text | Music │                                     │ (nur wenn   │
│ Filter | FX  ├─────────────────────────────────────┤  Clip aktiv)│
│              │  TIMELINE  V2 ▓▓▓▓                  │             │
│              │            V1 ██████▓▓▓█████        │             │
│              │            A1 ~~~~~~~~waveform~~~~  │             │
│              │            A2 (music) ~~~~~~~~~     │             │
└──────────────┴─────────────────────────────────────┴─────────────┘
Toolbar über Timeline: [Select][Split ⌘K][Ripple][Delete][+Track][Zoom]
```

**Descript**: Text = Timeline (Word-Editor-Metapher). Cuts durch Textlöschen. Preview + Text + Timeline immer sichtbar.
**Premiere Pro**: Source/Program-Monitor, Timeline, Project-Bin. Werkzeuge als Toolbar-Icons (V/A/B/C/S…), kein Wizard.
**Runway**: Sehr minimaler NLE — nur Timeline + Preview + AI-Panel rechts. Keine "Schritte".
**DaVinci Resolve**: Page-Tabs (Cut/Edit/Fusion/Color/Fairlight/Deliver) — aber jede Page ist ein **vollwertiger Arbeitsplatz**, nicht ein Wizard-Schritt.

**Gemeinsamer Nenner:** Timeline ist die Bühne. Alle anderen Panels sind Werkzeugkästen die *auf* die Timeline wirken.

## 3. Redesign — "Universal Cut Studio v2"

### Layout (ein einziger Arbeitsplatz, keine Wizard-Schritte mehr für Schnitt/FX/Farbe)

```text
┌─ Top Bar: Projekt | Undo/Redo | Auto-Cut ✨ | Auto-Voiceover ✨ | Render ▸ ─┐
├──────────┬────────────────────────────────────────────┬──────────────────┤
│ LIBRARY  │              PREVIEW PLAYER                 │  INSPECTOR       │
│ • Medien │                                             │  (kontext.)      │
│ • AI     │                                             │  ─ Clip Props    │
│ • Text   │                                             │  ─ Farbe         │
│ • Musik  ├─── Toolbar ─────────────────────────────────┤  ─ Audio         │
│ • FX     │ [⇢Select][✂Split S][🗑][+Video][+Text][🎵][↔Zoom]│  ─ FX / Motion│
│ • Filter │                                             │  ─ Transition    │
│          ├─── TIMELINE (der Star) ─────────────────────┤                  │
│          │ V2 ────                                     │  (leer wenn      │
│          │ V1 [thumb][thumb][thumb][thumb][thumb]      │   nichts aktiv)  │
│          │ A1 ~~waveform Voiceover~~~~~~~              │                  │
│          │ A2 ~~waveform Musik~~~~~~~~~                │                  │
│          │ SUB [Untertitel-Chips]                      │                  │
└──────────┴─────────────────────────────────────────────┴──────────────────┘
```

### Kern-Verbesserungen

1. **Wizard → Arbeitsplatz.** Sidebar-Schritte "Schnitt / Effekte / Farbe / Audio / Export" werden zu **Library-Tabs links** (Medien, Effekte, Farbe, Audio, Untertitel) + **Inspector-Tabs rechts** (Props, Farbe, Audio, Motion, Transition). Nur "Import" und "Export" bleiben eigene Modi (Enter-/Exit-Punkt).
2. **Timeline zeigt echte Thumbnails** pro Szene (statt leerer ⊕-Kachel). Bei 0 Szenen: **großer Drop-Zone-Placeholder über die ganze Timeline-Breite** mit "Video droppen · Datei wählen · Aus Bibliothek".
3. **Toolbar direkt über der Timeline** mit 7 Kern-Werkzeugen als Icons + Kürzel:
   - `V` Auswählen · `S/⌘K` Split am Playhead · `Del` Löschen · `+` Video/Bild/Text/Audio-Insert · `↔` Ripple · `🔍` Zoom · `📍` Snap.
   - "Am Playhead teilen" verschwindet als riesiger Button aus der Sidebar — wird `S`-Shortcut + Icon.
4. **Insert am Playhead** (nicht nur "am Ende"): Wenn User in Library einen Clip klickt oder droppt, wird er **an Playhead-Position** eingefügt und alles rechts davon ripplet. Descript & CapCut-Pattern.
5. **Trim/Split-Affordance sichtbar:** Beim Hover auf Clip-Kante zeigt Cursor `↔`, Playhead-Line beim Hover über Timeline zeigt Ghost-Split-Marker "S zum Schneiden".
6. **Waveforms & Multi-Track ausklappbar** — Tracks `V1`, `A1 (VO)`, `A2 (Musik)`, `Sub` sind IMMER sichtbar mit Waveforms, keine "O…/V…/M…"-Abkürzungen mehr. Höhe: 56px pro Track, kollabierbar auf 24px.
7. **Inspector-Panel autohide.** Bis ein Clip ausgewählt ist → Inspector kollabiert zu 32px-Rand mit Tabs-Icons. Beim Klick auf Clip → expandiert auf 320px. "Master Volume" wandert dort hin (Global-Tab).
8. **Auto-Cut & Auto-VO als Top-Bar-CTAs** (nicht in Sidebar versteckt). Ein Klick → Progress-Toast → Timeline füllt sich.
9. **Onboarding-Coachmarks** (einmalig): 4 Punkte-Tour "Das ist die Timeline · Hier splittest du · Hier fügst du ein · Hier renderst du".
10. **Leerer Zustand** (heute: einsames ⊕-Kästchen mittendrin) → **Full-Timeline Hero-Empty-State** mit 3 großen CTAs:
    - "🎬 Video hochladen"  ·  "✨ Aus AI Video Studio importieren"  ·  "📥 Aus Media Library"

### UX-Details die den Unterschied machen

- **Playhead-Chip** über Timeline zeigt live `00:03.42 · Szene 2/5`.
- **Clip-Kontextmenü** (Rechtsklick): Split · Duplicate · Speed · Reverse · Detach Audio · Replace · Delete Ripple.
- **Keyboard-Cheatsheet-Overlay** mit `?`.
- **"Was passiert wo"-Farbcode**: Video-Tracks Cyan, Audio-Tracks Gold, Text/Sub Weiß, Transitions als lila Diamanten zwischen Clips.
- **Dark-Only Bond-2028-Look bleibt** — nur Layout ändert sich, keine neuen Farb-Tokens.

## 4. Umsetzungs-Wellen (klein & inkrementell, ohne Big-Bang)

**Welle 1 — Layout-Foundation (unsichtbar für User bis ausgerollt)**
- Neue Shell `UniversalCutStudio.tsx` mit 3-Panel-Grid (Library / Center / Inspector), Feature-Flag `uc_studio_v2`.
- Bestehende Wizard-Schritte bleiben unter Feature-Flag `off` weiter erreichbar.

**Welle 2 — Timeline-Upgrade**
- Thumbnail-Strip auf V1 (aus vorhandenen `SceneThumbnailBar.tsx`).
- Waveforms für A1/A2 immer sichtbar (aus `WaveformDisplay.tsx`).
- Empty-State Hero-Drop-Zone.
- Toolbar über Timeline mit 7 Werkzeugen + Shortcuts.

**Welle 3 — Interaktion**
- Insert-am-Playhead (Ripple).
- Trim-Handles + Hover-Ghost-Split.
- Rechtsklick-Kontextmenü.
- Inspector-Autohide.

**Welle 4 — Onboarding & Polish**
- 4-Step Coachmarks (einmal pro User via localStorage).
- Playhead-Chip, Keyboard-Cheatsheet (`?`).
- Auto-Cut/Auto-VO-CTAs in Top-Bar.

**Welle 5 — Migration**
- Feature-Flag default `on`, alter Wizard nur noch über `?legacy=1`.
- Nach 2 Wochen ohne Bug-Reports: Legacy-Wizard entfernen.

## 5. Technische Notizen (für später)

- Wiederverwendbar sind: `MultiTrackTimelinePro.tsx`, `WaveformDisplay.tsx`, `SceneThumbnailBar.tsx`, `useKeyboardShortcuts`, `DirectorsCutPreviewPlayer`, `SceneCard` (als Inspector-Card).
- Neu zu bauen: `UniversalCutStudio.tsx` (Shell), `EditorToolbar.tsx`, `LibraryPanel.tsx` (Tabs), `InspectorPanel.tsx` (Tabs, autohide), `TimelineEmptyState.tsx`, `PlayheadChip.tsx`, `EditorCoachmarks.tsx`.
- Kein Business-Logic-Umbau — Render-Pipeline, Snake-Case-Export-Payload, WYSIWYG-Parity, Lambda-Config, Boundary-Marker bleiben unverändert.
- Persistence: aktueller Draft-State ist bereits im `directors_cut_projects`/sessionStorage — kein Schema-Change nötig.

## 6. Frage vor Start

Bevor ich losbaue: Willst du (a) **die volle 5-Wellen-Redesign-Route** (~2-3 Tage Arbeit, ersetzt den Wizard schrittweise), oder (b) **erstmal nur Welle 1+2** (neuer Editor-Look mit besserer Timeline, Wizard-Sidebar bleibt sichtbar) als Machbarkeits-Sprint, oder (c) **einen Quick-Fix**: nur Empty-State + Toolbar + Insert-am-Playhead im existierenden Layout ohne Shell-Umbau?
