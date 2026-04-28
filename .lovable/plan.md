## Problem

Wenn du im **Storyboard** den KI-Prompt (oder Prompt-Slots / Shot-Director / Director-Modifiers) einer Szene manuell bearbeitest, landet die Änderung **nur im lokalen React-State**. Sie wird nicht in die Datenbank geschrieben. Folgen:

1. **Beim Wechsel zu „Clips" → „Generieren"**: Der erste Render benutzt noch den lokalen Wert (richtig), aber die DB bleibt veraltet.
2. **Beim Zurückwechseln ins Storyboard** (oder Reload): Der `VideoComposerDashboard` synchronisiert Szenen aus der DB. Da `ai_prompt` dort noch den alten Wert hat, **überschreibt die DB-Hydration deine Änderung** und du siehst wieder den ursprünglichen Prompt.

### Ursache (technisch)

- `setScenes` in `VideoComposerDashboard.tsx` aktualisiert nur `useState`, kein DB-Write.
- `ensureProject()` in `ClipsTab.tsx` macht ein Short-Circuit, sobald `projectId` existiert — es ruft `ensureProjectPersisted` (das `ai_prompt` updaten würde) **nicht erneut** auf.
- Die Hydration-Logik in `VideoComposerDashboard.tsx` (Zeilen 285–331) bevorzugt DB-Werte: `aiPrompt: row.ai_prompt ?? local?.aiPrompt` — der DB-Wert gewinnt also immer.

## Lösung

Storyboard-Edits müssen **debounced** in die DB geschrieben werden, sobald ein Projekt persistiert ist. Außerdem soll vor jedem „Generieren"-Klick sichergestellt werden, dass die DB den aktuellen Stand kennt.

### 1. Debounced Scene-Persistence im Dashboard

In `src/components/video-composer/VideoComposerDashboard.tsx`:

- Neuen `setScenes`-Callback so erweitern, dass er — analog zur bestehenden `updateAssembly`-Logik (`assemblyPersistTimer`) — einen Timer (`scenesPersistTimer`, ~600ms) startet.
- Nach Ablauf des Timers werden für alle Szenen mit echter UUID die editierbaren Felder per `supabase.from('composer_scenes').update(...)` geschrieben:
  - `ai_prompt`, `prompt_slots`, `prompt_mode`, `prompt_slot_order`
  - `director_modifiers`, `shot_director`, `applied_style_preset_id`, `cinematic_preset_slug`
  - `reference_image_url`, `text_overlay`, `transition_type`, `transition_duration`
  - `duration_seconds`, `clip_source`, `clip_quality`, `stock_keywords`, `character_shot`
- **Wichtig**: `clip_url` und `clip_status` werden hier **nicht** überschrieben (die kommen aus dem Render-Webhook).
- Persistenz nur auslösen, wenn `project.id` existiert (sonst still im LocalState halten — wird beim ersten „Generieren" via `ensureProjectPersisted` einmalig komplett geschrieben).

### 2. Force-Persist vor Clip-Generierung

In `src/components/video-composer/ClipsTab.tsx` `ensureProject()`:

- Short-Circuit `if (projectId) return { projectId, scenes }` entfernen.
- Stattdessen **immer** `onEnsurePersisted()` aufrufen, damit die aktuellen Storyboard-Edits garantiert in der DB liegen, bevor `compose-video-clips` läuft.
- Falls keine UUID vorhanden ist, läuft der bestehende Insert-Pfad; falls vorhanden, läuft der Update-Pfad in `useComposerPersistence`.

### 3. Sofortiges Flush beim Tab-Wechsel

In `VideoComposerDashboard.handleTabChange`:

- Bevor der bestehende Re-Fetch beim Wechsel auf `'clips'` läuft, eventuell offene `scenesPersistTimer` **synchron flushen** (Timer canceln + Persist sofort ausführen). So überschreibt der nachfolgende `select('clip_status, clip_url, cost_euros')` den Prompt nicht versehentlich (er liest diese Felder ohnehin nicht — aber so ist garantiert, dass DB & Lokal übereinstimmen).
- Optional gleicher Flush beim Wechsel **weg vom Storyboard** und beim Unmount, damit `saveDraft`/Hydration-Reihenfolge konsistent bleibt.

### 4. (Defensiv) Hydration-Konflikt entschärfen

In der DB-Hydration in `VideoComposerDashboard.tsx`: Da nach Schritt 1–3 DB & Local immer synchron sind, ist die bisherige `row.ai_prompt ?? local?.aiPrompt`-Regel unkritisch. Keine Änderung nötig.

## Geänderte Dateien

- `src/components/video-composer/VideoComposerDashboard.tsx` — Debounced Scene-Persist + Flush-on-tab-change
- `src/components/video-composer/ClipsTab.tsx` — `ensureProject` ruft `onEnsurePersisted` immer auf

## Verifikation

1. Prompt im Storyboard bearbeiten → ~1s warten → kurz weg vom Tab und zurück → Prompt bleibt erhalten.
2. Prompt bearbeiten → direkt zu „Clips" → „Neu generieren" → neuer Render benutzt die Änderung.
3. Browser-Reload nach Edit → Storyboard zeigt den editierten Prompt.