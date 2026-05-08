## Problem

Beim Klick auf "Voiceover generieren" im Storyboard-Tab erscheint die Toast "Bitte zuerst das Projekt speichern…". Ursache: Solange das Projekt noch nicht in der DB liegt, ist `project.id === ''`, und der eben eingebaute Guard in `SceneDialogStudio.handleGenerateInline` bricht ab. Der User soll aber nicht erst irgendwo "Speichern" klicken müssen – andere Aktionen (z. B. Clips generieren in `ClipsTab`) lösen automatisch `ensureProjectPersisted` aus.

## Lösung

Denselben Auto-Persist-Pfad wie in `ClipsTab` auf den Voiceover-Flow anwenden: Vor dem ElevenLabs-Aufruf einmalig persistieren, dann mit der frischen `projectId` (und ggf. neuer `scene.id`) weitermachen.

### Änderungen

**1. `VideoComposerDashboard.tsx`** – `onEnsurePersisted`-Prop an `StoryboardTab` durchreichen (analog zu ClipsTab, Zeilen 1110–1114).

**2. `StoryboardTab.tsx`** – `onEnsurePersisted?: () => Promise<{ projectId; scenes }>` als Prop entgegennehmen und an `SceneCard` weiterreichen.

**3. `SceneCard.tsx`** – Prop entgegennehmen und an `<SceneDialogStudio onEnsurePersisted={...} />` weiterreichen.

**4. `SceneDialogStudio.tsx`** – Neue optionale Prop `onEnsurePersisted`. In `handleGenerateInline` UND `handleGenerate`:
   - Zuerst `pid = (projectId || scene.projectId || '').trim()` berechnen.
   - Wenn leer und `onEnsurePersisted` vorhanden: `await onEnsurePersisted()` aufrufen, dann
     - `pid = result.projectId`
     - `sceneId = result.scenes.find(s => orderIndex/tempId match)?.id ?? scene.id` ermitteln (analog zu `ClipsTab` map-by-orderIndex)
   - Erst danach den `PROJECT_REQUIRED`-Guard greifen lassen.
   - `project_id: pid` und `scene_id: sceneId` im Insert verwenden.

**Out of scope:** Keine Edge-Function-Änderungen, keine DB-Migration, kein UI-Redesign. Nur Prop-Threading + zwei zusätzliche Persist-Calls in den beiden Voiceover-Pfaden.

### Erwartetes Verhalten danach

Klick auf "Voiceover generieren" in einem ungespeicherten Projekt → das Projekt wird im Hintergrund einmalig in der DB angelegt, die Szene erhält ihre echte `id`, dann läuft der ElevenLabs-Call sauber durch. Die Fehler-Toast erscheint nur noch, wenn `ensureProjectPersisted` selbst fehlschlägt (mit dem vorhandenen `formatError`-Helper als lesbare Meldung).