

## r41 — "Silent Render + Audio Mux" Strategie

### Kernidee
Ja, das ist eine sehr gute Idee und technisch machbar. Der Ansatz:

1. **Video zuerst ohne Audio rendern** (`muted: true`) → eliminiert alle `ffprobe`-Crashes komplett
2. **Audio nachträglich dranmuxen** per FFmpeg in einer Edge Function → `ffmpeg -i video.mp4 -i music.mp3 -c:v copy -c:a aac output.mp4`

### Warum das funktioniert
- Remotion unterstützt nativ `muted: true` — euer Payload hat das Feld bereits (`normalizeStartPayload`, Zeile 234)
- `transform-media` Edge Function nutzt schon `Deno.Command('ffmpeg')` erfolgreich — FFmpeg ist in der Deno-Runtime verfügbar
- Audio-Dateien (Background Music, Voiceover) sind bereits als URLs vorhanden und validiert (r39 HEAD-Check)
- Video-Render wird drastisch stabiler, weil ffprobe/Audio-Decoding komplett wegfällt

### Umsetzungsplan

**A) Render-Pipeline auf "Silent First" umstellen**
- Datei: `supabase/functions/auto-generate-universal-video/index.ts`
- Standard-Render immer mit `muted: true` starten
- Alle Scene-`soundEffectType` auf `'none'` setzen, `soundEffects: []`
- Audio-URLs (backgroundMusic, voiceover) trotzdem im Progress/Metadata speichern (für Schritt C)

**B) Remotion-Payload anpassen**
- Datei: `supabase/functions/_shared/remotion-payload.ts`
- In `normalizeStartPayload()`: wenn `silentRender: true` flag gesetzt, `muted: true` + `audioCodec: null` erzwingen
- Template-seitig: `diag.silentRender` Flag → SceneSoundEffect-Komponenten nicht mounten

**C) Neue Edge Function: `mux-audio-to-video`**
- Neue Datei: `supabase/functions/mux-audio-to-video/index.ts`
- Input: `{ videoUrl, audioTracks: [{ url, volume, startTime }], outputBucket }`
- Ablauf:
  1. Video + Audio-Dateien herunterladen (temp)
  2. FFmpeg: `ffmpeg -i video.mp4 -i music.mp3 -filter_complex "[1:a]volume=0.7[bg]" -map 0:v -map "[bg]" -c:v copy -c:a aac -shortest output.mp4`
  3. Output nach Storage hochladen
  4. Finale URL zurückgeben
- `-c:v copy` = kein Re-Encoding des Videos → schnell (Sekunden, nicht Minuten)

**D) Webhook/Pipeline-Integration**
- Datei: `supabase/functions/remotion-webhook/index.ts`
- Nach erfolgreichem "silent" Render (`type === 'success'`):
  - Prüfe ob Audio-Tracks vorhanden sind (aus `customData` oder Progress-DB)
  - Wenn ja: `mux-audio-to-video` aufrufen, erst danach Status auf `completed` setzen
  - Wenn nein (kein Audio): direkt `completed`

**E) Template Safety Guard**
- Datei: `src/remotion/templates/UniversalCreatorVideo.tsx`
- `DiagToggleSchema` um `silentRender: boolean` erweitern
- Wenn `silentRender`: keine `<Audio>`, keine `<SceneSoundEffect>` Komponenten mounten

### Vorteile
- **Render-Stabilität sofort dramatisch höher** — der häufigste Crash-Grund (ffprobe/Audio) fällt weg
- **Keine Qualitätseinbuße** — Video bleibt 30fps, alle Effekte, Lottie etc.
- **Audio-Qualität besser kontrollierbar** — FFmpeg-Muxing ist deterministisch, kein Remotion-internes Audio-Processing
- **Schneller** — Audio-Mux dauert 2-5 Sekunden (copy codec), nicht Minuten

### Betroffene Dateien
- `supabase/functions/auto-generate-universal-video/index.ts` (silent render flag)
- `supabase/functions/_shared/remotion-payload.ts` (silentRender support)
- `supabase/functions/mux-audio-to-video/index.ts` (NEU)
- `supabase/functions/remotion-webhook/index.ts` (post-render audio mux trigger)
- `src/remotion/templates/UniversalCreatorVideo.tsx` (silentRender guard)
- `supabase/config.toml` (neue Function registrieren)

