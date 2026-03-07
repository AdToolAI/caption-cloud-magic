

## Diagnose

Die Edge Function Logs bestätigen zwei aktive Bugs:

### Bug 1: `LAMBDA_TIMEOUT_SECONDS is not defined` (ReferenceError)
- **Zeile 1414** in `auto-generate-universal-video/index.ts` referenziert `LAMBDA_TIMEOUT_SECONDS`
- Die Konstante ist in `_shared/remotion-payload.ts` Zeile 15 definiert, aber als `const` (nicht `export`)
- Sie wird auch nicht importiert in `auto-generate-universal-video/index.ts` (Zeile 4)
- **Ergebnis**: Jeder Retry crasht sofort mit ReferenceError

### Bug 2: Initial-Pfad FPS-Reduktion reicht nicht
- Zeile 909: `if (mainScheduling.needsFpsReduction && fps > 24)` → reduziert nur auf 24fps
- Bei 60s Video mit 24fps = 1440 Frames, 1 Lambda (Stability Mode): `1440 × 2.0s = 2880s >> 600s Timeout`
- `timeoutBudgetOk: false` wird geloggt aber ignoriert — der Render startet trotzdem
- Der Retry-Pfad (Zeile 1409) geht auf 15fps, aber der initiale Pfad nicht

## Fix-Plan

### 1. Export `LAMBDA_TIMEOUT_SECONDS` aus `_shared/remotion-payload.ts`
- Zeile 15: `const LAMBDA_TIMEOUT_SECONDS = 600;` → `export const LAMBDA_TIMEOUT_SECONDS = 600;`

### 2. Import in `auto-generate-universal-video/index.ts`
- Zeile 4: `LAMBDA_TIMEOUT_SECONDS` zur bestehenden Import-Zeile hinzufügen

### 3. Initial-Pfad Budget-Enforcement (Zeilen 907-914)
- Nach der ersten FPS-Reduktion (30→24) prüfen ob `timeoutBudgetOk` immer noch `false`
- Falls ja: weiter auf 15fps reduzieren (gleiche Logik wie Retry-Pfad Zeile 1409)
- Falls danach immer noch `timeoutBudgetOk: false`: Render mit klarer Fehlermeldung abbrechen

### Betroffene Dateien
| Datei | Änderung |
|---|---|
| `supabase/functions/_shared/remotion-payload.ts` | `export` vor `LAMBDA_TIMEOUT_SECONDS` |
| `supabase/functions/auto-generate-universal-video/index.ts` | Import + Initial-Pfad Budget-Enforcement |

