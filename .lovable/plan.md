

## Analyse der neuen Logs: Das 240s-Lambda wird korrekt aufgerufen — aber reicht NICHT aus

### Beweis aus den Logs

| Render ID | Zeitpunkt | FPS | Frames | FPL | Lambda | Ergebnis |
|-----------|-----------|-----|--------|-----|--------|----------|
| `a4nrs08x92` → `1lf34pthas` | 17:01:59 – 17:06:00 | 30 | 1800 | 225 | **mem3008mb-240sec** ✅ | **TIMEOUT** |
| `0gmb3y3g8n` → `nuk2ox6ezt` | 17:06:33 – 17:10:33 | 15 | 900 | 113 | **mem3008mb-240sec** ✅ | **TIMEOUT** |

Die 240s-Lambda wird korrekt aufgerufen (bestätigt durch `bundle_probe: r29-lambda240s`). Aber **beide Versuche laufen exakt 240 Sekunden und enden mit `type: timeout`**.

### Das eigentliche Problem: falsche Renderzeit-Schätzung

```text
Render 2: 113 Frames / Lambda, 240s Timeout → jeder Frame braucht >2.12s
Unsere Schätzung: 1.0s/Frame
Reale Messung:    >2.1s/Frame  ← DOPPELT SO LANGSAM WIE GESCHÄTZT
```

Die Komposition (Lottie-Character mit Lip-Sync, KenBurns, Morph-Transitions, PrecisionSubtitles, Beat-Sync) ist schlicht doppelt so komplex wie angenommen. Die Lösung ist NICHT "noch mehr Timeout" (300s max bei AWS), sondern **weniger Frames pro Lambda durch mehr parallele Lambdas**.

### Lösung: r30 — Korrekte Renderzeit + mehr Lambdas

**Datei: `supabase/functions/_shared/remotion-payload.ts`**

Zwei Werte ändern:
- `ESTIMATED_SECONDS_PER_FRAME`: 1.0 → **2.0** (basierend auf realer Messung)
- `TARGET_MAX_LAMBDAS`: 8 → **20**

Daraus ergeben sich:
- SOFT_MAX: `floor(240 / 2.0 × 0.7)` = **84 fpl**
- HARD_MAX: `floor(240 / 2.0)` = **120 fpl**

Neues Scheduling für 30fps/60s (1800 Frames):
```text
1800 Frames / 20 Lambdas = 90 fpl
90 × 2.0s = 180s < 240s ✅  PASST!
```

**Datei: `supabase/functions/auto-generate-universal-video/index.ts`**

- Zeile 1315: `estTime`-Berechnung von `0.65` auf `2.0` korrigieren
- `bundle_probe` auf `r30-correctEstimate` setzen

### Erwartetes Ergebnis

```text
VORHER:  8 Lambdas × 225 fpl × 2.1s = 472s >> 240s → TIMEOUT
NACHHER: 20 Lambdas × 90 fpl × 2.1s = 189s < 240s → ERFOLG ✅
```

Volle Qualität (30fps, alle Effekte), kein Feature-Downgrade. Die 20 Lambdas laufen parallel und sollten keine Rate-Limits auslösen (AWS Standard-Concurrency ist 1000).

