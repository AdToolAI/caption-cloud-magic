# Plan v253 — Face-Gate TDZ-Fix (Hoist-Variante)

## Root Cause
In `supabase/functions/compose-dialog-segments/index.ts` referenzieren die Face-Gate-Log-Aufrufe an Zeilen **6433, 6473, 6504** die Variable `attempt` via `preclipMetricsForPass(pass, attempt, usePassPreclip)`. `attempt` wird aber erst an Zeile **6716** als `let attempt = 0;` in der 429-Backoff-Retry-Schleife deklariert — gleiche Funktionsscope → JavaScript TDZ → `Cannot access 'attempt' before initialization`. Jeder Dispatch crasht, bevor überhaupt zu Sync.so gefetcht wird.

Regression stammt aus v249 (Preclip-Metriken-Erweiterung): die drei Pre-Dispatch-Log-Aufrufe wurden mit `attempt` ergänzt, ohne zu bemerken dass die Retry-Variable weiter unten deklariert ist.

## Fix — Hoist (Single Source of Truth)
`let attempt = 0;` wird aus der 429-Retry-Schleife an den Anfang des Dispatch-Blocks für den aktuellen Pass gehoben — vor den Face-Gate-Log-Sektionen (also oberhalb Zeile 6433, im selben Scope wie die spätere Retry-Schleife). Die Zeile an 6716 entfällt.

Ergebnis:
- Face-Gate-Logs referenzieren `attempt` legal (Wert = 0, weil noch kein Sync.so-Call passiert ist).
- 429-Retry-Schleife nutzt exakt dieselbe Variable, inkrementiert wie gehabt (`attempt++`).
- Post-Dispatch-Logs (6793, 6988) und `attempt`-Anzeige in Log-Prefixes bleiben unverändert und semantisch korrekt.
- Eine Deklaration, ein Zähler, keine Literale mehr.

## Scope
- Datei: `supabase/functions/compose-dialog-segments/index.ts` (Zeile mit `let attempt = 0` verschieben — kein Verhaltens-Delta, nur Scope-Hoist).
- Log-Prefix bumpt intern auf `v253-face-gate-tdz-hoist`.
- Keine DB-Änderung, keine anderen Functions, kein Schema-Touch.

## Verifikation
1. Aktuell gecrashte Szene über „Neu rendern" antriggern.
2. Edge-Logs: kein `dispatch_crash: Cannot access 'attempt'` mehr; stattdessen normale v252-AWS-Face-Gate-Zeilen (`[face-gate] v252-aws-face-gate-primary …`).
3. `syncso_dispatch_log` bekommt reguläre Einträge (`SUBMITTED` / `COORD_AUTO_SNAPPED` / `FACE_GATE_PROBE_UNAVAILABLE` / `FACE_GATE_BLOCKED`), kein Sofort-Crash.
4. Bei 429 von Sync.so: Retry-Schleife läuft wie vorher, Log zeigt `429_RETRY attempt=1/3 …`.
