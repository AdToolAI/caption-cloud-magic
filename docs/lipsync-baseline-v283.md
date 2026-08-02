# Lip-Sync Baseline v283 (Stand 27.07.2026)

Referenzdokument zum chirurgischen Rollback vom 02.08.2026. Die Lip-Sync-Kette
steht auf Commit `58060cffe` (27.07.2026). Log-Marker:
`COMPOSE_DIALOG_SEGMENTS_VERSION = "v283-baseline-27-07-rollback"`.

> **Wichtig:** Der kursierende „Rebuild Guide v169" beschreibt **nicht** diesen
> Stand. Die Codekonstante `v169` existierte zuletzt am 05.07.2026
> (Commit `51096cf73`), der v164-Marker am 21./22.06.2026. Der Guide ist
> historisch und darf nicht als Soll-Zustand herangezogen werden.

## v169-Guide ↔ v283-Baseline

| Aspekt | v169-Guide | v283-Baseline (aktiv) |
| --- | --- | --- |
| Versionskonstante | `"v164"` (Log-Marker) | `v283-baseline-27-07-rollback` |
| Max. Sync.so-Parallelität | `SYNCSO_DEFAULT_MAX_PARALLEL = 5` | **3** (`_shared/syncso-preflight.ts`) |
| Slot-Write-RPC | `update_dialog_shot_pass` | `update_dialog_pass_slot` (+ `update_dialog_shots_root_merge`) |
| Anchor-Identity-Bridge | v166 | **v183** inkl. Identity-Collision-Eviction |
| Retry-Ladder | 7 Varianten | identisch: `bbox-url-pro` → `coords-pro` → `coords-pro-box` → `sync3-coords` → `coords-pro-lp2pro` → `auto-pro` → `auto-standard` |
| `sync_mode` | immer `cut_off` | identisch |
| `auto_detect` bei N≥2 | verboten | blockiert (`v153_auto_detect_wire_blocked`) |
| Per-Pass-Lock | v168 | vorhanden (`v168_per_pass_lock`) |
| Preclip-Prefanout | v167 | vorhanden (`v167_preclip_prefanout`) |
| Webhook + Watchdog | ja | ja (`sync-so-webhook`, `lipsync-watchdog`) |

## Zusätzlich aktive Schichten (im Guide nicht enthalten)

Diese Gates sind Teil der Baseline und die häufigsten Abbruchursachen:

| Schicht | Marker | Typischer Fehlercode |
| --- | --- | --- |
| Face-Gate | `v283_face_gate_` | `face_gate_no_face`, `face_gate_*` |
| Preclip-Pflicht (Mehrsprecher) | `v204_preclip_required` | `v204_preclip_required`, `v204_preclip_missing_before_wire` |
| Rekognition-Anchor-Lock | `v277_anchor_rekognition_*` | `v277_anchor_lock_face_missing` |
| Hungarian Plate-Router | `v278_hungarian_plate_router` | `v278_persisted_identity_duplicate_evict` |
| Identity-Trust-Gate | `v189_identity_trust_gate` | `v183_identity_collision` |
| Motion-Gate (Einzelsprecher) | `v231_n1_motion_gate` | Motion-Verdict-Abbruch |
| Mouth-Anchor | `v247_mouth_anchor_preclip`, `v280_bbox_derived_mouth_anchor` | `v280`-Rescue |
| Plate-Quality-Gate | `v117_plate_quality_gate` | `v184_low_res_plate` |
| Pass-Circuit-Breaker | `v118_pass_circuit_breaker` | Pass-Abbruch nach Wiederholungen |

## Datenbank-Kontext (v398)

Der Rollback erforderte eine additive Anpassung zweier Trigger auf
`composer_scenes`:

- `composer_scene_state_bridge`: Der v387-Block ist aufgehoben. Legacy-Writes
  (`clip_status` / `twoshot_stage` / `lip_sync_status`) spiegeln wieder in
  Audio- und Lip-Sync-Phasen. Ohne das bleibt die Baseline-Kette bei
  „Lip-Sync wird gestartet" stehen.
- `composer_scene_state_guard`: nur noch Telemetrie
  (`verdict='observed'`, `reason='v398_rollback_observe_only'`). Einzige harte
  Blockade bleibt die Wiederbelebung von `failed` / `canceled`.

## Forensik bei einem Fehlerbild

Zuerst diese Quellen lesen, bevor Code geändert wird:

1. Edge-Function-Logs: `compose-dialog-segments`, `sync-so-webhook`,
   `lipsync-watchdog`
2. Tabellen: `syncso_dispatch_log`, `syncso_inflight_jobs`,
   `dialog_dispatch_locks`, `composer_state_guard_violations`
3. `composer_scenes.dialog_shots` → `passes[].status` / `retry_variant` /
   `job_id`

## Nicht ohne ausdrückliche Freigabe

Die Iterationen v349–v397 (Passthrough-Delta-Gate, Zero-Face-Konsens,
Frame-Space-Authority, NOOP-Retry, Face-Size-Floors > 12 %, Enum-State-Machine
in der Lip-Sync-Kette) wurden bewusst entfernt und dürfen nicht erneut
aufgesattelt werden.
