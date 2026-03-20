
# Plan: Voiceover Phase 1 — Audio direkt im Lambda-Render

## Status: ✅ Implementiert (r59)

## Was wurde geändert

### Kernproblem erkannt
Die `mux-audio-to-video` Edge Function nutzt `Deno.Command('ffmpeg')` — **Subprocess-Spawning ist in Supabase Edge Functions nicht erlaubt**. Der bisherige "Silent Render + Audio Mux" Ansatz konnte daher nie funktionieren.

### Lösung: Audio direkt im Remotion Lambda rendern
Statt stummem Render + nachträglichem Muxing wird jetzt **direkt mit Audio gerendert**:
- `_silentRender: false` + `muted: false` + `audioCodec: 'aac'`
- Das Remotion-Template (`UniversalCreatorVideo.tsx`) hat bereits volle Audio-Unterstützung mit `Html5Audio` Komponenten
- Voiceover + Hintergrundmusik werden direkt in der Lambda-Composition abgespielt

### Änderungen

| Datei | Änderung |
|-------|----------|
| `generate-video-voiceover/index.ts` | Gender-Mapping (`male`→`roger`, `female`→`sarah`) + `voiceGender` Parameter-Support |
| `auto-generate-universal-video/index.ts` | r59: `silentRender: false`, `muted: false`, `audioCodec: 'aac'` — Audio wird direkt gerendert |
| `remotion-webhook/index.ts` | Diagnostik-Logging für audioTracks |

### Fallback-Strategie
Bei Audio-Korruption (r33) fällt das System auf `silentRender: true` zurück — dann kommt das Video ohne Ton, statt zu crashen.

## Phase 2 (nächster Schritt)
Hintergrundmusik hinzufügen — die Architektur ist bereits vorbereitet.
