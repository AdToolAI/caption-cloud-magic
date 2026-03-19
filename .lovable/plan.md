
## r60 — Phase 9+10: Visual Prompt Engineering & Cinematic Post-Production (IMPLEMENTED)

### Phase 9: Visual Prompt Engineering
- Erweiterte `NEGATIVE_PROMPT` in `generate-premium-visual/index.ts` um QR codes, barcodes, logos, UI elements, screenshots, mockups, watermarks
- Erweiterte `sanitizePrompt()` Regex um QR/Logo/Screenshot/Mockup-Begriffe
- Anti-Artefakt-Suffix in `auto-generate-universal-video/index.ts` Scene-Prompts injiziert

### Phase 10: Cinematic Post-Production Layer
- `CinematicPostLayer` Komponente in `UniversalCreatorVideo.tsx` mit Film Grain (animiert via Frame), Vignette und Color Grading
- `getCinematicProfile()` Mapping: 12 Kategorien → mood/grain/vignette Profile
- Color Grading via CSS `filter` pro Mood (warm/cool/neutral/dramatic/bold)
- Film Grain als animiertes Noise-Pattern mit `mix-blend-mode: overlay`
- S3-Bundle-Redeploy noetig (Remotion-Aenderung), Bundle Canary: `r60-phase9-10-cinematic`

---

## r42 — Error Isolation Mode (IMPLEMENTED)

### Problem
- `lambda_crash` mit Lottie-Timeout dominiert, aber `disableAllLottie=true` hilft nicht
- Scheduling erzeugt `framesPerLambda=1440, fps=24, estTime=2880s, timeout=600s` → garantierter Timeout
- Keine Forensik pro Attempt → Fehlerquelle unklar

### Lösung
1. **Timeout Budget Enforcement**: `calculateScheduling()` gibt `estRuntimeSec` + `timeoutBudgetOk` zurück. Render-Only Pipeline erzwingt fps=15 wenn Budget überschritten.
2. **Isolation Ladder**: Statt generischem Retry feste A/B/C-Stufen:
   - Step A: Standard Stability Mode
   - Step B: Alle riskanten Subsysteme aus (Lottie, SceneFx, PrecisionSubtitles)
   - Step C: Maximum Isolation + fps=15
3. **Forensics**: `isolationStep`, `effectiveFlags`, `sourceErrorSignature`, `failureStage`, `estRuntimeSec`, `timeoutBudgetOk` in result_data und content_config
4. **UI**: Diagnose-Panel zeigt Isolation-Step, effektive Flags, Error-Signatur, Budget-Status

### Betroffene Dateien
- `supabase/functions/_shared/remotion-payload.ts` (SchedulingResult + Budget-Check)
- `supabase/functions/auto-generate-universal-video/index.ts` (Isolation Ladder + Budget Enforcement)
- `supabase/functions/invoke-remotion-render/index.ts` (failure_stage + canary)
- `supabase/functions/remotion-webhook/index.ts` (failure_stage + errorFingerprint in result_data)
- `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx` (r42 Diagnose-Panel)

---

## r41 — Silent Render + Audio Mux (IMPLEMENTED)

### Problem
- UI zeigt generischen "non-2xx"-Fehler statt Cooldown-UI bei 429/capacity_cooldown
- Stability-Scheduling griff nur bei 20% (zufällig), meiste Renders liefen distributed → rate_limit
- Retries erzwangen Stability nur bei rate_limit, nicht bei timeout/lambda_crash/audio_corruption

### Lösung
- **UI**: `FunctionsHttpError.context.json()` robust parsen → Cooldown-UI statt Error
- **Scheduling**: 100% Stability (Hotfix), hash-basiert statt random, alle retryable Kategorien → stability
- **Retries**: `forceStability: true` für jeden Retry
- **Observability**: schedulingMode, framesPerLambda, estimatedLambdas, fpsUsed in result_data


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
