

## r37 — Rate-Limit Auto-Recovery Stabilisierung (IMPLEMENTED)

### Problem
- Realtime-DB und Render-Polling liefern denselben Fehler doppelt → `totalAttempts` wird künstlich aufgebläht
- Im Polling-Pfad fehlte exponentielles Backoff für `rate_limit` (war pauschal 30s statt 60/120/180s)
- Wenn `retryTriggeredRef=true` und ein zweiter retryabler Fehler eintrifft → fiel in `setError()` statt "Retry läuft"
- `sourceProgressId` wurde nicht durch die Retry-Kette propagiert → Backend-Retry-Zählung unzuverlässig

### Lösung

#### Frontend (`UniversalAutoGenerationProgress.tsx`)
1. `lastFailureSignatureRef` — Dedup-Guard für identische Failure-Events
2. Retry-Guard: retryable Fehler bei bereits geplantem Retry → ignorieren statt `setError()`
3. Polling-Pfad Backoff: `rate_limit` → 60s/120s/180s exponentiell mit Countdown-UI
4. Failure-Signature Reset bei neuem Retry-Start

#### Backend (`auto-generate-universal-video/index.ts`)
1. `chainSourceProgressId` = sourceProgressId-Kette bis zum Original
2. Propagation in content_config, result_data (ready_to_render + failed)
3. Retry-Zählung filtert auf chainSourceProgressId

---


## r33 — Audio-Corruption-Recovery (IMPLEMENTED)

### Problem
- Render crasht mit `ffprobe` exit code 1: korrupte MP3-Datei (HTML-Fehlerseite oder leerer Response als `.mp3` gespeichert)
- Fehler wurde als `unknown` klassifiziert → falsche Retry-Strategie (FPS-Reduktion statt Audio-Strip)
- Alle 3 Retries scheitern identisch, weil dieselbe korrupte Audio-Datei wiederverwendet wird

### Lösung
Audio-Corruption wird jetzt als eigene Kategorie `audio_corruption` erkannt. Retry-Strategie entfernt Audio-Quellen aus dem Payload.

### Änderungen

#### Fehlerklassifikation (3 Dateien)
Neue Regex VOR `validation` (da "invalid" auch in ffprobe-Fehlern vorkommt):
```
/ffprobe.*failed|ffprobe.*exit code|invalid data found.*processing input|failed to find.*mpeg audio|not a valid audio/i → 'audio_corruption'
```
- `remotion-webhook/index.ts` — classifyError()
- `check-remotion-progress/index.ts` — errorCategory block
- `UniversalAutoGenerationProgress.tsx` — classifyPipelineError()

#### Retry-Strategie (`auto-generate-universal-video/index.ts`)
`runRenderOnlyPipeline()` — Audio-Corruption-Branch:
- **Audio-Corruption erkannt**: FPS bleibt bei 30, Audio wird gestripped
  - `voiceoverUrl = undefined`, `backgroundMusicUrl = undefined`, `backgroundMusicVolume = 0`
  - `subtitles.segments = []` (keine Untertitel ohne Audio)
  - Flag `r33_audioStripped: true` in `inputProps.diag` + `result_data`
- Frontend: 5s Wartezeit (statt 30s), Label "Audio-Fehler"

### Erwartetes Ergebnis
```text
Audio-Corruption, 1. Retry:
  → Kategorie: audio_corruption (nicht mehr unknown)
  → FPS: 30 (unverändert)
  → Audio: komplett entfernt (voiceover + background music)
  → Video wird ohne Ton fertiggestellt ✅
```

---

## r32 — Lottie-Stall-Recovery (IMPLEMENTED)

### Problem
- Render crasht mit `A delayRender() "Waiting for Lottie animation to load"` 
- Fehler wurde als `unknown` klassifiziert → falsche Retry-Strategie (FPS-Reduktion statt Lottie-Fix)

