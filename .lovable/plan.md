
# Plan: Voiceover Phase 1 — Audio direkt im Lambda-Render

## Status: ✅ Implementiert (r60)

## Was wurde geändert

### r59: Direct Audio Rendering
- `_silentRender: false` + `muted: false` + `audioCodec: 'aac'` — Audio wird direkt im Lambda gerendert
- Gender-Mapping (`male`→`roger`, `female`→`sarah`) in `generate-video-voiceover`

### r60: Audio-Corruption Fix — MP3-Validierung + Smart Recovery
- **Magic-Byte-Validierung** in `proxyAudioToStorage`: Prüft ID3-Header (`0x49 0x44 0x33`) und MPEG frame sync (`0xFF 0xE0+`) — HTML-Fehlerseiten werden erkannt und verworfen
- **Intelligente Retry-Logik**: Bei `audio_corruption` wird nur die Background-Music entfernt, Voiceover bleibt erhalten
- Nur wenn kein Voiceover vorhanden → Fallback auf `silentRender: true`

### Änderungen

| Datei | Änderung |
|-------|----------|
| `auto-generate-universal-video/index.ts` | r60: MP3 Magic-Byte-Validierung + Smart Audio-Corruption Recovery |
| `generate-video-voiceover/index.ts` | r59: Gender-Mapping |
| `remotion-webhook/index.ts` | r59: Audio-Diagnose-Logging |

## Phase 2 (nächster Schritt)
Hintergrundmusik hinzufügen — die Architektur ist bereits vorbereitet.
