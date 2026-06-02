## Problem

Die in v20 nachgerüsteten Buttons **„🗑 Lipsync komplett zurücksetzen"** und **„🔁 Lip-Sync neu rendern"** sitzen in `SceneCard.tsx` (Zeilen 1796–2150) in einem Block, der dreifach versteckt ist:

```ts
secondaryOpen                                      // "Mehr ▾" muss aufgeklappt sein
  && scene.clipSource.startsWith("ai-")
  && (scene.characterShot?.shotType ?? "absent") !== "absent"
```

In deinen Screenshots ist „Mehr ▾" geschlossen → die Buttons existieren im DOM gar nicht. Die in der letzten Iteration aufgeweichte `lipSyncAppliedAt || lipSyncStatus || dialogShots …` Bedingung greift nie, weil das umschließende `secondaryOpen`-Gate vorher schon false ist.

Zusätzlich passen die Buttons konzeptionell nicht in den „Lip-Sync zum Voiceover"-Toggle (das ist der EIN/AUS-Schalter), sondern in den **AUDIO & VOICEOVER**-Block, wo auch „3 Dialog-Shots in echte Szene rendern" lebt — genau dort suchst du sie laut Screenshot.

## Plan

### 1. Neue „Lip-Sync Aktionen"-Toolbar im AUDIO-Block

In `SceneCard.tsx` direkt **unter** dem `Dialog-Shot Pipeline`-Info-Banner und **neben** dem „3 Dialog-Shots in echte Szene rendern"-Button eine kompakte Toolbar einsetzen, sichtbar sobald **irgendein** Lipsync-Artefakt existiert:

```ts
const hasLipsyncArtifact =
  !!scene.lipSyncAppliedAt ||
  !!scene.lipSyncStatus ||
  !!(scene as any).dialogShots ||
  !!(scene as any).twoshotStage ||
  scene.engineOverride === "cinematic-sync";
```

Toolbar enthält genau die zwei Buttons, die du suchst:

- **🔁 Lip-Sync neu rendern** — wiederverwendet den bestehenden Handler aus Zeile ~1934 (clip_url/dialog_shots/reference_image_url/lip_sync_* clearen, dann `compose-dialog-scene` aufrufen). Disabled wenn `lipSyncStatus === "running"`.
- **🗑 Lipsync komplett zurücksetzen** — wiederverwendet den Handler aus Zeile ~2046 (ruft `cancel-dialog-lipsync` mit `reset: true` und wipet dialog_shots + clip_url).

Logik der Handler bleibt unverändert — nur das **Mounting** wandert raus aus dem `secondaryOpen + clipSource.startsWith("ai-") + shotType !== "absent"`-Gate.

### 2. Alte versteckte Buttons entfernen (kein Duplikat)

Die zwei Buttons im alten „Lip-Sync zum Voiceover"-Block (Zeilen ~1991 und ~2046) **löschen**, damit es genau einen Ort dafür gibt. Der EIN/AUS-Toggle, der „SYNCED"-Badge und der „✕ Lip-Sync abbrechen"-Link bleiben dort, weil die zum Toggle gehören.

### 3. Bestehende Buttons unangetastet

- „3 Dialog-Shots in echte Szene rendern" (Initial-Trigger): bleibt wie ist.
- „✕ Lip-Sync abbrechen" (während running/stitching): bleibt, ist orthogonal zu „komplett zurücksetzen".
- `cancel-dialog-lipsync` Edge Function, `compose-dialog-scene`, DB-Schema: **keine Änderungen**.

### 4. Memory-Notiz

`mem/features/video-composer/dialog-shot-pipeline` um einen Satz ergänzen: „v20.1 — Reset/Re-render Buttons sitzen jetzt im AUDIO-Block neben dem Dialog-Shot-Trigger, nicht mehr hinter `Mehr ▾`."

## Geänderte Dateien

- `src/components/video-composer/SceneCard.tsx` (Toolbar verschieben, alte Buttons entfernen)
- `mem/features/video-composer/dialog-shot-pipeline` (1-Zeilen-Update)

## Was NICHT geändert wird

- Keine Änderung an Edge Functions, DB, Pipeline-Logik oder v20-Coords-Fix.
- Keine Änderung am EIN/AUS-Toggle oder am „abbrechen"-Link.
