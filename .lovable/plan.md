
# Plan: Voiceover Phase 1 — Audio direkt im Lambda-Render

## Status: ✅ Implementiert (r62)

## Was wurde geändert

### r59: Direct Audio Rendering
- `_silentRender: false` + `muted: false` + `audioCodec: 'aac'` — Audio wird direkt im Lambda gerendert
- Gender-Mapping (`male`→`roger`, `female`→`sarah`) in `generate-video-voiceover`

### r60: Audio-Corruption Fix — MP3-Validierung + Smart Recovery
- **Magic-Byte-Validierung** in `proxyAudioToStorage`: Prüft ID3-Header (`0x49 0x44 0x33`) und MPEG frame sync (`0xFF 0xE0+`) — HTML-Fehlerseiten werden erkannt und verworfen
- **Intelligente Retry-Logik**: Bei `audio_corruption` wird nur die Background-Music entfernt, Voiceover bleibt erhalten
- Nur wenn kein Voiceover vorhanden → Fallback auf `silentRender: true`

### r61: Voiceover-Audio wirklich hörbar machen
- **Template-Fix**: `r33_audioStripped` blockiert jetzt NUR noch Musik/SFX, nicht mehr das Voiceover
  - Voiceover-Bedingung: `!silentRender && voiceoverUrl` (unabhängig von `r33_audioStripped`)
  - Musik-Bedingung: `!silentRender && !r33_audioStripped && backgroundMusicUrl`
  - SFX-Bedingung: `!silentRender && !r33_audioStripped`
- **Export-Pfad**: `render-with-remotion` und `render-universal-video` setzen jetzt `muted: false` + `audioCodec: 'aac'`
- **Phase 1 Voiceover-Only**: Background-Music temporär deaktiviert bis Voiceover stabil bestätigt

### r62: Unified Audio Layer — UCC-Architektur portiert
- **Kernproblem**: Doppeltes Voiceover — Root-Level `Html5Audio` UND `SceneAudioManager` renderten beide Voiceover
- **Fix**: `SceneAudioManager` komplett durch einfachen Root-Level `Html5Audio`-Layer ersetzt (wie in `UniversalVideo.tsx`)
  - Voiceover: `<Html5Audio key="stable-voiceover-audio" startFrom={0} loop={false} />`
  - Musik: `<Html5Audio key="stable-music-audio" startFrom={0} loop={false} />`
- **Diagnostik-Fix**: `effectiveFlags.silentRender` in `auto-generate-universal-video` zeigt jetzt den echten Payload-Wert statt hart `true`
- Stabile Keys (`key="stable-voiceover-audio"`) verhindern unnötiges Remounting

### Änderungen

| Datei | Änderung |
|-------|----------|
| `src/remotion/templates/UniversalCreatorVideo.tsx` | r62: SceneAudioManager durch einfachen Html5Audio-Layer ersetzt |
| `supabase/functions/auto-generate-universal-video/index.ts` | r62: effectiveFlags.silentRender Diagnostik korrigiert |

## Phase 2: ✅ Implementiert (r63)
- Background music re-aktiviert via `selectBackgroundMusic()`
- Musik wird über den stabilen Root-Level `Html5Audio`-Layer gerendert (r62-Architektur)
- Bei `audio_corruption` wird nur Musik entfernt, Voiceover bleibt erhalten

## Phase 3: ✅ Implementiert (r64) — Post-Render Music Muxing
- **Problem**: Jamendo/Pixabay MP3s crashen Lambda ffprobe trotz gültiger Magic Bytes (Encoding-Varianten)
- **Lösung**: Musik wird NICHT mehr im Lambda-Template gerendert, sondern post-render via `mux-audio-to-video` (FFmpeg) hinzugefügt
- **Template**: `Html5Audio` → Remotion `Audio` für Voiceover, Musik komplett entfernt aus Template
- **auto-generate**: `backgroundMusicUrl` aus `inputProps` entfernt, nur noch in `customData.audioTracks`
- **Webhook**: Erkennt `backgroundMusicUrl` in `audioTracks` und triggert `mux-audio-to-video` auch bei `silentRender=false`
- **Ergebnis**: Lambda rendert stabil Video+Voiceover, FFmpeg fügt Musik sicher hinzu

| Datei | Änderung |
|-------|----------|
| `src/remotion/templates/UniversalCreatorVideo.tsx` | r64: Html5Audio→Audio, Musik aus Template entfernt |
| `supabase/functions/auto-generate-universal-video/index.ts` | r64: backgroundMusicUrl aus inputProps entfernt |
| `supabase/functions/remotion-webhook/index.ts` | r64: Post-render music muxing für non-silent renders |

## Phase 4: ✅ Implementiert (r65) — Retry Scope-Bug Fix + Musik-Pipeline Hardening
- **Scope-Bug**: `props` war nur innerhalb eines `try`-Blocks definiert, wurde aber außerhalb referenziert → `ReferenceError: props is not defined`
- **Fix**: `recoveredSilentRender` und `recoveredHasVoiceover` werden vor dem `try`-Block deklariert und innerhalb gesetzt
- **Retry audioTracks**: Webhook customData propagiert jetzt `audioTracks` korrekt, strippt Musik bei `audioStripped`
- **Pixabay-Fallback entfernt**: Unreliable externe Fallback-URLs (konsistent HTML statt MP3) durch graceful `null`-Return ersetzt

| Datei | Änderung |
|-------|----------|
| `supabase/functions/auto-generate-universal-video/index.ts` | r65: Scope-Bug fix, audioTracks in Retry, Pixabay-Fallback entfernt |
