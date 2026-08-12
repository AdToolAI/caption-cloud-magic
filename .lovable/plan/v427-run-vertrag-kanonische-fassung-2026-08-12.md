# v427 — Run-Vertrag (kanonische Fassung)

Diese Datei ersetzt alle vorherigen v427-Entwürfe vollständig. Es gibt keinen historischen Text mehr; nur was hier steht, wird implementiert. Alle sieben Korrekturen aus dem Review sind eingearbeitet.

Verifiziert: Postgres 17.6 (`UNIQUE NULLS NOT DISTINCT` verfügbar). `composer_scenes` hat heute u. a. `active_run_id`, `pipeline_state_run_id`, `clip_status`, `lip_sync_status`, `duration_seconds`, `cost_euros`, `audio_plan`, `audio_source`.

## Oberste Regel: der Lip-Sync-Freeze bleibt bestehen

v427 wird **um** die Lip-Sync-Kette herum gebaut, nie hinein. Verboten bleiben Änderungen an Framing, Preclip-Parametern, Maskengeometrie, Kamerapfad, Sync.so-Payloads, Provider-Payloads, Reprojektion, Schwellenwerten, Timing-Regeln und Mux-Konfiguration. Keine neuen Retries. `beginSceneRun()` bleibt der einzige Run-Start, der bestehende `run_guard_discarded`-Pfad bleibt unverändert. Die Freeze-Tests (`lipsyncFrozenContract.test.ts` + Deno-Contract-Test) sind Abnahmebedingung jedes Teilschritts.

Zusätzlich sichern wir vor der ersten Codeänderung Snapshot-Fixtures von `dialog_turns`, Audio-Plan, Stimmenkonfiguration, Provider-Payload, Preclip-Parametern, Maskengeometrie, Sync.so-Payloads, Segmentreihenfolge und Remotion-Mux-Konfiguration. Für v427A und v427B müssen diese Werte gegenüber v426 byte-identisch bleiben.

`tail_padding_ms` wird **aus dem Bestandscode übernommen**, nicht auf 400 ms gesetzt. Der reale Wert wird in Phase 0 aus der produktiven Timing-Logik ausgelesen und als Konstante fixiert. Eine Änderung wäre eine Qualitäts- und Kostenänderung und läuft separat.

## Zustände (verbindlich, keine anderen)

`composer_pipeline_jobs.status`:
`pending → dispatching → dispatched → running → callback_processing → succeeded | failed | cancelled | stale | dispatch_uncertain`

Szene (`pipeline_state`): unverändert bis v427C; dann zusätzlich `base_clip_ready` und `audio_mux_pending` als nichtterminale Zustände.

## Datenmodell (additiv)

**`composer_scene_runs`** — autoritative, unveränderliche Wahrheit pro Lauf:
`run_id (PK)`, `scene_id`, `run_contract_version`, `status`, `requested_duration_ms`, `required_duration_ms`, `effective_duration_ms`, `effective_duration_frames`, `billable_duration_seconds`, `duration_policy_version`, `quoted_cost_euros`, `reservation_id`, `audio_plan_id`, `audio_asset_id`, `audio_asset_hash`, `measured_audio_duration_ms`, `dialog_content_hash`, `voice_configuration_hash`, `contract_frozen_at`, `created_at`, `completed_at`.
`composer_scenes.active_run_id` zeigt auf den aktiven Run; die Szene spiegelt Werte nur für die UI. Ein Rerender überschreibt damit nie die Daten eines noch offenen Runs (Refund, `dispatch_uncertain`, Nachzügler).

**`composer_pipeline_jobs`**:
`id UUID PK` (primäre Callback-Identität), `scene_id`, `run_id`, `run_contract_version`, `stage`, `segment_id NULL`, `speaker_id NULL`, `attempt_no INT NOT NULL DEFAULT 1`, `provider`, `external_job_id NULL`, `idempotency_key`, `status`, `payload_hash`, `callback_claim_token`, `callback_claimed_at`, `callback_claim_expires_at`, `last_heartbeat_at`, `started_at`, `completed_at`, `error_code`, `metadata JSONB DEFAULT '{}'`, `created_at`, `updated_at`.
`stage ∈ base_video | audio_plan | tts | preclip | sync_segment | audio_mux | final_render`.
Constraints: `UNIQUE(idempotency_key)`, `UNIQUE NULLS NOT DISTINCT (scene_id, run_id, stage, segment_id, attempt_no)`.
GRANTs: `service_role ALL`; `authenticated` nur SELECT via RLS über Szenen-Ownership.

## Zwei getrennte Operationen (nicht ein gemeinsamer Claim)

