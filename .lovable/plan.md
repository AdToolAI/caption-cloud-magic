# Nächster Schritt: Ehrlichkeit vor Feature — Golden-Core-Reduktion

Nach dem korrigierten Befund (0 visuell bestätigte 3+-Sprecher-Szenen, 2 nur
technische Mux-Erfolge, `motion_unverified` wird als `ssw:success` verbucht) ist
der richtige Schritt **kein weiterer V5xx-Patch** und **kein Blind-Rollback**,
sondern zwei Dinge in dieser Reihenfolge:

1. Aufhören, unbewiesene Ergebnisse als Erfolg zu zählen.
2. Die Kette auf den einzigen gemessenen funktionierenden Kern reduzieren.

## Schritt 1 — Wahrheits-Gate (klein, sofort, kein Geometrie-Eingriff)

Ziel: Eine Szene darf nur dann `complete` heißen, wenn Mundbewegung
nachgewiesen wurde.

- `sync-so-webhook`: `motion_unverified` darf nicht mehr über `ssw:success`
  terminieren. Neuer Endzustand `needs_review` (kein Refund-Verlust, kein
  Provider-Call, kein Retry).
- `lipsync-watchdog`: gleicher Vertrag beim Einmal-Recheck.
- Kein Threshold, kein Gate, keine Maske, kein Provider wird angefasst.

Wirkung: Ab sofort zeigt die Datenbank die echte Erfolgsquote. Ohne das ist
jede weitere Messung wertlos.

## Schritt 2 — Kontrollierte Kohorten-Freigabe

Statt „alles muss für 1–4 Sprecher gleichzeitig laufen":

| Kohorte | Status | Vorgehen |
| --- | --- | --- |
| 1 Sprecher | läuft nachweislich | freigegeben lassen |
| 2 Sprecher | teils Provider-Erfolg, Motion unbewiesen | mit Wahrheits-Gate neu messen |
| 3+ Sprecher | 0 bestätigte Erfolge | temporär im UI sperren, bis Golden-Core steht |

Die Sperre für 3+ ist ehrlicher als teure Runs, die fehlschlagen — und sie
stoppt den Kreditverbrauch sofort.

## Schritt 3 — Golden-Core statt Gate-Stapel

Basis ist nicht die v400-Prosa, sondern der gemessene Golden Run
`c934a823` (`docs/v500-a-golden-contract.md`): statischer Face-Center-Crop,
face_share 0.25–0.40, face_size ≥ 144 px, sync-3 / bbox-url-pro / cut_off.

Alles, was seitdem dazukam und im Golden Run **nicht** nötig war, wird pro Gate
einzeln geprüft: entweder es hat einen belegten Fehler behoben (bleibt), oder
es ist eine Vermutung (wird zu reiner Telemetrie degradiert, nicht gelöscht).

Erste Kandidaten für Degradierung zu Telemetrie (belegt als Hauptblocker):
`v536_mouth_crop_infeasible`, `face_repair_identity_unresolved`,
`v510_late_fanout_fence`, `v464_asd_contract_invalid`.

## Abschlussbedingung („wann ist gut genug")

Pro freigegebener Kohorte: **20 aufeinanderfolgende kontrollierte Runs,
≥ 90 % visuell bestätigter Lip-Sync, 100 % korrekte Gesichtszuordnung.**
Erreicht → Kohorte wird eingefroren und offiziell unterstützt. Nicht erreicht →
Kohorte bleibt gesperrt, statt sie zahlenden Nutzern zu zeigen.

Das ist der Ausstiegspunkt aus den vier Monaten: nicht „alles perfekt", sondern
„das, was bewiesen funktioniert, ist freigegeben; der Rest ist ehrlich gesperrt".

## Technische Details

- Berührt in Schritt 1: `supabase/functions/sync-so-webhook/index.ts`
  (V500-Outcome-Handling), `supabase/functions/lipsync-watchdog/index.ts`
  (Einmal-Recheck). Additiv, fail-open, keine Schema-Änderung.
- Schritt 2 ist reine Frontend-Gating-Logik im Composer plus eine
  Pre-Dispatch-Abweisung, damit keine Credits belastet werden.
- Schritt 3 wird nicht in einem Zug ausgeliefert, sondern als Gate-Kette mit
  STOP nach jedem Gate und Golden-Fixture-Tests als Messlatte.
- Nicht angefasst: Fencing, Locks, Ledger/Refund, Webhook-Idempotenz,
  Output-Pinning, Pricing, FA-4.

## Reihenfolge

Schritt 1 → messen → Schritt 2 → Schritt 3 gateweise. Nach Schritt 1 STOP mit
Bericht, bevor irgendetwas an der Geometrie bewegt wird.
