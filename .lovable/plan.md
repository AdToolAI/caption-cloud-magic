# Fix v3: „Endframe" → automatisch Luma Ray 2

## Kernidee (nach User-Feedback)
Statt „Endframe" bei manchen Modellen zu verstecken/deaktivieren, wird der **Toggle selbst die treibende Kraft**:

- User klickt **„Endframe"** → **Warn-Dialog** erscheint: *„Endframe ist nur mit Luma Ray 2 möglich. Modell jetzt wechseln?"* [Abbrechen] [Zu Luma Ray 2 wechseln]
- Bei Bestätigung → Modell wird automatisch auf `luma-ray-2` gesetzt, Placement bleibt `end`.
- Solange Placement = `end` ist → **alle anderen Modelle im Modell-Picker sind ausgegraut** mit Tooltip *„Endframe wird nur von Luma Ray 2 unterstützt. Placement zurück auf ‚Startframe' setzen, um andere Modelle zu wählen."*

Damit gibt es keine ungültige Kombination mehr, und der User versteht sofort, warum die Auswahl eingeschränkt ist.

## Änderungen

### 1. `src/config/aiVideoModelRegistry.ts`
- `endFrame: true` **nur** bei Luma Ray 2 behalten.
- **Entfernen** bei: `kling-3-standard`, `kling-3-pro`, `pika-2-2-standard`, `pika-2-2-pro` (fälschlich gesetzt, verursacht `E006`-Fehler).
- Neues Flag `anchorOnly: true` bei **Vidu Q2** und **Kling 3 Std/Pro** (echte Subject-Reference ohne erzwungenen First-Frame).

### 2. `src/components/ai-video/ToolkitGenerator.tsx`

**a) Placement-Toggle-Klick auf „Endframe":**
- Wenn aktuelles Modell ≠ Luma Ray 2 → `<AlertDialog>` öffnen:
  - Titel: *„Endframe nur mit Luma Ray 2"*
  - Text: *„Die Endframe-Funktion ist ausschließlich mit Luma Ray 2 verfügbar. Möchtest du jetzt zu Luma Ray 2 wechseln?"*
  - Buttons: [Abbrechen] / [Zu Luma Ray 2 wechseln]
- Bei Bestätigung: `setModel(LUMA_RAY_2)` + `setReferencePlacement('end')`.
- Bei Abbruch: Placement bleibt auf `'start'`.

**b) Modell-Picker sperren, solange `placement === 'end'`:**
- Alle Modelle außer Luma Ray 2 werden im Model-Selector visuell disabled (opacity + not-allowed) mit Tooltip.
- Alternativ (falls ein User trotzdem klickt): Zweiter kleiner Toast *„Placement erst auf ‚Startframe' zurücksetzen"*.

**c) `useEffect` beim Modellwechsel:**
- Wenn User das Modell doch manuell wechselt und `placement === 'end'` && neues Modell hat `!capabilities.endFrame` → Placement automatisch auf `'start'` zurück + Info-Toast *„Placement wurde auf Startframe zurückgesetzt, da {Modellname} keinen Endframe unterstützt."*

**d) Analog für „Nur als Anker":**
- Klick auf „Anker" bei Modell ohne `anchorOnly` → analoger Dialog:
  - *„Anker-Modus ist nur mit Vidu Q2 oder Kling 3 verfügbar. Möchtest du zu Vidu Q2 wechseln?"*
  - Buttons: [Abbrechen] / [Zu Vidu Q2 wechseln] / [Zu Kling 3 Pro wechseln]

**e) Submit-Guard (Safety-Net):**
- Falls trotz UI-Sperre `placement='end'` && Modell ≠ Luma → hartes Abbrechen mit Toast, keine Anfrage senden.

### 3. Body-Routing (bleibt wie v2)
- `placement='start'` → `startImageUrl`
- `placement='end'` (nur Luma) → `endImageUrl`, kein `startImageUrl`, `compose-scene-anchor` überspringen
- `placement='anchor'` → `referenceImages[]` (Vidu/Kling)

## Betroffene Dateien
- `src/config/aiVideoModelRegistry.ts` — Capability-Flags korrigieren
- `src/components/ai-video/ToolkitGenerator.tsx` — Warn-Dialog, Auto-Switch, Model-Picker-Sperre, useEffect-Guard, Submit-Safety-Net

## Verifikation
1. Beliebiges Modell (z.B. Kling 3 Pro) → Klick „Endframe" → Popup erscheint → „Zu Luma Ray 2 wechseln" → Modell wechselt, Placement = end.
2. Placement = end aktiv → alle Modelle außer Luma Ray 2 im Picker sind ausgegraut.
3. Placement zurück auf „Startframe" → alle Modelle wieder wählbar.
4. Generieren mit Luma Ray 2 + Endframe → Video endet auf Referenzbild, kein Startframe-Duplikat, kein `E006`-Fehler mehr.
5. Klick „Anker" bei Hailuo → Popup schlägt Vidu Q2 / Kling 3 vor.