- `assertActivePipelineJob()` — für Poller und interne Worker (`modelark-poll`). Prüft Run, Job und Lease, setzt Heartbeat, **konsumiert kein Abschlussereignis**.
- `claimPipelineCallback()` — nur für echte oder synthetisierte Abschlussereignisse. Beansprucht idempotent.

Zuordnung: `modelark-poll` = assert + Heartbeat. `compose-clip-webhook` = claim des `base_video`-Abschlusses (genau einmal, auch für die von ModelArk synthetisierte Payload). `sync-so-webhook` = claim des jeweiligen `sync_segment`. `render-sync-segments-audio-mux` = eigener `audio_mux`-Job, kein erneuter Sync-Claim.

Claim-Bedingung: `scene.active_run_id = run_id`, Jobidentität (`id`, `scene_id`, `run_id`, `stage`, `attempt_no`), `external_job_id IS NULL OR = callback_external_job_id`, Status nicht terminal, Claim-Lease frei oder abgelaufen:

```sql
UPDATE composer_pipeline_jobs
   SET status = 'callback_processing',
       callback_claim_token = :token,
       callback_claimed_at = now(),
       callback_claim_expires_at = now() + interval '5 minutes',
       external_job_id = COALESCE(external_job_id, :external_job_id)
 WHERE id = :job_id AND run_id = :run_id
   AND status IN ('pending','dispatching','dispatched','running')
   AND (external_job_id IS NULL OR external_job_id = :external_job_id)
   AND (callback_claim_expires_at IS NULL OR callback_claim_expires_at < now())
RETURNING id;
```

Kein Rückgabewert → strukturiert protokollieren (`scene_id`, `run_id`, `pipeline_job_id`, `stage`, `attempt_no`, `reason ∈ stale_callback | duplicate_callback | wrong_run | wrong_job | already_terminal | claim_locked`) und **keine** Szenenmutation. Ein abgestürzter Callback gibt die Lease nach Ablauf frei; ein bereits erfolgreicher bleibt No-op.

Dispatch-Rückschreibung darf nie rückwärts laufen:

```sql
UPDATE composer_pipeline_jobs
   SET external_job_id = COALESCE(external_job_id, :external_job_id),
       status = CASE WHEN status = 'dispatching' THEN 'dispatched' ELSE status END
 WHERE id = :job_id;
```

## Parallele Sync-Segmente

Jedes Segment schreibt ausschließlich seinen eigenen Job und sein eigenes Segmentergebnis. Die Szene bleibt währenddessen auf `lipsync_running` — kein Segment nutzt den Szenenstatus als Compare-and-Set-Bedingung gegen andere Segmente. Nach jedem Erfolg läuft eine atomare Aggregationsbarriere:

```sql
IF all_required_sync_jobs_succeeded(scene_id, run_id) THEN
  UPDATE composer_scenes SET pipeline_state = 'audio_mux_pending'
   WHERE id = :scene_id AND active_run_id = :run_id
     AND pipeline_state = 'lipsync_running';
END IF;
```

Genau ein Aufrufer gewinnt, der Mux startet einmal.

## Dauer- und Geldvertrag (v427B)

```text
raw_required_duration_ms = max(requested_duration_ms,
                               measured_audio_end_ms + tail_padding_ms)
→ Aufrunden auf zulässiges Providerfenster → effective_duration_ms / _frames
→ billable_duration_seconds → Preis
```

Voiceover verlängert, verkürzt nie. Intern nur ganze Millisekunden/Frames. Ausführungsreihenfolge, verbindlich und ohne Ausnahme:

```text
1 Auth + Ownership
2 Dialog kanonisieren
3 Provider-/Engine-Zulässigkeit (dauerunabhängig)
4 vorläufige Maximalkosten (Hailuo 10 s, HappyHorse 15 s, Seedance 30 s)
5 Run-Zeile + Obergrenzen-Reservierung ATOMAR (eine Transaktion)
6 TTS über die extrahierte, idempotente Bestandsfunktion (Idempotency-Key scene_id+run_id+stage)
7 Audio messen
8 exakte Dauer + exakter Preis
9 Reservierung auf exakten Betrag reduzieren
10 Vertrag einfrieren (contract_frozen_at)
11 Basisvideo dispatchen
```

Kein kostenpflichtiger externer Auftrag ohne vorherige Reservierung. Die Audio-/Timing-Logik wird **unverändert** extrahiert und nur früher aufgerufen — Dialogreihenfolge, Pausen, Startzeiten, Stimmenparameter, Formate bleiben identisch; die Lip-Sync-Unterpipeline nutzt exakt dieses eingefrorene Asset und synthetisiert nie neu. Kein stiller Providerwechsel bei Dialogszenen; die bestehende Umleitung nicht-dialogischer Szenen >15 s auf Seedance 2.5 bleibt.

