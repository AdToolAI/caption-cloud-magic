## Ziel

Videos sollen wie bei Artlist / Veed / Captions klingen: **Voiceover + lippensynchroner Sprecher + Ambient/Atmo + punktgenaue SFX + Musik (geduckt)** – automatisch generiert, in einem Mix.

Aktueller Stand im Projekt:
- `director-cut-voice-over` (ElevenLabs TTS) ✅
- `director-cut-sound-design` empfiehlt nur Sounds, **generiert aber nichts** ❌
- `animate-scene-hailuo` akzeptiert bereits `audio` für Lip-Sync, wird aber im Composer nicht genutzt
- `TalkingHeadDialog` mit HeyGen ist da, aber nur als Standalone-Avatar
- `mux-audio-to-video`, `director-cut-audio-mixing`, Music Studio (Stable Audio / MiniMax) ✅

Wir bauen die fehlenden 3 Bausteine und die End-Mix-Pipeline.

---

## Plan

### 1) AI Sound-Designer wird "echt" (Ambient + SFX generieren)

Neue Edge Function **`generate-scene-sfx`** (ElevenLabs Sound Effects API, `text-to-sound-effects`, bis 22s, ~5 Credits/Clip):

- Input: `scene_id`, `prompt` ("rainy city street, distant traffic, light wind"), `duration`, `kind: 'ambient' | 'sfx' | 'foley'`
- Output: MP3 in neuem Bucket `scene-sfx/{user_id}/...`, Eintrag in neuer Tabelle `scene_audio_clips` (scene_id, kind, url, start_offset, duration, volume, ducking)

`director-cut-sound-design` wird umgebaut: liefert weiterhin die KI-Empfehlungen, ruft aber für jede Empfehlung **automatisch `generate-scene-sfx`** auf (Ambient pro Szene + 1–3 Foley/SFX-Akzente). Fallback: Suche in `search-stock-sfx` (Pixabay/Freesound), wenn ElevenLabs fehlschlägt → automatischer Credit-Refund (Project-Memory-Regel).

### 2) Lip-Sync direkt im Composer

Neuer Schalter pro Szene in `ClipsTab` / `SceneCard`: **"Lip-Sync mit Voiceover"** (nur sichtbar, wenn die Szene einen Charakter + Voiceover-Segment hat).

- Wenn aktiv und Provider = Hailuo: Voiceover-Slice der Szene wird als `audio`-Parameter an `animate-scene-hailuo` durchgereicht (existiert schon, nur Verdrahtung fehlt).
- Für andere Provider (Kling / Veo / Seedance / Sora): post-hoc Lip-Sync via neuer Edge Function **`lip-sync-video`** mit Replicate `sync-labs/lipsync-2` oder `bytedance/latentsync` (3–8 Credits, idempotenter Refund).
- Für reine Talking-Head-Szenen (ein Charakter spricht in die Kamera): bestehender `TalkingHeadDialog` (HeyGen) wird als Scene-Option im Storyboard-Tab angeboten ("Talking-Head-Szene einfügen").

### 3) Neuer "Audio Designer"-Tab im Composer

Ersetzt den dünnen Music-only `AudioTab` durch eine **Multi-Track-Timeline**:

```text
 ┌──── Track 1: Voiceover (TTS / Upload)            [vol] [ducking ON]
 ├──── Track 2: Music (Stock / AI-generiert)        [vol] [auto-duck -12dB]
 ├──── Track 3: Ambient pro Szene (AI generiert)    [vol] [crossfade]
 ├──── Track 4: SFX / Foley Akzente (Marker)        [vol] [per-marker]
 └──── Track 5: Original-Audio aus Clips            [vol] [mute toggle]
```

- "AI-Mix erstellen" Button: ruft `director-cut-sound-design` (jetzt generierend) + `analyze-music-beats` (Music-Sync) + setzt Auto-Ducking auf Voiceover-Segmente.
- Pre-Listen pro Track via WaveSurfer-Mini-Player.

### 4) Final-Mix in der Render-Pipeline

`mux-audio-to-video` wird zu **`mux-multi-track-audio`** erweitert:

- Eingabe: gerendertes Video + Voiceover + Music (mit Duck-Envelope aus `lib/duckingEnvelope.ts`) + alle `scene_audio_clips` (Ambient/SFX) mit Start-Offset.
- FFmpeg-Filter-Graph:
  - Music: sidechain-compress gegen Voiceover (-12dB Auto-Duck)
  - Ambient: 0.25 Lautstärke, fade in/out an Szenengrenzen
  - SFX: punktuell, 0.6 Lautstärke
  - Loudness-Normalisierung auf -14 LUFS (Broadcast/Social Standard)
- Wird sowohl von Director's Cut als auch vom Composer-Final-Render aufgerufen.

### 5) Wie macht das Artlist?
Kurz für Kontext (im UI auch als Hinweistext):
- Artlist = **Stock-Library** (lizenzfreie Musik + SFX + Foley) + **Auto-Match** (Beats → Schnitt)
- Captions/Veed/Submagic = **AI Voice Clone + Lip-Sync** (sync.so / D-ID) + **AI SFX** (ElevenLabs Sound Effects)
- Wir kombinieren beides: Stock (Pixabay/Freesound vorhanden) **+** AI-Generation **+** Auto-Mix **+** Lip-Sync.

---

## Technische Details

**Neue Tabellen** (eine Migration):
- `scene_audio_clips` (id, project_id, scene_id, user_id, kind, url, start_offset, duration, volume, ducking_enabled, source: 'ai'|'stock'|'upload', cost_credits, refunded)

**Neuer Bucket**: `scene-sfx` (RLS: `user_id` als erstes Pfadsegment, gemäß Project-Memory).

**Neue/aktualisierte Edge Functions**:
- `generate-scene-sfx` (neu, ElevenLabs `v1/sound-generation`, qa-mock-Header-Pattern)
- `lip-sync-video` (neu, Replicate sync-labs/latentsync, idempotenter Refund über deterministische UUID)
- `director-cut-sound-design` (umbauen → generiert wirklich)
- `mux-audio-to-video` → `mux-multi-track-audio` (FFmpeg sidechaincompress + loudnorm)

**Frontend**:
- `src/components/video-composer/AudioDesignerTab.tsx` (ersetzt `AudioTab.tsx`, Multi-Track-Timeline mit WaveSurfer)
- `src/components/video-composer/SceneCard.tsx`: neuer Toggle "Lip-Sync"
- `src/hooks/useSceneAudioClips.ts` (neu, CRUD + Realtime auf `scene_audio_clips`)
- `src/lib/audio/mixGraph.ts` (Helper, baut FFmpeg-Filter-Graph clientseitig als Vorschau-Spec)

**Credits** (transparent in UI):
- AI Ambient/SFX: 5 Credits / Clip
- Lip-Sync (post-hoc): 8 Credits / Szene (Hailuo-inline = 0 Extra)
- Final Mix: 0 (im Render enthalten)

**Out of Scope** (separate Phase):
- Voice-Cloning auf Charakter-Avatare (würde `clone-voice` + `brand_characters.default_voice_id` koppeln)
- Stem-Separation für Original-Clips (`separate-audio-stems` existiert schon, aber UI fehlt)
- Surround/Spatial Audio
