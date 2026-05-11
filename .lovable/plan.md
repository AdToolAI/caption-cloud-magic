## Stage 17b — Fused Studio Pane visuell aktivieren

### Problem
Stage 17 hat Filmstrip + StudioPane gebaut, aber im Pane wird `SceneCard` weiterhin **kollabiert** angezeigt, wenn die Szene bereits Inhalt hat (Prompt/Clip/Upload). User sieht nur eine dünne Zeile mit "Studio öffnen" — der Editor ist also weiterhin versteckt, genau das Gegenteil vom Ziel.

Ursache: `SceneCard` initialisiert `isExpanded = false`, sobald die Szene Inhalt hat (Zeile 242-249 in `SceneCard.tsx`). Im alten Stack-Layout war das richtig (scannbare Liste). Im neuen Split-Layout ist die ausgewählte Szene **immer** der Fokus → muss immer expandiert sein.

### Fix (rein visuell, keine Logik-Änderung)

**1. `SceneCard.tsx` — neuer Prop `embedded?: boolean`**
- Wenn `embedded={true}`:
  - `isExpanded` ist hart `true` (kein State, kein Toggle)
  - `SceneCardSummaryHeader` erhält `onToggleExpand={undefined}` und versteckt den Collapse-Chevron (kleine Anpassung in Header)
  - Outer `<Card>` Wrapper entfällt → nur `<div>` mit `space-y-4`, da StudioPane bereits den Glas-Container liefert. Verhindert doppelte Borders/Backgrounds.
  - `MoveUp`/`MoveDown`/`Delete` bleiben im Header (oder wandern später in StudioPane-Header — out of scope für jetzt).

**2. `StoryboardTab.tsx`**
- Bei der `SceneCard` im rechten Pane: `embedded` setzen.
- Im (Mobile-/Fallback-) Pfad bleibt `SceneCard` ohne `embedded` (falls später nötig).

**3. `StudioPane.tsx`**
- Padding leicht reduzieren (von `p-4` ggf. auf `p-3`), damit eingebettete `SceneCard` nicht überfüllt wirkt.
- Header-Zeile bleibt ("EDITOR · Szene X / Y · Hook").

**4. `SceneCardSummaryHeader.tsx`**
- Wenn `onToggleExpand` undefined → Chevron-Button nicht rendern, Header wird zur reinen Info-Zeile (Type-Badge, Dauer, Cost, Move-Buttons).

### Files
- `src/components/video-composer/SceneCard.tsx` — `embedded` Prop, hart-expanded Branch, Card-Wrapper konditional
- `src/components/video-composer/SceneCardSummaryHeader.tsx` — Chevron optional
- `src/components/video-composer/StoryboardTab.tsx` — `embedded` an `SceneCard` durchreichen
- `src/components/video-composer/StudioPane.tsx` — Padding-Tuning

### Out of Scope
Keine Änderungen an Tabs, Prompts, Cast Map, Render-Pipeline, Edge Functions, Mobile-Sheet-Fallback.

### Akzeptanz
- `/video-composer` → Tab Storyboard: rechter Pane zeigt sofort den vollen Editor (Tabs, Prompt-Feld, Style/Cast-Buttons) für die selektierte Szene — kein "Studio öffnen"-Klick mehr nötig.
- Klick auf andere Szene im Filmstrip → Editor wechselt instant.
- Keine doppelten Karten-Borders.