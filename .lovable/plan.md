

## Diagnose: Warum r26 den Timeout nicht löst

### Fakten aus der Datenbank (letzte 3 Tage):
- **207 Render-Versuche**, davon nur **2 mit `renderOnly=true`**
- Letzter Render (`mo43kib8ui`): **fpl=225, fps=30, 1800 Frames → Timeout** (nicht Rate-Limit!)
- Vorherige Renders: **fpl=168 → Rate-Limit** (altes Code vor r26)
- r26 hat das Rate-Limit-Problem gelöst (225 fpl → 8 Lambdas statt 11)
- **Neues Problem**: 225 Frames × echte Renderzeit > 120s → Lambda-Timeout

### Kernproblem: Die Annahme "0.5s pro Frame" ist falsch

Die Berechnung geht von 0.5s/Frame aus (225 × 0.5 = 112.5s < 120s). Aber eure Komposition (Lottie-Character, Subtitles, KenBurns, Sound Effects, Beat-Sync) braucht wahrscheinlich **0.6-0.8s pro Frame**:
- 225 × 0.65s = **146s** → Timeout!

Es gibt also einen **Deadlock zwischen zwei Constraints**:
- `fpl ≤ 168` → 11 Lambdas → Rate-Limit ❌
- `fpl = 225` → 8 Lambdas → Timeout ❌

### Lösung: Die einzige Auflösung ist weniger Frames (24fps bei erstem Versuch)

Da ihr die AWS Concurrency nicht erhöhen könnt und die Renderzeit pro Frame fix ist, muss die **Gesamtframezahl sinken**. Bei 24fps statt 30fps:
- 60s × 24fps = **1440 Frames** (statt 1800)
- 1440 / 8 Lambdas = **180 fpl**
- 180 × 0.65s = **117s** → knapp unter 120s ✅

Für maximale Sicherheit: Soft-Target **6 Lambdas**:
- 1440 / 6 = **240 fpl** → aber 240 × 0.65s = 156s → zu viel
- Also: 1440 / 8 = 180 fpl → **8 Lambdas bei 24fps** ✓

## Plan: r27 — Erster Versuch mit 24fps, Retry mit aggressivem Scheduling

### Änderung 1: `_shared/remotion-payload.ts`
- `ESTIMATED_SECONDS_PER_FRAME` von `0.5` auf `0.65` korrigieren
- Soft-Max wird `floor(120 / 0.65 * 0.7)` = **129 Frames** (statt 168)
- Hard-Max wird `floor(120 / 0.65)` = **184 Frames** (statt 240)
- Für 1800 Frames (30fps): `concurrencySafe = ceil(1800/8) = 225 > 184` → **`needsFpsReduction = true`**
- Für 1440 Frames (24fps): `concurrencySafe = ceil(1440/8) = 180 > 129` aber `≤ 184` → **fpl=180, 8 Lambdas** ✅

### Änderung 2: `auto-generate-universal-video/index.ts` — Hauptpipeline
- **Vor** dem Payload-Bau: `calculateScheduling` aufrufen
- Wenn `needsFpsReduction = true` → fps von 30 auf 24 reduzieren, `durationInFrames` anpassen
- So wird **der erste Versuch** schon mit 24fps gebaut → kein Timeout → kein Retry nötig
- r26 hat das nur im `runRenderOnlyPipeline` eingebaut, nicht im Hauptpfad

### Änderung 3: `auto-generate-universal-video/index.ts` — Render-Only Pipeline
- Retry-Attempt 1: 24fps, 6 Lambdas → `ceil(1440/6) = 240` → Hard-Limit von 184 → nochmal fps runter auf 20fps: `60×20=1200, ceil(1200/6)=200` → noch über 184. Alternative: 5 Lambdas, `ceil(1200/5)=240` → immer noch zu hoch.
- **Besserer Ansatz für Retries**: Weniger Lambdas aber mit der korrigierten Zeitschätzung:
  - Retry 1: 24fps, 8 Lambdas → fpl=180 (117s)
  - Retry 2: 24fps, 6 Lambdas → fpl=240 → **muss auf max 184 gekappt werden** → 8 Lambdas effektiv → identisch. Stattdessen: **20fps fallback** → 1200 frames, 6 Lambdas = 200 fpl × 0.65 = 130s → über 120s.
  - Realistische Fallback-Kette: 24fps@8λ → 20fps@8λ (150 fpl, 97.5s) → 15fps@6λ (150 fpl, 97.5s)

### Änderung 4: Frontend (`UniversalAutoGenerationProgress.tsx`)
- Keine Logik-Änderung nötig — die bestehende Render-Only-Retry-Logik funktioniert
- Nur: `errorCategory` bei `timeout` Webhook-Fehler korrekt durchreichen → ist bereits implementiert

### Zusammenfassung der erwarteten Ergebnisse:

```text
Vorher (r26):
  30fps → 1800 Frames → fpl=225 → 8λ → 225×0.65s=146s → TIMEOUT ❌

Nachher (r27, 1. Versuch):
  30fps → scheduling sagt needsFpsReduction
  → 24fps → 1440 Frames → fpl=180 → 8λ → 180×0.65s=117s → OK ✅

Nachher (r27, Retry 1):
  20fps → 1200 Frames → fpl=150 → 8λ → 150×0.65s=97.5s → OK ✅

Nachher (r27, Retry 2):
  15fps → 900 Frames → fpl=150 → 6λ → 150×0.65s=97.5s → OK ✅
```

### Dateien:
- `supabase/functions/_shared/remotion-payload.ts` — korrigierte Zeitschätzung (0.65s)
- `supabase/functions/auto-generate-universal-video/index.ts` — fps-Reduktion **im Hauptpfad** + verbesserte Retry-fps-Kette
- `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx` — Timeout besser als Infrastruktur-Fehler klassifizieren (falls nicht schon)

