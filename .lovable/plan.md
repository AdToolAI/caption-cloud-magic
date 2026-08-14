# v431 / G1 — Finaler Vertrag: SceneCard „Lip-Sync komplett zurücksetzen"

Zielpfad: `SceneCard` → `cancel-dialog-lipsync(reset:true)`. `reset-lipsync-scene` bleibt
unangetastet der Restart-Vertrag. Noch keine Implementierung.

## 1. Freigegeben und unverändert übernommen

- **Base-Plate-Restore**: `base_video_url` primär → `lip_sync_source_clip_url` nur als
  Legacy-Fallback → sonst `materialize('clear')`, wenn die Szene gar kein Video hat →
  sonst **fail closed** (`no_base_plate`, kein Write, Fehler an SceneCard).
  `clip_url` wird nie als Base-Quelle gelesen.
- **Generation-Fencing**: `plate_generation + 1` für **jeden** `reset:true`-Vollreset,
  im selben `UPDATE` wie die Bereinigung.
- **`already_applied`-Ausnahme** ausschließlich für `reset:true`.
- **`active_run_id`** wird nicht geleert und nicht neu interpretiert.
- **SceneCard-Routing** ohne eigenen State-Write, Fehler als Toast.

## 2. Nachgezogen: Stale-Request-Guard (Punkt 1)

Signatur:

```text
composer_reset_lipsync_full(
  _scene_id            uuid,
  _expected_generation integer,          -- Pflicht
  _expected_run_id     uuid DEFAULT NULL -- aus dem Vorab-Read, falls gesetzt
) RETURNS jsonb
```

Die Edge-Function liest unmittelbar vor dem Aufruf `plate_generation` und
`active_run_id` und übergibt beide als Erwartungswerte. Unter demselben `FOR UPDATE`:

```text
SELECT ... FROM composer_scenes WHERE id = _scene_id FOR UPDATE
  IF _expected_generation IS DISTINCT FROM plate_generation
      -> { ok:false, reason:'stale_reset' }, KEIN Write
  IF _expected_run_id IS NOT NULL AND _expected_run_id IS DISTINCT FROM active_run_id
      -> { ok:false, reason:'stale_reset' }, KEIN Write
  IF _expected_run_id IS NULL AND active_run_id IS NOT NULL
      -> { ok:false, reason:'stale_reset' }, KEIN Write   -- inzwischen neuer Run
  Base nach Regel 1 auflösen (nur aus der gelockten Zeile)
      -> kein Kandidat: { ok:false, reason:'no_base_plate' }, KEIN Write
  EIN UPDATE (Fence + Reset gemeinsam), Rückgabe der bekannten Job-IDs
COMMIT
```

