

## r29 — Lambda 240s Upgrade: Code-Anpassung

Du hast die neue Lambda (`remotion-render-4-0-424-mem3008mb-disk2048mb-240sec`) korrekt als Secret gespeichert. Jetzt muss der Code die neuen Limits kennen.

### Was sich ändert

**Datei 1: `supabase/functions/_shared/remotion-payload.ts`**
- `LAMBDA_TIMEOUT_SECONDS`: 120 → **240**
- `ESTIMATED_SECONDS_PER_FRAME`: 0.65 → **1.0**
- Daraus ergibt sich: Soft-Max = **168 fpl**, Hard-Max = **240 fpl**
- Für 30fps/60s (1800 Frames / 8 Lambdas = 225 fpl): 225 ≤ 240 → **kein FPS-Reduktion nötig** ✅
- Log-Prefix auf `r29` aktualisieren

**Datei 2: `supabase/functions/auto-generate-universal-video/index.ts`**
- Default-Fallback-Funktionsname: `remotion-render-4-0-424-mem2048mb-disk2048mb-120sec` → `remotion-render-4-0-424-mem3008mb-disk2048mb-240sec`
- Main-Path: `needsFpsReduction` wird bei 30fps/1800 Frames **nicht mehr ausgelöst** (225 < 240), also bleibt 30fps erhalten
- `bundle_canary` / `bundle_probe` auf `r29-lambda240s` setzen
- Retry-FPS-Kette bleibt als Safety-Net (24→20→15), greift nur bei extrem langen Videos

### Erwartetes Ergebnis

```text
30fps → 1800 Frames → fpl=225 → 8 Lambdas → 225×1.0s = 225s < 240s ✅
→ ERSTER VERSUCH MIT VOLLER QUALITÄT (30fps)
```

Kein FPS-Downgrade mehr nötig für Standard-60s-Videos.

