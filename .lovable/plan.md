# Fix-Plan v246 — KI-Prompt-Feld stabilisieren

## Diagnose

Das Feld ist ein kontrolliertes `<Textarea>` in `PromptMentionEditor`, dessen `value` direkt aus `scene.aiPrompt` kommt. In `SceneCard.tsx` gibt es **zwei Sync-Effekte, die während des Tippens den Prompt rewritten**:

1. **Zeile 683–718 (Action-Sync)** — depsArray enthält `scene.aiPrompt` selbst. Jeder Tastendruck → `onUpdate({aiPrompt})` → Effekt läuft erneut → `applyActionsToPrompt(...)` strippt `[SceneAction]`/`[CastActions]`-Marker und setzt sie neu → `onUpdate({aiPrompt: next})` überschreibt den vom User eben getippten Wert.
2. **Zeile 636–672 (Dialog-Sync)** — feuert bei jedem `scene.dialogScript`- oder `characters?.length`-Change und ruft `applyDialogToPrompt` → im Mittelblock des Prompts platziert.
3. **`SceneActionField` schiebt asynchron `sceneActionEn`** nach (Auto-Translate mit 500 ms Debounce). Das ist eine weitere externe Änderung, die Effekt #1 triggert, während der User im Prompt tippt.

Symptome dadurch:
- **Cursor springt ans Ende**: kontrollierter Textarea-Reset. React setzt selectionStart/End nicht zurück, wenn `value` in-place ausgetauscht wird.
- **Eintrag verschwindet**: getippter Text landet zwischen zwei Marker-Blöcken; `applyActionsToPrompt` schneidet den Bereich beim Re-Insert weg.

## Zielverhalten
Solange der User im `aiPrompt`-Feld tippt, darf **kein** externer Effekt den Wert rewritten. Erst nach Blur oder Idle (~600 ms) darf Marker-Re-Injection laufen. Der Rest der Pipeline (Dialog-Sync bei DB-Reload, Action-Marker nach Blur) bleibt unverändert.

## Änderungen

### 1. `PromptMentionEditor.tsx` — Local Draft Buffer + Caret Preservation
- Interner `draft`-State, initialisiert aus `value`.
- `onChange` schreibt sofort in `draft` und ruft `onChange(next)` upstream **direkt** (kein Debounce; upstream State bleibt Wahrheit für andere Panels).
- Ein `isEditingRef` (true zwischen `onFocus`/`onBlur`) wird auf `data-editing="true"` am Textarea gespiegelt, damit SceneCard das lesen kann.
- Wenn externes `value` sich ändert *während* `isEditingRef.current === true`, wird der eigene `draft` **nicht** überschrieben (Ausnahme: neuer Wert enthält `draft` als Prefix → Marker-Injection außerhalb der Editier-Region ist ok).
- Nach jedem externen `value`-Change, der doch übernommen wird: `selectionStart/End` restaurieren (aus dem letzten bekannten Caret-Offset relativ zum Textende).

### 2. `SceneCard.tsx` — Editing-Guard für Sync-Effekte
- Neuer Ref `promptEditingRef` (gesetzt via `onFocus`/`onBlur` in einer `<div>`, die den `PromptMentionEditor` umschließt — leichter als Callback-Prop).
- Effekt **Action-Sync** (Zeile 683–718):
  - `scene.aiPrompt` aus der DepsArray entfernen (Effekt reagiert nur noch auf externe Signale: `sceneActionEn`, `characterShots.actionEn`, `promptMode`, `characters?.length`).
  - Frühabbruch, wenn `promptEditingRef.current === true`.
  - Beim Blur des Feldes einmal manuell nachziehen (via `onBlur`-Callback).
- Effekt **Dialog-Sync** (Zeile 636–672): identischer Editing-Guard, ansonsten unverändert.

### 3. `SceneActionField.tsx` — Kein Effekt-Trigger während Prompt-Editing
- Kein Code-Change nötig. Die 500 ms Debounce-Translation ist ok; sie triggert Effekt #1 nur noch nach Blur des Prompts, weil der Guard aus (2) greift.

### 4. Regression-Test
- `src/components/video-composer/__tests__/PromptMentionEditor.test.tsx` (neu): simuliert Tippen mitten im String während `value` extern mit einer Marker-Injection überschrieben wird — erwartet: Cursor bleibt, Draft bleibt.

## Nicht-Ziele
- Kein Wechsel auf uncontrolled Textarea (würde `@`-Mention-Trigger komplizieren).
- Keine Änderung an `applyActionsToPrompt`/`applyDialogToPrompt` selbst.
- Kein Debounce des Upstream-`onChange` (würde @-Mention-Vorschläge verzögern).

## Technische Details (Ref)
- `promptEditingRef` wird als 3. optionales Prop an `PromptMentionEditor` durchgereicht (`onEditingChange?: (editing: boolean) => void`), damit SceneCard den Zustand kennt, ohne DOM-Attribute zu inspizieren.
- Caret-Restore-Strategie: nach jedem `setDraft(externalValue)`-Merge `ta.setSelectionRange(prevStart, prevEnd)` in `requestAnimationFrame`.

Nach Approval setze ich das um und ergänze den Regressionstest.