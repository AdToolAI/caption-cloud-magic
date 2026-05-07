## Problem

Im Export-Step zeigt "Gesamtes Video — Vorschau" zwar das fertige Video, spielt aber **keinen Sound aus dem AI Sound Mix** ab, den du im Audio-Tab über "Mix erstellen" generiert hast.

Zwei Ursachen:

1. **Die Vorschau ist standardmäßig stumm** (`muted = true`) — du müsstest erst auf das Lautsprecher-Icon klicken. Das ist nicht offensichtlich.
2. **Die generierten Szenen-SFX/Ambient/Foley-Clips (`scene_audio_clips`) werden vom Preview-Player gar nicht geladen** — er spielt nur Voiceover + Background-Music. Die "Mix erstellen"-Clips landen zwar in der DB und im finalen Render, sind in der Preview aber unsichtbar/unhörbar.

Der finale Render (Lambda → `mux-audio-to-video`) bezieht die Clips bereits korrekt aus `scene_audio_clips` (Phase 2 Pipeline) — das Problem ist **rein in der Export-Step-Preview**.

## Plan

Reines Frontend / Preview-Fix, keine Backend-Änderungen.

### 1. `ComposerSequencePreview.tsx` erweitern

- Neue Prop `projectId?: string | null` und `sceneAudioClips?: SceneAudioClip[]` (oder direkt aus DB laden, siehe 2).
- Default `muted = false` setzen (mit erstem User-Gesten-Fallback für Browser-Autoplay-Policy: bei `play()`-Reject einmalig auf `muted=true` umschalten und Hinweis-Toast).
- Pro Szene Offset berechnen (akkumulierte `durationSeconds`) und für jeden Clip eine eigene `HTMLAudioElement`-Instanz im `useEffect` aufbauen. Schon vorhandenes Muster aus `TimelineVideoPreview.tsx` (Map<id, Audio>) wiederverwenden.
- In der bestehenden `tick`-/`onVideoTimeUpdate`-Schleife jeden Clip prüfen:
  - `clipStart = sceneOffset + clip.start_offset`
  - `clipEnd = clipStart + clip.duration`
  - innerhalb Range + `playing` → `audio.play()`, `audio.currentTime = globalTime - clipStart`
  - außerhalb / pause / mute → `audio.pause()`
- Volume = `clip.volume * (muted ? 0 : 1)`, geklippt auf `[0, 1]` (gem. Memory `audio-playback-volume-clamping`).
- Cleanup beim Unmount + bei Wechsel der Clip-Liste.

### 2. Datenladen

In `AssemblyTab.tsx` einen leichten Loader (oder neuer Hook `useSceneAudioClips(projectId)`) hinzufügen, der `scene_audio_clips` für `project.id` mit `kind in ('ambient','sfx','foley')` lädt und an `ComposerSequencePreview` als Prop weiterreicht. Realtime-Subscription optional, mindestens Reload nach `Mix erstellen` (über `eventBus`/`window` Event aus `SoundDesignPanel`).

### 3. UX-Politur

- Kleines Badge **"AI Mix aktiv · X Clips"** über dem Preview, wenn Clips geladen sind, damit klar ist, dass die Preview den vollen Sound abspielt.
- Mute-Button-Tooltip: "Klick für Sound (VO + Musik + AI SFX)".

### 4. Verifikation

- DB-Sanity-Check via `read_query`: `select count(*), kind from scene_audio_clips where project_id = … group by kind` nach Mix-Erstellung.
- Manuell im Browser: Export-Step öffnen, Play drücken — Voiceover + Musik + Ambient/SFX hörbar pro Szene.
- Console-Log: `[Preview] loaded N scene audio clips` zur schnellen Diagnose.

## Out of Scope

- Keine Änderung an `compose-video-assemble`, `mux-audio-to-video`, `remotion-webhook` (laufen bereits korrekt).
- Kein Waveform/Multi-Track-Editor in der Export-Preview (das gehört in den Audio-Tab).
- Keine Lip-Sync-Vorschau (Lip-Sync passiert post-stitch, nicht in der Live-Preview).

## Files Touched

- `src/components/video-composer/ComposerSequencePreview.tsx` (Prop + Audio-Sync + Default-Unmute)
- `src/components/video-composer/AssemblyTab.tsx` (Clips laden + Prop reichen)
- *(optional)* `src/hooks/useSceneAudioClips.ts` (neuer kleiner Hook)
- *(optional)* `src/components/video-composer/SoundDesignPanel.tsx` (Event nach erfolgreichem Mix für Reload)