Ein verspäteter User-Reset kann damit weder einen zwischenzeitlich gestarteten Run
zurücksetzen noch dessen Generation erhöhen. `stale_reset` ist ein sauberer No-op und
wird SceneCard als Hinweis („Szene wurde zwischenzeitlich neu gestartet") gemeldet.
Job-Cancel gegen Sync.so läuft erst **nach** erfolgreichem Commit, auf den
zurückgegebenen IDs.

## 3. Nachgezogen: Credits (Punkt 2)

**Der Full-Reset verändert in G1 Credits und Reservations nicht — in keinem Fall.**
Kein Refund (weder angewandt noch laufend), keine Manipulation von
`composer_run_reservations`, kein Schreiben auf `wallets` oder `dialog_shots.refunded`.
Damit bleibt die heute gemessene Ist-Semantik von `cancel-dialog-lipsync` exakt erhalten.
`cancel-dialog-lipsync(reset:true)` löst keinen Refund aus, unabhängig davon, ob
Lip-Sync noch läuft oder bereits angewandt wurde. `wallets`,
`composer_run_reservations` und `dialog_shots.refunded` bleiben unverändert. Eine
Vereinheitlichung der Credit-Semantik gehört in einen eigenen Ledger-Track, nicht in
diesen Reset.

Hinweis zur Vollständigkeit: `dialog_shots` wird beim Reset genullt; ein späterer
Refund über diesen Datensatz wäre danach nicht mehr möglich. Das ist identisch zum
heutigen SceneCard-Verhalten und damit keine Regression.

## 4. Nachgezogen: exakte `audio_plan.twoshot`-Keys (Punkt 3)

Bestandsaudit über alle Szenen mit `audio_plan.twoshot` als Objekt (Key → Zeilen):
`speakers` 439, `url` 438, `generatedAt` 437, `totalSec` 437, `useExternalAudio` 436,
`embeddedAudio` 436, `spokenSec` 435, `segments` 427, `faceMap` 344,
`anchor_face_audit` 336, `tts_diagnostics` 262, `dialog_overflow_extended` 262,
`anchor_attempts` 118, `lipsyncedAt` 32, `passes` 32, `syncJobs` 31, `heartbeat` 29,
`diagnostics` 20, `anchor_identity` 7, `preflightCpuRefund` 1, `postFixReset` 1.

**Zu löschende Runtime-/Cache-Keys** (Obermenge der heute in `reset-lipsync-scene`
gelöschten Keys, ergänzt um die reinen Lip-Sync-Laufzeitdaten):

| Key | Warum löschbar |
| --- | --- |
| `faceMap` | Plate-gebundener Face-Cache, heute schon Teil des Reset-Vertrags |
| `anchor_face_audit` | Messwerte des letzten Anchor-Passes, dito |
| `sync_job_id` | Job-Referenz des abgebrochenen Laufs, dito |
| `segments_payload` | Runtime-Payload des letzten Laufs, dito |
| `last_segments` | Runtime-Snapshot, dito |
| `audio_input_mode` | pro-Lauf ausgehandelt, dito |
| `passes` | Sync.so-Pass-/Job-Liste des verworfenen Laufs |
| `syncJobs` | v5-Jobliste des verworfenen Laufs |
| `heartbeat` | Fortschritts-Telemetrie des laufenden Jobs |
| `lipsyncedAt` | Zeitstempel des verworfenen Ergebnisses |
| `diagnostics` | Lauf-Diagnose |
| `anchor_attempts` | Versuchszähler des Anchor-Passes |
| `postFixReset` | Einmal-Marker eines früheren Hotfixes |

**Explizit erhalten** (Dialog-, Audio-Plan- und Konfigurationsdaten, außerhalb der
Lip-Sync-Laufzeit gelesen): `url`, `segments`, `speakers`, `totalSec`, `spokenSec`,
`embeddedAudio`, `useExternalAudio`, `generatedAt`, `tts_diagnostics`,
`dialog_overflow_extended`, `anchor_identity`, `preflightCpuRefund`.
Der `twoshot`-Block selbst wird **nicht** entfernt; die Löschung erfolgt als
`audio_plan #- '{twoshot,<key>}'`-Kette innerhalb desselben atomaren `UPDATE`.

## 5. Restlicher Umsetzungsvertrag

1. Neue Funktion `composer_reset_lipsync_full` (SECURITY DEFINER, `REVOKE FROM anon`,
   `GRANT EXECUTE TO service_role`) mit Signatur und Ablauf aus Abschnitt 2.
   Gesetzte Felder im einen `UPDATE`: `plate_generation+1`, Base-Tripel über den
   v430-Output-Vertrag (`base_video_url`, `processed_video_url=NULL`, `clip_url=Base`),
   `lip_sync_applied_at=NULL`, `lip_sync_status='canceled'`, `twoshot_stage=NULL`,
   `dialog_mode=false`, `engine_override='auto'`, `lip_sync_with_voiceover=false`,
   `replicate_prediction_id=NULL`, `dialog_shots=NULL`,
   `clip_error='lipsync_reset_by_user'`, `audio_plan` ohne die Keys aus Abschnitt 4.
2. `cancel-dialog-lipsync`: neuer `reset:true`-Vollreset-Zweig, überspringt
   `already_applied`, ruft das Primitiv, cancelt danach Jobs und räumt
   `syncso_inflight_jobs`; Dialog-Lock wie heute; `stale_reset` / `no_base_plate` als
   Fehler mit Grund zurück. Bleibt **Legacy-State-Writer** — keine Runless-Regel, keine
   vorgetäuschte run-bound-Migration.
3. `SceneCard`: nur noch Aufruf der Edge-Function, Fehleranzeige statt Verschlucken.

## 6. Tests / Smokes vor STOP

- Vollreset auf (a) laufender, (b) angewandter, (c) videoloser Szene.
- `stale_reset`: Generation-Drift und „neuer Run aufgetaucht" → No-op nachweisen.
- Callback mit alter Generation nach Reset → abgewiesen.
- `audio_plan`-Diff: nur die 13 Keys weg, alle erhaltenen Keys unverändert.
- Credits/Reservations vor/nach Reset identisch.
- Vitest-Suite komplett (368) plus Unit-Tests für Base-Auflösung und Key-Liste.
- `v431LegacyWriteInventory` aktualisieren, danach G1-STOP-Bericht mit PASS/FAIL.
