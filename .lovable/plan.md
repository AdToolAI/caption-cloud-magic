## Was läuft schief

Der neu gerenderte Clip ist stumm, obwohl der Lip-Sync (Sync.so multi-pass) sauber gerendert wurde und die Stimme schon **in das Szenen-MP4 eingebrannt** ist (`...-lipsync.mp4`).

Beweis aus DB für die letzte Composer-Szene `c7091d3d-…`:
- `lip_sync_applied_at` = gesetzt (Sync.so v5 fertig)
- `with_audio` = **true**
- `audio_plan.twoshot.useExternalAudio` = **true** (Flag aus Legacy-Two-Shot)
- `clip_url` = `…-lipsync.mp4` mit beiden Stimmen drin
- Im `scene_audio_clips` liegt zusätzlich der gemergte Dialog-WAV als `voiceover`-Clip

In `compose-video-assemble` passiert dann:
1. Mein letzter Fix setzt für die Szene `withAudio: true` (korrekt, `with_audio===true || …`).
2. Aber das **globale Lambda-Payload-Feld** `muted: !hasAudio` mit `hasAudio = !!inputProps.voiceoverUrl || !!inputProps.backgroundMusicUrl` ist `true`, weil der Composer KEINEN globalen Voiceover/Music hat (alles ist per-Scene).
3. Lambda exportiert das MP4 daher **komplett ohne Audio-Spur**, egal was `<Video muted={withAudio!==true}>` macht — Remotions Top-Level-`muted` wirkt auf den Encoder.
4. Der externe Dialog-WAV soll im Webhook (`remotion-webhook` → `mux-audio-to-video`) post-gemuxt werden, aber `mux-audio-to-video` ruft `ffmpeg` im **Supabase-Edge-Runtime** auf — laut Code-Kommentar in `remotion-webhook` (Z. 228, „forbidden Edge-Runtime ffmpeg") ist das verboten und schlägt fehl. Der Webhook fällt zurück auf die stumme Lambda-MP4.

Ergebnis: stummes Video.

## Fix (zwei minimale Änderungen, beide nur Backend)

### 1) `supabase/functions/compose-video-assemble/index.ts`

`hasAudio` so erweitern, dass es auch dann `true` ist, wenn **irgendeine** Szene Embedded-Audio mitbringt oder per-Scene Audio-Clips für den Mux vorhanden sind:

```ts
const anySceneWithAudio = remotionScenes.some((s: any) => s.withAudio === true);
const hasAudio =
  !!inputProps.voiceoverUrl ||
  !!inputProps.backgroundMusicUrl ||
  anySceneWithAudio ||
  sceneAudioClipsForMux.length > 0;
```

Damit setzt Lambda `muted: false` und der Encoder behält die in `clip_url` eingebrannte Lip-Sync-Stimme. Diagnose-Log dazu schreiben (welche der vier Bedingungen `hasAudio` wahr gemacht hat), damit man im Edge-Log Stille vs. Klang sofort eingrenzen kann.

### 2) `supabase/functions/compose-video-assemble/index.ts` — Override gegen veraltetes `useExternalAudio`

Cinematic-Sync v5 (`dialog_shots.engine === 'sync-segments'` oder `dialog_shots.version >= 5`) baked den gesamten Multi-Speaker-Audio IN das Szenen-MP4. Das Legacy-Feld `audio_plan.twoshot.useExternalAudio = true` ist dann irreführend und führt dazu, dass

- `keepEmbeddedLipsyncAudio` auf `false` fällt (kein Problem für diese Szene, weil `with_audio===true`, ABER zusätzlich
- der **externe WAV** als doppelte VO-Spur in `sceneAudioClipsForMux` landet → würde nach erfolgreichem Mux Echo erzeugen.

Daher:
- `twoshotExternalSceneIds` zusätzlich filtern: eine Szene wird nur dann als "external audio source" gezählt, wenn `dialog_shots?.engine !== 'sync-segments'` UND `dialog_shots?.version < 5` (d.h. echte Legacy-Two-Shot, die wirklich nur die letzte Stimme im Video hat).
- Für v5-Szenen gilt damit korrekt `keepEmbeddedLipsyncAudio = true` und die externe WAV wird via `lipSyncedSceneIds`-Filter aus `sceneAudioClipsForMux` ausgeschlossen.

### Warum nicht `mux-audio-to-video` fixen?

`mux-audio-to-video` braucht ffmpeg, das ist in Supabase-Edge-Runtime nicht verfügbar. Den ganzen Mux-Pfad Lambda-seitig zu reimplementieren wäre groß und nicht nötig — für die jetzt betroffenen Cinematic-Sync- und Single-Speaker-Lip-Sync-Szenen reicht das Behalten der eingebrannten Spur via `muted:false`. Reine SFX/Ambient-Only-Szenen ohne sonstige Audio bleiben ein bekannter offener Punkt (kein Regress vs. heute, weil mux dort jetzt schon nicht funktioniert).

## Out of Scope

- Keine Änderung an `ComposedAdVideo.tsx` / Remotion-Bundle (kein Redeploy).
- Keine Änderung am Frontend, Preview, `with_audio`-Toggle, Sync.so-Pipeline, Two-Shot-Pipeline, Webhook oder Lambda.
- Kein Eingriff in andere Renderer (Universal, Director's Cut, Long-Form).

## Validation

- Re-Render derselben Szene `c7091d3d-…`: finale MP4 enthält Audio-Spur, beide Sprecher hörbar.
- Edge-Log zeigt `[compose-video-assemble] hasAudio=true reason=anySceneWithAudio` (neuer Diagnose-Log).
- Legacy Two-Shot-Szenen (engine !== sync-segments, version<5) bleiben unverändert — externer WAV wird weiterhin im sceneAudioClips-Mux geführt (und scheitert dort weiterhin am ffmpeg-Constraint, kein Regress).
- Szenen mit `with_audio=false` und ohne Lip-Sync bleiben stumm wie bisher.
- Sora/Veo nativer Audio (`with_audio=true`) unverändert.