"Erfolgreich gestartet" = Providerauftrag existiert UND Jobidentität ist persistiert. Timeout nach Create → `dispatch_uncertain` + Reconciliation, keine sofortige Freigabe. Commit/Release/Refund idempotent über `UNIQUE(scene_id, run_id, charge_type)`. Batch: alle Szenenreservierungen in einer Transaktion (Parent + Allokationen).

**Offene Produktregel (einzige):** Passt der Dialog nach der Messung in kein Providerfenster, wird die Videoreservierung freigegeben. Vorschlag: AdTool AI trägt die bereits angefallenen TTS-Kosten, der Kunde zahlt nichts — Alternative wäre, nur den TTS-Betrag zu committen. Entscheidung vor v427B.

## Fertig-Semantik (v427C, dreistufig)

- **C1 Dual-Write:** Providerabschluss setzt zusätzlich `base_clip_status = ready`, `base_clip_url`; das heutige `clip_status = ready` bleibt vorerst. Kein sichtbares Verhalten ändert sich.
- **C2 Inventar:** vollständige Liste aller Leser von `clip_status`, `lip_sync_status`, `pipeline_state`, `clip_url`, `last_frame_url` — Kontinuitätskette, Vorschau, Projektabschluss, Director's Cut, Benachrichtigungen, Fortschritt, Fehlerbehandlung, Refunds, Sweeper, Rerender, Wiederherstellung, Analytics/Admin — und Umstellung auf die Gates.
- **C3 Flip:** frühes `ready` bei Lip-Sync-Szenen entfernen.

```text
Kontinuitäts-Gate:   base_clip_status = ready AND Übergangsmaterial vorhanden
Nutzer-/Export-Gate: clip_status = ready AND (requires_lip_sync = false OR lip_sync_status = done)
```

## Phasen

- **Phase 0 (kein Produktionsverhalten):** diese Spezifikation, Zustandstabelle, Freeze-Invarianten, `ready`-Consumer-Inventar, Snapshot-Fixtures, Feature-Flags `v427_pipeline_jobs_dual_write`, `v427_callback_guard_mode = off|observe|enforce`, `v427_audio_preflight`, `v427_credit_reservations`, `v427_ready_semantics`, `v427_provider_leases`, plus `tail_padding_ms` aus dem Bestand auslesen.
- **A1:** additive Migration (`composer_scene_runs`, `composer_pipeline_jobs`, nullable Szenenfelder, Indizes, GRANTs, RLS) — null Verhaltensänderung.
- **A2:** Dual-Write der Jobzeilen vor jedem bestehenden Dispatch; Legacy entscheidet weiterhin allein.
- **A3:** Guard im Beobachtungsmodus (`observe`) — Entscheidung wird nur geloggt und mit dem Legacy-Verhalten verglichen; `enforce` erst nach fehlerfreien Vergleichsläufen, stageweise, nur für `run_contract_version = 427`.
- **B:** Dauer + Guthaben hinter Flag, erst intern, dann Canary.
- **C:** Fertig-Semantik in C1–C3.
- **D:** providerabhängige Leases (`lease_expires_at`, `lease_run_id`, `lease_job_id`, `last_heartbeat_at`; ModelArk 30 min; Kettenlease nur am `base_video`-Job), Storyboard-Autosave mit Optimistic Concurrency, UI-Phasen aus `pipeline_state`.

Rollout bleibt Expand-and-Contract; v426-Runs laufen über den Legacy-Pfad aus, Rollback jederzeit über die Flags. Bestandsdaten mit `clip_status = ready` + `lip_sync_status = pending/running` werden nicht pauschal migriert.

## Abnahmematrix vor jedem Flip

Hailuo 6 s / Hailuo 10 s / HappyHorse 15 s (je ein Sprecher); zwei Sprecher mit getrennten Preclips; ≥3 Sync-Segmente in unterschiedlicher Rückkehrreihenfolge; doppelter Sync.so-Webhook; Rerender während laufendem Sync.so-Job; alter Mux-Callback nach neuem Run; TTS länger als Providerfenster; TTS-Fehler nach Reservierung; Basisvideo ok + Sync fehlgeschlagen; Sync ok + Mux fehlgeschlagen; Kette mit zwei Lip-Sync-Szenen; Vorgänger fehlgeschlagen → Match-Cut; ModelArk-Poll → synthetische Payload → genau eine Verarbeitung; Export startet nie bei `lip_sync_status != done`; kein zusätzlicher Provideraufruf; Refund/Commit/Release idempotent; alle Snapshot-Fixtures identisch zu v426.

## Erster Schritt

Nur Phase 0 + A1: Spezifikation (diese Datei), Fixtures, Flags, additive Migration und der Shared Helper mit Tests — ohne eine einzige Änderung an Sync.so-, Preclip-, Masken-, Timing- oder Mux-Verhalten.
