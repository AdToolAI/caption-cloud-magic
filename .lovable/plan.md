# Lip-Sync Advance-Deadlock beheben (v98)

## Problem
4-Sprecher-Szene `c269ea2e` hängt seit >10 Min in `syncso_fanout_1_of_4`. Pass 1 wurde korrekt dispatched (Face-Gate hat Koordinaten repariert), aber alle Advance-Läufe für Pass 2–4 werden jede Minute vom v87 SANITY-BLOCK abgewiesen:

- Im Advance-Modus werden Plate-Identity und Face-Gate übersprungen (`if (!isAdvance)`), die frischen `coordSources` sind daher immer `heuristic`.
- Der SANITY-BLOCK prüft nur die frische Quelle — er ignoriert, dass die gespeicherten Passes bereits **face-gate-reparierte Koordinaten** (`face_repair`) aus dem ersten Lauf tragen.
- Ergebnis: Endlosschleife „awaiting retry" ohne Timeout.

## Fix (compose-dialog-segments/index.ts)

1. **SANITY-BLOCK verifizierte Passes durchlassen:** Vor dem Block prüfen, ob `passes[currentPassIdx]` ein `face_repair`-Objekt oder eine zuvor gespeicherte nicht-heuristische Koordinaten-Provenienz hat. Wenn ja → Dispatch erlauben (Koordinaten wurden beim ersten Lauf gegen den echten Plate-Frame validiert).
2. **Provenienz persistieren:** Beim ersten Dispatch `coords_source` (z. B. `face_gate_repair`, `plate-identity`) am Pass speichern, damit Advance-Läufe sie lesen können — nicht nur indirekt über `face_repair`.
3. **Endlosschleifen-Stopp:** Wenn der SANITY-BLOCK denselben Pass >5× hintereinander blockt (Zähler in `dialog_shots`), Szene auf `failed` setzen mit Refund der noch nicht dispatchten Passes — statt unendlich zu spinnen. (Memory-Regel: idempotente Refunds.)

## Sofortmaßnahme für die hängende Szene
Nach Deploy die Szene `c269ea2e` per `reset-lipsync-scene`-Logik nicht nötig — der nächste Cron-Tick (1 Min) greift mit dem Fix automatisch, da die reparierten Koordinaten in den Passes liegen. Falls Pass 1 bei Sync.so inzwischen fertig ist, advanced der Webhook sofort weiter.

## Verifikation
- Edge-Logs: `ADVANCE` Dispatch für Pass 2–4 statt SANITY-BLOCK.
- `twoshot_stage` wandert von `syncso_fanout_1_of_4` → `2_of_4` → … → `done`.
- DB-Check: `lip_sync_status='done'` für die Szene.

## Technische Details
- Betroffen: nur `supabase/functions/compose-dialog-segments/index.ts` (Sanity-Guard ~Zeile 1825, Pass-Build/Dispatch-Pfad für Provenienz-Feld).
- Kein Schema-Change; Zähler + `coords_source` leben im bestehenden `dialog_shots`-JSONB.
- Deploy: `compose-dialog-segments`.
