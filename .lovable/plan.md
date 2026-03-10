

# Diagnose: Warum das Video identisch ist — und der Fix

## Root Cause

Das Video ist byte-identisch weil **kein neues Video erfolgreich gerendert wurde**. Die Datenbank beweist es:

| Render ID | Zeit | FPS | Frames | Status |
|-----------|------|-----|--------|--------|
| `gzuaze5ctj` | 17:33 | **15fps** | 900 | **completed** ← das alte Video |
| `9xm8o277u8` | 18:06 | **15fps** | 900 | **pending** (hängt) |
| `2igd7kgjyr` | 22:02 | **24fps** | 1440 | **failed** ← Lambda-Timeout |

Der Phase-5-Code hat korrekt 24fps erzwungen (1440 Frames statt 900). Aber: **Stability Mode (1 Lambda) kann 1440 Frames nicht in 600s rendern.** Der Render ist am Lambda-Timeout gescheitert. Du hast dann das alte, bereits fertige 15fps-Video heruntergeladen.

## Das eigentliche Problem: Stability Scheduling + Loft-Film FPS = Deadlock

```text
Stability Mode: 1 Lambda für ≤1800 Frames
24fps × 60s = 1440 Frames → 1 Lambda
Reale Renderzeit: ~0.6s/Frame × 1440 = ~864s
Lambda-Timeout: 600s
→ TIMEOUT ❌
```

Bei 15fps (900 Frames × 0.6s = 540s < 600s) hat es noch gerade gepasst.

## Fix: Stability-Scheduling anpassen

**Datei:** `supabase/functions/_shared/remotion-payload.ts`

Die Stability-Mode-Schwelle anpassen: Ab 600 Frames (statt 1800) auf 2 Lambdas, ab 1200 Frames auf 3 Lambdas aufteilen. Das hält die Zuverlässigkeit hoch (kein Rate-Limit-Risiko bei 2-3 Lambdas) und ermöglicht 24-30fps für 60s-Videos.

```text
Neu: 1440 Frames / 3 Lambdas = 480 fpl × 0.6s = 288s < 600s ✅
```

Konkret in `calculateScheduling()`:
- `frameCount <= 500` → 1 Lambda
- `frameCount <= 1000` → 2 Lambdas  
- `frameCount > 1000` → 3 Lambdas (statt bisher max 2)

Damit können wir auch zurück auf **30fps** gehen (1800 Frames / 3 = 600 fpl × 0.6s = 360s < 600s).

**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`

Den fps-Floor von 24 zurück auf **30** setzen — mit dem neuen Scheduling ist genug Budget da.

## Dateien

| Datei | Änderung |
|-------|----------|
| `_shared/remotion-payload.ts` | Stability-Lambda-Schwellen: 1/2/3 statt 1/2 |
| `auto-generate-universal-video/index.ts` | fps-Floor auf 30 zurücksetzen |

## Kein Bundle-Redeploy nötig
Beide Änderungen sind rein serverseitig (Edge Functions). Das S3-Bundle (Template) ist bereits aktuell mit Phase 5.

