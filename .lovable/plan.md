## Problem

Der sticky Pipeline-Ladebalken (`PipelineProgressBar` + `usePipelineProgress`) zeigt für die neue Dialog-Shot-Pipeline keinen Lipsync-Fortschritt mehr an. Grund: `usePipelineProgress.lipsyncReal.running` hängt an einem `hasRealJob`-Check, der nur die alte Two-Shot-Architektur kennt (`replicate_prediction_id` startet mit `sync:` oder `audio_plan.twoshot.syncJobs`). Die neue Pipeline schreibt stattdessen `composer_scenes.dialog_shots = { status, shots[] }` und setzt `replicate_prediction_id` nicht mehr auf `sync:...`. Folge: die Phase springt von "idle" direkt auf "done" (oder bleibt unsichtbar), obwohl Hailuo-Plate + Sync.so-Turns aktiv sind. Die Events (`lipsync:start/end`) feuern bereits korrekt aus `useTwoShotAutoTrigger` und `SceneDialogStudio` — nur die State-Ableitung ist veraltet.

## Umsetzung (nur Frontend)

1. **`usePipelineProgress.ts` — Dialog-Shot-Pipeline als gültige Lipsync-Quelle anerkennen**
   - `hasRealJob(s)` erweitern: auch `true`, wenn `s.dialogShots?.shots?.length > 0` und der globale `dialog_shots.status` nicht `done`/`failed` ist.
   - `lipsyncReal.running` zusätzlich `true`, wenn irgendeine Cinematic-Sync-Szene `dialog_shots.status` in `pending` | `composing` | `polling` hat oder mindestens ein Shot in `generating` | `generated` | `lipsyncing` ist.
   - `lipsyncReal.done` zusätzlich, wenn `dialog_shots.status === 'done'` für alle relevanten Szenen.
   - `lipsyncReal.failed` zusätzlich, wenn `dialog_shots.status === 'failed'`.
   - **Feinkörniger Fortschritt:** Statt nur Szenen-Granularität — wenn Dialog-Shots vorhanden sind, Progress über `Σ ready_shots / Σ total_shots` aller Cinematic-Sync-Szenen berechnen (analog zur Baseline-Logik), damit der Balken pro abgeschlossenem Turn weiterläuft, nicht erst pro fertiger Szene.
   - Baseline-Capture beim `lipsync:start` ergänzen: `dialogShotsBaseline = { readyShots, totalShots }`.

2. **`SceneClipProgress.tsx` — kleines Polish**
   - `DialogShotsBar` ist heute nur sichtbar, solange `clipStatus === 'generating'`. Anzeige zusätzlich aktivieren, wenn `clipStatus === 'ready'` aber `dialog_shots.status !== 'done'` (Phase Lipsync läuft auf fertigem Master). Aktuell wird nur das kleine "Lip-Sync läuft"-Overlay gezeigt — der Fortschrittsbalken pro Shot fehlt in dieser Phase. Lösung: `DialogShotsBar` zusätzlich im `hqReady`-Pfad rendern, wenn `showDialogOverlay`-Bedingung erfüllt ist.

3. **Sanity-Check**
   - Keine Änderungen an Edge Functions, DB oder Pipeline-Events nötig — Trigger emittieren bereits `lipsync:start/end`.
   - Keine neuen Felder. Liest nur bestehendes `composer_scenes.dialog_shots`.

## Dateien

- `src/hooks/usePipelineProgress.ts`
- `src/components/video-composer/SceneClipProgress.tsx`

## Validierung

- Cinematic-Sync-Szene starten → globaler Balken muss in Phase "Lipsync" auf `running` springen, sobald `dialog_shots` befüllt sind.
- Pro fertigem Shot sollte der Lipsync-Phasenfortschritt sichtbar weiterlaufen (z. B. 1/3 → 2/3 → 3/3).
- Bei `dialog_shots.status = 'done'` Phase auf `done` (grün, 100 %).
- Bei `dialog_shots.status = 'failed'` Phase auf `failed` (rot).
