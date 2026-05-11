
# Storyboard v2 — Cinematic Filmstrip + Fused Studio Pane

## Ziel
Den Storyboard-Tab so umbauen, dass Kunden auf einen Blick **sehen** was jede Szene zeigt und der Editor nicht mehr versteckt ist. **Keine Features entfernen** – nur visuell fusionieren.

## Layout (neu)

```text
┌─ Storyboard-Tab ───────────────────────────────────────────────┐
│ Header: Titel + kompakte Cast-Map (Avatar-Dots)                │
├──────────────────────┬─────────────────────────────────────────┤
│  FILMSTRIP (col-4)   │  STUDIO-PANE (col-8, sticky)            │
│                      │                                         │
│  ▣ Szene 01  Hook    │  Szene 02 · Problem · KI Hailuo         │
│  ▣ Szene 02  ★aktiv  │  ┌─ Vorschau (16:9) ────────────────┐  │
│  ▣ Szene 03  Lösung  │  │  Frame oder Spinner              │  │
│  ▣ Szene 04  Demo    │  └──────────────────────────────────┘  │
│  ▣ Szene 05          │  Tabs: Prompt | Cast | Style | Mehr    │
│  + Add Scene         │  Render-Button (sticky bottom)         │
└──────────────────────┴─────────────────────────────────────────┘
```

- **Linke Spalte**: vertikaler Filmstrip mit `aspect-video` Thumbnails (Frame-First Cache → still / fallback Gradient + Type-Icon). Status-Pill, Type-Badge, Cast-Dots, Preis. Klick selektiert.
- **Rechte Spalte**: **persistenter Editor** der gewählten Szene, sticky beim Scrollen. Ersetzt den bisherigen `Sheet`-Trigger.
- Continuity-Hinweise (`1→2 Beide Clips müssen gerendert sein`) bleiben als dezenter vertikaler Connector zwischen Thumbnails im Filmstrip.

## Komponenten-Änderungen

### NEU
- **`StoryboardSceneStrip.tsx`** — Filmstrip-Liste links. Übernimmt `dnd-kit` Reorder + Add-Scene + Continuity-Connectors. Rendert je Szene ein `SceneStripTile`.
- **`SceneStripTile.tsx`** — Aspect-video Tile mit Thumbnail (Cache: scene_still_frames first variant), Type-Badge, Render-Status-Pill, Cast-Dots, Preis. Active-State = goldener Rahmen + Glow.
- **`StudioPane.tsx`** — Sticky rechte Spalte. Lädt für `selectedSceneId` den **bereits existierenden** `SceneStyleSheet`-Inhalt (3 Tabs: Stil/Cast/Mehr) **inline** statt im Sheet. Header mit Szenen-Titel + Render-Button.

### EDIT
- **`StoryboardTab.tsx`** — Layout-Refactor: ersetzt vertikale `SortableContext`-Liste durch `<div class="grid grid-cols-12 gap-6"><StoryboardSceneStrip class="col-span-4"/><StudioPane class="col-span-8 sticky top-4"/></div>`. State: `const [selectedSceneId, setSelectedSceneId] = useState(scenes[0]?.id)`. CastConsistencyMap kollabiert in einen kompakten Header-Chip mit Hover-Popover (Detail-Tabelle on demand).
- **`SceneCard.tsx`** — Behält gesamte Logik. Erhält neuen `variant="strip" | "full"`-Prop:
  - `"strip"` → rendert nur Thumbnail-Tile (für Filmstrip)
  - `"full"` → rendert die bisherige große Karte (Fallback / Mobile)
  - Inline-Tabs werden in `"full"` weiterhin gezeigt; im neuen Layout wird der `SceneStyleSheet`-Inhalt vom `StudioPane` ohne Sheet-Wrapper gemountet.
- **`SceneStyleSheet.tsx`** — Neuer Prop `embedded?: boolean`. Wenn `true`: rendert ohne `<Sheet>`/`<SheetContent>`-Wrapper, nur den Tab-Inhalt. Bestehender Sheet-Modus bleibt für Mobile.
- **`CastConsistencyMap.tsx`** — Neue kompakte Variante `<CastConsistencyMap variant="chip" />` für den Header (Avatar-Dots + "5 scenes · 2 cast"). Klick öffnet bestehende Tabelle als Popover.

### Mobile-Fallback
Unter `md` (< 768px): Filmstrip wird horizontal scrollend, StudioPane fällt zurück auf den alten Sheet-Trigger (kein toter Code – `embedded={false}` Pfad bleibt).

## Was unverändert bleibt
- Alle Edge Functions, Datenmodelle, Hooks (`useComposerHistoryContext`, `sceneToSnakeSnapshot`)
- Sämtliche Features in `SceneStyleSheet` (Frame-First, Shot Director, Modifier, Cast Picker, Style Presets, Cinematic-Sync)
- Render-Pipeline, Continuity Guardian, Talking-Head Dialog, Hybrid-Extend
- Drag-and-Drop Reorder (jetzt im Filmstrip)
- Cast Consistency Map als Daten – nur Darstellung kompakter

## Akzeptanzkriterien
1. Beim Öffnen von `/video-composer` Tab "Storyboard" ist der Editor der ersten Szene **sichtbar ohne Klick**.
2. Klick auf eine andere Szene im Filmstrip wechselt den Editor-Inhalt sofort, ohne Sheet-Animation.
3. Alle Buttons aus dem alten "Studio öffnen" Sheet sind im StudioPane vorhanden und funktional.
4. Reorder per Drag im Filmstrip funktioniert weiterhin.
5. Render-Status, Preis, Type, Cast-Dots auf jeder Tile sichtbar.
6. Mobile (< 768px): horizontaler Filmstrip + Sheet bleiben funktional.

## Out of Scope
- Inhaltliche Änderungen am `SceneStyleSheet` (separate Aufgabe falls gewünscht)
- Live-Generation während Editor offen (das ist ein Artlist-Feature für später)
- Workflow-Sidebar links von Storyboard bleibt unangetastet

