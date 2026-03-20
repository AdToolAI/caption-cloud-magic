
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

## Phase 2 (nächster Schritt)
Hintergrundmusik re-aktivieren — sobald Voiceover stabil bestätigt ist.
