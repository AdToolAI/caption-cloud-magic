

## Analyse: Warum r32 nicht greift und der Lottie-Stall weiterhin auftritt

### Kernbefund aus den DB-Logs

Das letzte Rendering (`p8vbhizl00`, Progress `24b15260`) zeigt:

```text
diag_flags_effective:
  disableLottieIcons: false    ← NICHT deaktiviert
  disableAllLottie: false      ← NICHT deaktiviert
  forceEmbeddedCharacterLottie: true  ← nur das war an
  retryAttempt: <nil>          ← war der ERSTVERSUCH
```

**Problem 1: Das Bundle auf S3 ist STALE.** Die r32-Code-Änderungen (diag-Toggle-Checks in `UniversalCreatorVideo.tsx`, Lambda-Detection in `LottieIcons`, etc.) existieren nur im Source-Code. Das auf S3 deployed Bundle (`adtool-remotion-bundle`) enthält noch den alten Code. Deshalb:
- `LottieIcons` wird trotz `disableLottieIcons: true` Flag gemountet (alter Code prüft das Flag nicht)
- `LottieIcons` fetcht LottieFiles-CDN-URLs mit blankem `fetch()` ohne Timeout -- in Lambda hängt das ewig
- `@remotion/lottie` registriert intern `delayRender("Waiting for Lottie animation to load")` und wartet 298s, dann crasht es

**Problem 2: Render-Only-Retry zählt falsch.** Der Counter in `auto-generate-universal-video` zählt ALLE fehlgeschlagenen Progress-Einträge des Users in 30 Minuten, nicht nur Retries für diesen spezifischen Render. Dadurch war das Limit (3/3) schon vor dem ersten r32-Retry erreicht.

**Problem 3: `LottieIcons` hat kein Timeout und keine Lambda-Detection.** Im Gegensatz zu `ProfessionalLottieCharacter` (das `isLambdaEnvironment()` nutzt), fetcht `LottieIcons` blind von CDN-URLs.

### Plan: r34 — Lottie-Stall-Root-Fix

#### A. `LottieIcons.tsx` absichern (Root Cause Fix)
- Lambda-Detection einbauen: In Lambda-Umgebung sofort `continueRender` mit Emoji-Fallbacks aufrufen, KEINE CDN-Fetches
- Fetch-Timeout: Alle `fetch(url)` mit `AbortController` + 5s Timeout absichern
- Globaler Safety-Timer: Falls nach 10s kein `continueRender` kam, automatisch mit Fallbacks auslösen

#### B. `MorphTransition.tsx` absichern
- Gleiche Lambda-Detection: In Lambda sofort SVG-Fallback nutzen, keinen CDN-Fetch
- Fetch-Timeout: 5s AbortController

#### C. Render-Only Retry-Zähler korrigieren (`auto-generate-universal-video/index.ts`)
- Retry-Count nur für Render-Only-Retries zum selben Source-Progress zählen, nicht alle User-Failures
- Filter: `result_data->>'sourceProgressId'` matchen statt alle failed entries

#### D. Bundle-Hinweis
- Nach Code-Änderungen muss das Remotion-Bundle auf S3 neu deployed werden, damit die Fixes in Lambda wirksam werden

### Dateien

1. `src/remotion/components/LottieIcons.tsx` — Lambda-Detection + Fetch-Timeout + Safety-Timer
2. `src/remotion/components/MorphTransition.tsx` — Lambda-Detection + Fetch-Timeout
3. `supabase/functions/auto-generate-universal-video/index.ts` — Retry-Counter-Fix

### Erwartetes Ergebnis
```text
Nach Bundle-Redeploy:
  Normaler Run: Volle Qualität, Lottie-Icons via CDN (Browser-Preview) ✅
  Lambda-Run:   Emoji-Fallbacks für Icons, SVG-Fallback für Transitions ✅
  Kein delayRender-Hang mehr möglich ✅
  Retry-Counter zählt korrekt pro Render-Kette ✅
```

