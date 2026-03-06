

## Analyse: Korrupte Audio-Datei verursacht ffprobe-Crash

### Befund
Die Logs zeigen eindeutig:
```
Command failed with exit code 1: /var/task/ffprobe ... 3267935293260962.mp3
[mp3 @ 0x20b98a00] Failed to find two consecutive MPEG audio frames.
Invalid data found when processing input
```

**Die MP3-Datei (Voiceover oder Hintergrundmusik) ist keine gültige Audiodatei.** Wahrscheinlich wurde eine HTML-Fehlerseite, ein leerer Response oder ein beschädigtes File als `.mp3` gespeichert.

**Kritisch**: Der Fehler tritt bei `retryAttempt: 3` auf — alle Render-Only-Retries scheitern identisch, weil sie dasselbe korrupte Audio-Asset wiederverwenden. Weder FPS-Reduktion noch Lottie-Fallback helfen hier.

### Plan: r33 — Audio-Corruption-Recovery

#### 1. Fehlerklassifikation erweitern (3 Dateien)
- **`remotion-webhook/index.ts`**: Neues Regex-Pattern in `classifyError`:
  ```
  /ffprobe.*failed|invalid data found.*processing input|failed to find.*mpeg audio/i → 'audio_corruption'
  ```
- **`check-remotion-progress/index.ts`**: Gleiche Erkennung hinzufügen
- **`UniversalAutoGenerationProgress.tsx`**: `classifyPipelineError` um `audio_corruption` erweitern

#### 2. Retry-Strategie für Audio-Corruption (1 Datei)
- **`auto-generate-universal-video/index.ts`** (`runRenderOnlyPipeline`):
  - Neuer Branch: `sourceErrorCategory === 'audio_corruption'`
  - **Strategie**: Audio-Quellen aus dem Payload entfernen (voiceoverUrl, backgroundMusicUrl auf `undefined` setzen, backgroundMusicVolume auf `0`)
  - FPS bleibt bei 30 — das Problem ist nicht die Rechenleistung
  - Ergebnis: Video wird ohne Audio gerendert, aber es wird fertig
  - Flag `r33_audioStripped: true` wird in `result_data` persistiert

#### 3. Webhook errorCategory-Typ erweitern
- `classifyError` Return-Type: `'audio_corruption'` als neue Kategorie hinzufügen
- Frontend-Statusmeldung: "⚠️ Audio-Fehler — Video wird ohne Ton erstellt"

### Dateien
1. `supabase/functions/remotion-webhook/index.ts` — classifyError erweitern
2. `supabase/functions/check-remotion-progress/index.ts` — Erkennung
3. `supabase/functions/auto-generate-universal-video/index.ts` — Retry-Strategie + Audio-Strip
4. `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx` — UI-Klassifikation

### Erwartetes Ergebnis
```
Retry 1 (audio_corruption): Audio entfernt → Render erfolgreich ✅
Video ohne Ton, aber fertiggestellt statt endloser Fehler-Loop
```

