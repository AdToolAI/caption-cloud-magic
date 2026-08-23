# V467 — Verdict gegen die Sprachhüllkurve normalisieren

## Status

- **V467-A = PASS / CLOSED**
- **V467-B = REJECTED BY DATA**
- **V465 bleibt die autoritative Verdict-Metrik.**
- **V466 Gray-Band-Regel bleibt bestehen.**
- **Keine weiteren Änderungen / kein S01-Rerender — STOP.**

## Finale Hierarchie der untersuchten Kennzahlen

| Kennzahl | Status | AUC (unabhängige Kohorte) | Bemerkung |
|---|---|---|---|
| `mouth_over_frame` | **autoritativ** | **0.980** | Verdict-Metrik seit V465-B2b. |
| `corr_rms_best_lag` | Telemetrie | 0.853 | Nützlich für Diagnose, nicht für Verdict. |
| `v_over_u` | Telemetrie | 0.806 | Nützlich für Diagnose, nicht für Verdict. |
| `corr_zero` | Telemetrie | 0.754 | Nützlich für Diagnose, nicht für Verdict. |
| `old_delta` / V434-MAD | Legacy/Diagnose | — | Nicht autoritativ. |

## Warum V467-B abgelehnt wurde

Die Hypothese aus V466-B — dass `speech_locked_mouth_edit` Szenenbewegungs-Unsicherheit
aufheben könnte — hat sich auf der unabhängigen Kohorte **nicht generalisiert**:

- `mouth_over_frame` bleibt die stärkste robuste Trennung (AUC 0.980).
- Die saubere V466-B-Trennung innerhalb von S01 war ein Einzelszenen-Effekt.
- Gegenbeispiele: GOLD0 und COH19 zeigen `v/u ≈ 0.98` trotz bestätigtem MOVED;
  COH23 zeigt `v/u = 1.32` trotz echtem NOOP.

Eine Promotion von V467-A zu V467-B wäre Overfitting auf S01 gewesen.

## Verbleibender Sachverhalt

- Einige Provider-Outputs sind echte mundspezifische Edits und werden von V465 korrekt erkannt.
- Andere sind echte bzw. sehr schwache Passthroughs.
- Eine zusätzliche Audio-Hüllkurven-Korrelation erklärt diese Unterschiede über
  verschiedene Szenen hinweg nicht zuverlässig.

## Nächste Untersuchung (wenn wieder geöffnet)

Sollte später wieder angegangen werden, sollte die nächste Untersuchung **nicht nochmals am Verdict ansetzen**, sondern an den tatsächlich verbleibenden echten NOOP-Fällen.
