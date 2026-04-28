## Problem

Im Motion-Studio-Composer sehe ich unter dem KI-Modell-Dropdown keinen "Mit Sound / Ohne Sound"-Toggle — auch nicht bei Sora 2 (Screenshot) und auch nicht bei den anderen Modellen, die nativ Audio liefern.

Der Toggle-Code existiert bereits in `src/components/video-composer/SceneCard.tsx` (Zeilen 544–586) und prüft `selectedModel.capabilities.audio === true`. Er rendert nichts, weil:

1. **Sora 2 Standard und Sora 2 Pro** sind in `src/config/aiVideoModelRegistry.ts` (Zeilen 370 + 388) noch fälschlich als `audio: false` markiert — obwohl Sora 2 nativ Audio liefert.
2. **Veo 3.1 Fast/Pro, Kling 3 Standard/Pro, Grok Imagine** sind bereits korrekt als `audio: true` markiert — der Toggle erscheint dort eigentlich. Falls er auch dort nicht sichtbar ist, liegt das am Browser-Cache (alter Build vor der letzten Änderung).

## Fix

### 1. Sora als audio-fähig markieren

**Datei:** `src/config/aiVideoModelRegistry.ts`

- Zeile 370 (`sora-2-standard`): `audio: false` → `audio: true`
- Zeile 388 (`sora-2-pro`): `audio: false` → `audio: true`

Damit erscheint der Toggle für **alle** Audio-Modelle einheitlich:
Veo 3.1 Fast, Veo 3.1 Pro, Kling 3 Standard, Kling 3 Pro, Grok Imagine, Sora 2 Standard, Sora 2 Pro.

### 2. Mute-Pipeline für Sora vervollständigen

Veo und Kling bekommen `generate_audio: false` direkt an die Replicate-API durchgereicht — fertig. Sora 2 hat keinen API-Toggle für Audio. Aktuell wird `with_audio` zwar in `composer_scenes` gespeichert, aber beim finalen Stitch nicht angewendet.

**Datei:** `supabase/functions/compose-video-storyboard/index.ts`

Beim Stitch-Schritt für jeden Sora-Clip prüfen, ob `with_audio = false` ist, und in dem Fall den Audio-Track per ffmpeg entfernen — entweder vor dem Concat (`-c:v copy -an` auf den Einzelclip) oder via Filter (`amix` mit Stummschaltung). Konkret: vor der Concat-Demuxer-Liste pro Sora-Clip mit `with_audio = false` einen lokalen Re-Encode (`ffmpeg -i input.mp4 -an -c:v copy muted.mp4`) einfügen und die gemutete Datei in die Liste schreiben.

## Erwartetes Ergebnis

Direkt unter dem Modell-Dropdown jeder Szene erscheint bei allen Audio-fähigen Modellen ein kompakter Pill-Toggle:

```text
🔊 Mit Sound   🔇 Ohne Sound
```

Verhalten pro Modell:
- **Veo 3.1 / Kling 3 / Grok Imagine** — `generate_audio` wird an Replicate durchgereicht (bereits implementiert).
- **Sora 2 Standard / Pro** — Audio wird beim Stitch per ffmpeg entfernt, falls Toggle = "Ohne Sound".

Der Toggle wird NICHT angezeigt für Hailuo, Wan, Luma, Seedance und das statische Bild-Modell — diese Modelle haben sowieso kein natives Audio.

## Dateien

- `src/config/aiVideoModelRegistry.ts` — 2 Booleans (`audio: false` → `true`)
- `supabase/functions/compose-video-storyboard/index.ts` — ffmpeg-Mute für Sora-Clips mit `with_audio = false`

## Out of Scope

- Toggle für Modelle ohne natives Audio (Hailuo, Wan, Luma, Seedance) — bewusst ausgeblendet, da kein Effekt.
- Voiceover/Music-Mix — kommt aus den separaten Tabs "Voiceover & Untertitel" und "Musik & Sound-Mix", unabhängig vom Native-Audio-Toggle.
