# Root Cause

Der Edge-Function-Log der fehlgeschlagenen Kling-Szene zeigt:

```
[compose-video-clips] scene 18e80faf…: cinematic_sync_without_opt_in_downgraded_to_broll (engine=cinematic-sync)
```

Der Hard-Guard in `compose-video-clips/index.ts` (Zeile 1109–1157) verlangt, dass das **Request-Payload-Objekt** (nicht der DB-Row) `lipSyncWithVoiceover === true` ODER `dialogMode === true` gesetzt hat. Fehlt beides, wird der Engine-Override auf `auto` degradiert, `lip_sync_with_voiceover` in der DB wieder auf `false` gesetzt und die Szene läuft als normales B-Roll durch — **kein Sync.so, kein Dialog-Shots-Dispatch**.

In `SceneDialogStudio.tsx` (Single-Speaker-Cinematic-Sync-Pfad, Zeile 1479–1496) wird der `scenePayload` an `compose-video-clips` gesendet:

```ts
const scenePayload = {
  id, projectId, sceneType, clipSource, clipQuality,
  aiPrompt, negativePrompt, uploadUrl, referenceImageUrl,
  durationSeconds, characterShot, characterShots,
  dialogScript, dialogVoices,
  engineOverride: 'cinematic-sync' as const,
  withAudio: scene.withAudio !== false,
};
```

Kein `lipSyncWithVoiceover` und kein `dialogMode` im Payload. Der unmittelbar davor ausgeführte DB-Write (`lip_sync_with_voiceover: true`) hilft nicht, weil der Guard nur das Payload prüft — und der eigene Downgrade-Zweig anschließend `lip_sync_with_voiceover: false` in der DB überschreibt.

Folge in der UI: Der optimistische `twoshotStage: 'audio'` bleibt lokal stehen ("Audio wird vorbereitet…"), aber der Backend-Autotrigger (`useTwoShotAutoTrigger`) filtert die Szene nach dem Downgrade via `isLipSyncCandidate` heraus — es startet weder `compose-twoshot-audio` noch `compose-dialog-segments`. Deshalb hängt es bei "Audio wird vorbereitet…" ewig und Sync.so wird nie aufgerufen.

# Fix

**Eine Datei, zwei Zeilen** — Payload-Opt-in explizit mitschicken, damit der Guard nicht mehr degradiert:

## `src/components/video-composer/SceneDialogStudio.tsx` (~Zeile 1494)

`scenePayload` erweitern:

```ts
const scenePayload = {
  // …bestehende Felder…
  engineOverride: 'cinematic-sync' as const,
  lipSyncWithVoiceover: true,   // NEU — matcht den Backend-Guard
  dialogMode: true,             // NEU — zweiter akzeptierter Opt-in-Weg
  withAudio: scene.withAudio !== false,
};
```

# Belt-and-Suspenders (Backend Hardening)

Zusätzlich in `supabase/functions/compose-video-clips/index.ts` im Guard-Block (Zeile 1113–1115) den Opt-in-Check leicht erweitern, damit dieselbe Klasse Bug (fehlendes Flag im Payload, obwohl User explizit auf "Lip-Sync generieren" geklickt hat) nicht mehr silent degradiert. Wenn `engine_override === 'cinematic-sync'` UND ein `dialogScript` mit `dialogVoices` im Payload steht, gilt das als impliziter Opt-in:

```ts
const hasOptIn =
  (scene as any).lipSyncWithVoiceover === true ||
  (scene as any).dialogMode === true ||
  (typeof scene.dialogScript === 'string' &&
    scene.dialogScript.trim().length > 0 &&
    scene.dialogVoices &&
    Object.keys(scene.dialogVoices).length > 0);
```

Damit ist der Pfad zweifach abgesichert: Frontend setzt das Flag explizit, Backend akzeptiert auch die dialogScript-Signatur als gültigen Opt-in.

# Verification

1. Kling-Szene mit einem Sprecher, Portrait, Voice → Button "Clip mit Lip-Sync generieren" klicken.
2. Edge-Function-Log darf **keine** `cinematic_sync_without_opt_in_downgraded_to_broll`-Warnung mehr enthalten.
3. Nach Master-Clip-Fertigstellung muss `useTwoShotAutoTrigger` `compose-twoshot-audio` starten (Log: `self-heal: invoking compose-twoshot-audio for …`), danach `compose-dialog-segments`.
4. `dialog_shots` in `composer_scenes` füllt sich; Sync.so-Slot-Anzeige geht von 0/3 auf 1/3.

# Affected Files

- `src/components/video-composer/SceneDialogStudio.tsx` (2 neue Felder im `scenePayload`)
- `supabase/functions/compose-video-clips/index.ts` (Guard-`hasOptIn` erweitern, dann Deploy)

Kein anderer Provider (Hailuo/HappyHorse/Wan/Seedance/Luma) und kein Multi-Speaker-Pfad wird berührt — die kannten den Bug nur nicht, weil ihre Codepfade den Guard entweder nie triggerten (Hailuo/HappyHorse Default) oder das Flag anderweitig setzten.
