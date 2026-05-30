## Problem

Cinematic-Sync- / Single-Speaker-Lip-Sync-Szenen sind im finalen Composer-Export stumm, im Preview aber hörbar.

## Root Cause

In `supabase/functions/compose-video-assemble/index.ts` passieren zwei Dinge gleichzeitig:

1. **Embedded Audio wird gemuted**: Jede Szene wird mit `withAudio: s.with_audio === true` an `ComposedAdVideo` übergeben. Da `with_audio` per Default `false` ist, setzt der Renderer `<Video muted />` (siehe `ComposedAdVideo.tsx:203`). Damit verschwindet die in das Lip-Sync-MP4 eingebrannte Stimme.
2. **Separater VO-Track wird übersprungen**: `lipSyncedSceneIds` (Z. 586-590) filtert `voiceover`-Clips für jede Szene mit `lip_sync_applied_at` aus `sceneAudioClipsForMux` raus, weil die VO ja "schon im Video drin" ist.

Resultat: Single-Speaker-Lip-Sync-Szenen haben weder embedded noch externe Audio-Spur → komplett still.

Two-Shot/Dialog-Szenen (`audio_plan.twoshot.useExternalAudio === true`) sind nicht betroffen, weil dort der gemergte WAV als externer Track bestehen bleibt.

## Fix

Einzige Änderung in `supabase/functions/compose-video-assemble/index.ts`:

Für jede Szene mit `lip_sync_applied_at` (Sync.so-Output liegt im Clip) UND ohne `audio_plan.twoshot.useExternalAudio` → `withAudio: true` erzwingen, damit der Renderer die eingebrannte Lip-Sync-Stimme behält.

Konkret beim Bau von `remotionScenes` (Z. 296-319):

```ts
const isLipSynced = !!s.lip_sync_applied_at;
const usesExternalDialogAudio =
  s?.audio_plan?.twoshot?.useExternalAudio === true;
// ...
withAudio: s.with_audio === true || (isLipSynced && !usesExternalDialogAudio),
```

Zusätzlich ein einmaliger Diagnose-Log, damit man die Override-Entscheidung in den Edge-Logs sieht (`[compose-video-assemble] scene X: lipsync embedded audio kept (withAudio override)`).

## Out of Scope

- Keine Änderung an `ComposedAdVideo.tsx`, an der Skip-Logik für externe VO-Clips, an Two-Shot/Dialog-Pipeline, am Preview, an `with_audio`-DB-Spalte oder am UI-Toggle in `SceneCard`. Der User-Toggle behält Vorrang nur wenn er explizit `true` ist; explizit `false` wird durch das Override für Lip-Sync-Szenen aufgehoben (das ist gewollt, sonst wäre die Szene weiter stumm).
- Reines Backend-Fix, kein Frontend-Eingriff.

## Validation

- Single-Speaker-Lip-Sync-Szene rendern → Stimme hörbar im finalen MP4.
- Two-Shot/Dialog-Szene (`useExternalAudio=true`) rendern → weiterhin nur der externe Merged-WAV, kein Doppel-Audio (embedded bleibt gemuted, weil Override greift nicht).
- Szene ohne Lip-Sync, `with_audio=false` → bleibt wie bisher gemuted.
- Szene mit Sora/Veo nativem Audio (`with_audio=true`) → unverändert.
