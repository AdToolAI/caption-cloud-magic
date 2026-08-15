# v431 G3.2.2 — Pre-Apply-Stall-Befund (Szene b34d1eae)

Beide angeforderten Befunde sind erhoben. Ergebnis: **Deploy PASS, G3.2.2 nicht widerlegt** — der Lauf hat den neuen Apply-Pfad nie erreicht, weil er bereits vor dem Dispatch blockiert.

## Befund 1 — compose-dialog-segments ab 20:18:52Z

Der Dispatch ab 20:18:52Z ist kein hängender Langläufer. Jede Invocation läuft ~2 s, endet mit HTTP 202 und schreibt Telemetrie:

- 20:18:50 / 20:19:24 / 20:20:31 / 20:21:04 / … `DISPATCH_ATTEMPT_STARTED`, jeweils gefolgt von `PASS_DEDUPE_SKIPPED` (`v193_pass_already_active`, `live_status=rendering_preflight`, `live_job_id=null`).
- Nur **eine** Invocation kam durch: 20:19:56.87 → sie hat den Claim gesetzt (`preflight_started_at=20:19:58.586Z`) und den kompletten Preflight durchlaufen:
  `v168_per_pass_lock ACQUIRED` → `v201_id_only_cast` → `v400_anchor_divergence (Plate-Anker gewählt)` → `plateDims mp4_probe 1284x718` → `plate-face-detect 1 face conf 1.00` → `v183_plate_identity_mapping 1/1` → `v189_identity_trust_gate 1/1` → `v239_repair_gate` → `v185_anchor_plate_bbox_gate ok` → `v163_preclip_render OK` (render 97d435b6, 42 Frames, 1.367 s) → `v160_sync3_face_box` → `v163_BBOX_URL_PRIMARY` + `v279 bbox-url uploaded`.
- **Letzter Eintrag, exakt vor dem Provider-Dispatch (20:19:59.213Z):**
  `ledger dispatch skipped {reason:"already_in_flight", pipeline_job_id:"d12b2704-8d1c-422d-b24a-3b8fcf27f5a9"}`
  `[v431] g31_observe ledger_already_in_flight {stage:"sync_segment", run_id:"51f80471…", attempt_no:1, existing_status:"dispatched"}`

Kein Fehler, kein Crash, kein TTS-/Guard-Abbruch. Der Lauf stoppt sauber am Ledger-In-Flight-Guard.

## Befund 2 — persistierter Pass-Slot & Ledger

`composer_scenes.dialog_shots.passes[0]` (Stand 20:29:04Z):

```text
status                  = rendering_preflight
preflight_started_at    = 2026-08-15T20:19:58.586Z
preflight_claim_version = v401-july-image-path-single-face-isolation
job_id                  = (fehlt)
pipeline_job_id         = (fehlt)
run_id / attempt_id     = (fehlt)
new_attempt_id          = (fehlt)
Fehlerfelder            = (keine)
```

Szene: `clip_status=ready`, `clip_error=null`, `lip_sync_status=pending`, `plate_generation=7 = plate_ready_generation`, `active_run_id=51f80471-8a3b-42be-894b-6754c4a49ef8`, `active_run_started_at=2026-08-15T17:20:44Z`.

Ledger (`composer_pipeline_jobs`, Run 51f80471):

| stage | status | attempt | external_job_id | created |
|---|---|---|---|---|
| base_video (ai-happyhorse) | succeeded | 1 | 81bjg8b04drmy0d00srsjsp53c | 17:20:46 |
| **sync_segment (sync.so)** | **dispatched** | 1 | 50b402be-31d0-4f94-bc2f-9ae4f850fe42 | **17:24:16** |
| audio_mux (remotion) | dispatched | 1 | 7f983939-6ffe-4691-b52d-674117088d03 | 17:25:38 |

Wertung:

- `rendering_preflight` ist ein **hängen gebliebener DB-Status ohne aktiven Prozess** (Claim-TTL 10 min; danach löst sich die Blockade automatisch, nur um erneut am Ledger-Guard zu enden).
- Die frühere Aussage „kein sync_segment-Ledger-Attempt" ist zu korrigieren: Es existiert einer — aber aus dem **Run von 17:24**, also **vor dem Deploy (20:04:53Z)**. Er steht seit über 3 h auf `dispatched`, ohne Callback.
- Der UI-Clean-Restart um 20:09 hat **keinen neuen Run** erzeugt (`active_run_id` unverändert seit 17:20). Deshalb kollidiert jeder neue Versuch mit dem alten Attempt derselben Identität.
- Folge: Der G3.2.2-Apply-Pfad (`composer_apply_sync_segment_result`) wurde nie betreten — weder positiv noch negativ. Kein Gegenbeweis, aber auch kein Nachweis.

## Entscheidungsvorlage

Weiterlaufen lassen bringt nichts: Der Guard blockiert deterministisch, solange `d12b2704` auf `dispatched` steht und der Run derselbe bleibt. Es braucht einen separaten Befund/Schritt. Drei Optionen:

1. **Pre-Apply-Stall-Befund eröffnen (empfohlen)** — eigener Analyseblock „G3.2.2-S1": Warum blieb `sync_segment` d12b2704 seit 17:24 ohne terminalen Callback (Sync.so-Job 50b402be Status extern prüfen), und warum erzeugt der UI-Clean-Restart keinen neuen `run_id`/keine neue Ledger-Identität. Nur Analyse, keine Reparatur.
2. **Sauberer Resmoke-Neuanlauf** — Run-Neuanlage erzwingen (neue `run_id` + neuer Attempt via `composer_replace_pipeline_attempt`), damit der Apply-Pfad überhaupt erreicht wird. Erst nach Freigabe.
3. **Beides sequenziell** — erst 1 (Befund), dann auf Basis des Ergebnisses 2 (Neuanlauf) mit separater Freigabe.

Bis zur Entscheidung bleibt der Status: **G3.2.2 DEPLOYED — RESMOKE IN PROGRESS / NOT YET ACCEPTED**. Keine Reparatur, kein Cleanup ohne neue Freigabe.
