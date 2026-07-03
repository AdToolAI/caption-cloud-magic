## Ziel

Gleichzeitige Lambda-Renderer von aktuell **max. 8** (Distributed-Mode) auf **max. 5** reduzieren. Das entspricht dem, was der Stability-Mode ohnehin schon macht (r57), und war früher der stabile Wert, bevor r31 auf 8 hochgezogen hat.

## Aktueller Stand

`supabase/functions/_shared/remotion-payload.ts`:
- `TARGET_MAX_LAMBDAS = 8` (Distributed-Mode)
- `stabilityLambdas` Ladder → max **5** (Stability-Mode, r57)
- Timeout: 600 s/Lambda, ~2 s/Frame

Da wir seit r40 quasi 100 % im Stability-Mode fahren (`STABILITY_CANARY_PERCENT = 1.0`), werden aktuell in der Praxis eh selten mehr als 5 Lambdas verwendet — außer wenn irgendwo explizit `distributed` gesetzt wird oder ein Composer-Multi-Scene-Stitch parallel läuft.

## Änderung

Nur eine Zeile in `supabase/functions/_shared/remotion-payload.ts`:

```
const TARGET_MAX_LAMBDAS = 5;   // war 8
```

Retry-Fallback (`Math.max(3, maxLambdas - retryAttempt * 2)`) reduziert dann bei Retries weiter auf 3 → 3 → 3, was gewollt ist (weniger AWS-Druck bei Wiederholungen).

Kein weiterer Code muss angefasst werden. Stability-Ladder bleibt unverändert bei max 5.

## Erwartete Render-Dauer

Grundlage: `ESTIMATED_SECONDS_PER_FRAME ≈ 2.0 s`, Lambdas rendern parallel, Runtime ≈ `framesPerLambda × 2 s`.

| Video-Länge (30fps) | Frames | Bei 5 λ (fpl) | Erwartete Render-Dauer* |
|---|---|---|---|
| 10 s | 300 | 60 fpl → clamped auf min 270 (1 λ) | ~2–3 min |
| 20 s | 600 | 120 → clamped auf 270 (2 λ) | ~3–5 min |
| 30 s | 900 | 180 → 270 (3 λ) | ~5–6 min |
| 50 s | 1500 | 300 → 300 (5 λ) | ~6–8 min |
| 60 s | 1800 | 360 → 300 (6 λ) ⚠️ | ~7–9 min, `needsFpsReduction=true` → Auto-Fallback auf 24 fps |
| 90 s | 2700 | 540 → 300 (9 λ) ⚠️ | wie oben, fps-Reduktion greift |

\* inklusive Bundle-Load, Warm-up, Encode, Upload; typischer Overhead 30–60 s.

**Praktisch heute (Stability-Mode aktiv):** die Runtimes ändern sich für alles ≤ 50 s nicht spürbar, weil die Stability-Ladder ohnehin schon bei 5 gecappt ist. Der neue Cap greift v. a. für Composer-Multi-Scene-Stitches im Distributed-Mode: dort statt ~7 min mit 8 λ eher ~9–10 min mit 5 λ, dafür deutlich weniger AWS-Rate-Limit-Fails.

## Warum es „früher" funktioniert hat

Vor r31/r57 war der Cap effektiv bei ~3–5 Lambdas (Stability-Mode default). r31 hat auf 8 erhöht, um die 600 s-Timeout-Deadlock-Situation zu lösen — das hat aber wieder häufiger AWS-Concurrency-Fehler (429) produziert, weshalb r40 in der Praxis alles auf Stability (=5) zurückgestellt hat. Der neue Cap zieht Distributed nach.

## Kein Impact auf

- Video-Composer Motion-Studio (nutzt kein Remotion Lambda)
- Sync.so / Hailuo / Provider-Renders
- Director's Cut Preview / Playback