# v431 G3.2.2 — Production Resmoke / Final Acceptance

T0 = T_RS3_effective = 2026-08-15T21:57:44Z (einzige Telemetrie-Grenze).
Kein G3.2.3, keine Architekturänderung, kein Cleanup, keine Reparatur auf Verdacht.
`b34d1eae…` bleibt unangetastet.

## Ausgangsbefund (bereits geprüft)

- `composer_pipeline_jobs` enthält aktuell 15 Zeilen: `sync_segment` 4x `dispatched`, `audio_mux` 4x `dispatched`, `base_video` 3x `succeeded` / 3x `dispatched` / 1x `dispatch_uncertain`. Alle historisch, bleiben unberührt.
- Es existiert **keine** ledger-freie Szene, die den Sync→Mux→Stitch-Pfad noch auslösen könnte: alle Szenen ohne Ledger-Historie sind bereits `complete` oder `canceled`.
- Konsequenz: Die Abnahmeszene muss neu über den normalen Produktions-/UI-Pfad angelegt und gestartet werden. Es gibt keinen zulässigen Weg, eine bestehende Szene ohne manuelle DB-Writes in einen frischen Abnahmezustand zu bringen.

## Ablauf

### Schritt 1 — Frische Testszene anlegen (durch dich, im UI)
Neue Szene im Composer: single-speaker, non-tight, Dialoglänge sicher im Plate-Budget, damit der `sync-segments`-Pfad garantiert greift (zugleich produktiver Nachweis des migrierten B11-Falls). Noch nicht rendern lassen — nur anlegen und mir die Szene nennen.

### Schritt 2 — Pre-Start-Snapshot (read-only, durch mich)
Belege vor dem Start: `scene_id`, `active_run_id`, `plate_generation`, `plate_ready_generation`, `pipeline_state`/`substate`, `lip_sync_status`, `dialog_shots`, `audio_plan`; Nachweis `composer_pipeline_jobs = 0`, keine `sync_segment`/`audio_mux`-Attempts, keine RS3-Reset-Marker (`audio_plan.twoshot.rs3_reset`), keine Pass-Pointer/Job-Bindings.
Löst die Szene den vollen Pfad erkennbar nicht aus → STOP, andere Szene.

### Schritt 3 — Produktionslauf starten (durch dich, im UI)
Start ausschließlich über den normalen UI-Pfad. Keine manuellen DB-Writes, kein Direktaufruf von Edge-Functions.

### Schritt 4 — Kettenverifikation (read-only, durch mich)
Verfolge live über DB + Edge-Logs:
compose-dialog-segments → serialized RS3 acquire → `sync_segment`-Attempt → Provider-Dispatch/External-ID → Sync.so-Callback → `composer_apply_sync_segment_result` → `scene_verdict = dispatch_mux` → genau ein `audio_mux`-Attempt → `render-sync-segments-audio-mux` → realer `render_id` → canonical `lipsync_muxing` (nur Mux-Owner) → Remotion/Stitch → `composer_finalize_lipsync_scene(stitch:done)` → `pipeline_state = complete`.

Einzelnachweise: RS3-Live-Wrapper (§4), Apply-Provenienz rein über `pipeline_job_id` ohne Payload-Hints, Pass-Isolation ohne Sibling-Mutation, getrennte Protokollierung von `segment_result` und `scene_verdict`, DB-Audit `g322_sync_segment`, `mux_dispatch_requested_at` gesetzt / kein `dispatched_at` aus dem Apply, State-Monotonie ohne Legacy-Bridge-Downgrade, Finalisierung nie durch `sync-so-webhook`, `processed_video_url` + Compatibility-Output.

### Schritt 5 — Telemetrie-Fenster ab T0
`missing_binding`, `job_not_found`, `wrong_job`, `stale_run`, `stale_generation`, `binding_pending`, `reinject_missing_pipeline_job_id` müssen alle 0 sein, plus mindestens ein positiver `bound`-Nachweis für den realen Sync-Callback.

### Schritt 6 — Redrive-Smoke (optional, nach erfolgreichem Hauptlauf)
Nur gezielt/transaktional, ohne Provider-Neudispatch: vor `audio_mux`-Attempt darf `dispatch_mux` erneut geliefert werden; sobald der Attempt existiert, ist Redrive noop; niemals ein zweiter `audio_mux`-Attempt. Natürlich auftretende Duplicate-Callbacks werden analysiert und dokumentiert.

### Schritt 7 — Report
`docs/v431-g3-2-2-report.md` um den Resmoke-Abschnitt ergänzen (scene_id, run_id, plate_generation, Start/Ende, T_RS3_effective, Sync-Ledger-Job + External ID, Apply-Verdikt, bound-Nachweis, audio_mux-Job, render_id, Zeitpunkt `lipsync_muxing`, Stitch/Finalizer, finaler State/Output, Telemetrie-Counter, RS3-Live-Wrapper-Nachweis).

Alles grün → **G3.2.2 DONE / FROZEN**, dann STOP.
Jede Abweichung → **G3.2.2 DEPLOYED — FOLLOW-UP BEFUND**, dann STOP ohne Reparatur.

## Technische Hinweise

- Meine Rolle ist rein beobachtend: DB-Reads (`psql`/read_query), Edge-Function-Logs, Doku-Update. Keine Migration, kein Deploy, keine Mutation an Szenen oder Ledger-Zeilen.
- Für die DB-Smokes aus RS3 §6.5 wird kein Ad-hoc-Grant wiederhergestellt; der Wrapper-Nachweis kommt aus dem realen Lauf.
- Kosten: Der Lauf verbraucht reale Credits (Plate, Sync.so, Remotion) — das ist Teil der Produktionsabnahme.