### Lösung
Lottie-Stall wird jetzt als `lambda_crash` erkannt. Retry-Strategie deaktiviert gezielt Lottie statt FPS zu senken.

### Änderungen

#### Fehlerklassifikation (4 Dateien)
Neue Regex VOR generischem `lambda_crash`:
```
/waiting for lottie|delayrender.*lottie|lottie.*animation.*load/i → 'lambda_crash'
```
- `remotion-webhook/index.ts` — classifyError()
- `check-remotion-progress/index.ts` — errorCategory block
- `invoke-remotion-render/index.ts` — classifyImmediate()
- `UniversalAutoGenerationProgress.tsx` — classifyPipelineError() (VOR timeout-Check, da Lottie-Errors docs-Links mit "timeout" enthalten können)

#### Retry-Strategie (`auto-generate-universal-video/index.ts`)
`runRenderOnlyPipeline()` — Lottie-aware Branching:
- **Lottie-Stall erkannt** (`lambda_crash` + Lottie-Regex in errorMessage):
  - FPS bleibt bei 30 (kein Downgrade!)
  - Retry 1: `disableLottieIcons=true`, `disableMorphTransitions=true`, `forceEmbeddedCharacterLottie=true`
  - Retry 2/3: `disableAllLottie=true` (komplett)
  - Flags werden in `inputProps.diag` injiziert + in `result_data` persistiert
- **Sonstiger lambda_crash** (nicht Lottie): Defensive Lottie-Disable + FPS-Reduktion
- Timeout/Rate-Limit/Unknown: Verhalten unverändert (wie r28/r31)

#### Observability
- `bundle_probe`: `r29-lambda240s` → `r32-lottieRecovery`

### Erwartetes Ergebnis

```text
Lottie-Stall, 1. Retry:
  → Kategorie: lambda_crash (nicht mehr unknown)
  → FPS: 30 (unverändert)
  → Flags: disableLottieIcons + disableMorphTransitions + forceEmbeddedCharacterLottie
  → Render sollte durchgehen ✅

Lottie-Stall, 2. Retry (falls nötig):
  → disableAllLottie=true → alle Lottie-Komponenten aus
  → Maximale Stabilität ✅

Normaler Run ohne Lottie-Stall:
  → Volle 30fps Qualität, alle Effekte ✅
```

---

## r31 — Lambda 600s + Hybrid Backoff (IMPLEMENTED)

### Problem
- 8 Lambdas + 240s Timeout → 225 fpl × 2.1s = 472s → TIMEOUT ❌
- 20 Lambdas + 240s Timeout → Rate Limit (AWS Concurrency ~10) ❌

### Lösung
Neue Lambda-Funktion mit **600s Timeout** deployed. 8 Lambdas bleiben unter dem Concurrency-Limit und haben genug Zeit.

### Änderungen

#### `_shared/remotion-payload.ts`
- `LAMBDA_TIMEOUT_SECONDS`: 240 → **600**
- `TARGET_MAX_LAMBDAS`: 20 → **8**
- Soft-Max: 84 → **210** fpl
- Hard-Max: 120 → **300** fpl
- bundle_canary: `r31-lambda600s`

#### Alle 5 Render Edge Functions (Fallback-Namen)
- `240sec` → `600sec` in:
  - `invoke-remotion-render/index.ts`
  - `render-with-remotion/index.ts`
  - `render-universal-video/index.ts`
  - `render-directors-cut/index.ts`
  - `auto-generate-universal-video/index.ts`

#### `remotion-webhook/index.ts`
- Timeout-Fehlermeldung: "240s" → "600s"

#### `UniversalAutoGenerationProgress.tsx` (Frontend)
- Rate-Limit-Retry: **exponentieller Backoff** (60s / 120s / 180s für Attempt 1/2/3)
- Timeout/Crash-Retry: flat 30s (wie bisher)
- Live-Countdown-Anzeige: "🔄 Rate-Limit — Auto-Retry in 58s (1/3)..."
