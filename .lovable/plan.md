# FA-4/P0 — Sync Segment Ledger Cardinality

**Ergebnis: SYNC FAN-OUT ROOT CAUSE CONFIRMED / FIX CONTRACT READY → STOP.**
Kein Code, keine Migration, kein Deploy, kein Retry/Reset, kein Render. S10 bleibt unangetastete Evidence.

## 1. Befund (read-only)

Run `90b1a93a-…`, Szene S10 `585da82a-…`, `plate_generation=2`:

| Stage | attempt_no | segment_id | speaker_id | metadata.pass_idx | status |
|---|---|---|---|---|---|
| base_video | 1 | NULL | NULL | – | succeeded |
| sync_segment | 1 | **NULL** | **NULL** | 0 | succeeded |

`dialog_turns` = 6 mit stabilen Turn-UUIDs (`eb8d3c11…`, `fd459b3d…`, …).
`dialog_shots.passes` = 6 Einträge mit Feldern `idx`, `speaker_idx`, `character_id`, `speaker_name`, `segments` — **ohne** Turn-/Segment-UUID.

## 2. Root Cause (bestätigt)

Die logische Ledger-Jobidentität enthält für `sync_segment` heute **keine Turn-/Segment-Dimension**, weil der Dispatcher `segment_id` nie befüllt.

1. `compose-dialog-segments/index.ts` (~Z. 6005) baut `v431LedgerParams` mit `stage:'sync_segment'`, Provider, `metadata.pass_idx` — **kein `segmentId`**. Der Turn-Index existiert also nur als Metadatum, nicht als Identität.
2. `acquireLedgerJob()` reicht `_segment_id: params.segmentId ?? null` an `composer_acquire_lipsync_attempt_serialized` → ohne gültigen RS3-Marker Passthrough auf `composer_acquire_pipeline_attempt`.
3. `composer_acquire_pipeline_attempt` sucht den jüngsten Attempt über `(scene_id, run_id, stage, segment_id IS NOT DISTINCT FROM p_segment_id)`. Bei `NULL = NULL` trifft Turn 2 die **terminale Zeile von Turn 1** → `predecessor_exists` (Status `succeeded`) → `resolveLedgerDispatch` liefert `skip` → der Dispatcher gibt `{ok:true, skipped}` zurück, **bevor** der Provider-Call passiert. Turns 2–6 werden damit nie dispatcht.
4. Der Unique-Index `composer_pipeline_jobs_identity_unique (scene_id, run_id, stage, segment_id, attempt_no) NULLS NOT DISTINCT` zementiert dieselbe Kollision: mit `segment_id = NULL` kann pro Run/Stage nur genau ein Attempt-1-Job existieren.

Kardinalität: **6 Turns ⇒ 1 Job**. `speaker_idx` war korrekt (0..3, 4 stabile Character-IDs) — die Identitätsdimension fehlte, nicht die Geometrie.

**Acceptance-Report-Zeile:**
`FA-4/P0 — Sync fan-out cardinality failure: 1/6 jobs due to Ledger job identity missing immutable turn/segment dimension.`

## 3. Reicht das bestehende Schema?

Ja. **Keine Schemaänderung nötig.**

- `composer_pipeline_jobs.segment_id uuid NULL` existiert bereits und ist Teil des Identity-Unique-Index.
- `composer_acquire_pipeline_attempt` und `composer_rs3_acquire_core` schlüsseln bereits über `segment_id IS NOT DISTINCT FROM …` (inkl. Epoch-Idempotenz in RS3).
- `composer_replace_pipeline_attempt` arbeitet über `p_previous_job_id` + Identitätsprüfung, erbt also den Segment-Key des Vorgängers — Retry bleibt automatisch turn-lokal.
- `composer_apply_sync_segment_result` adressiert über `_pipeline_job_id`; die Turn-Zuordnung wird mit befülltem `segment_id` erstmals eindeutig statt über `metadata.pass_idx`.

Offen bleibt nur das **Durchreichen der bereits existierenden Turn-UUID** in die vorhandene Segmentdimension, da `dialog_shots.passes[]` sie heute nicht mitführt.

## 4. Fix-Contract (LOCKED, Implementierung separat)

**Logische Sync-Job-Identität:** `(scene_id, run_id, stage='sync_segment', segment_id = dialog_turn.id)`.
`plate_generation` ist verpflichtende, eingefrorene Run-/Generation-Provenance und muss übereinstimmen — sie ist **nicht** Bestandteil des bestehenden Unique-Index (`scene_id, run_id, stage, segment_id, attempt_no NULLS NOT DISTINCT`).

1. **Kanonische Segmentidentität.** `sync_segment.segment_id = dialog_turn.id`. Keine neue UUID pro Pass, keine deterministische Ableitung aus `(scene_id, plate_generation, pass.idx)`, keine zweite Identitätsebene. Ein Sync-Job pro Dialog-Turn.
2. **Durchreichung.** Beim Bau von `dialog_shots.passes[]` wird die zugehörige `dialog_turn.id` als `turn_id`/`segment_id` am Pass mitgeführt; der Dispatcher in `compose-dialog-segments` übergibt exakt diesen Wert als `segmentId` an `resolveLedgerDispatch`/`acquireLedgerJob`. `metadata.pass_idx` bleibt reine Orchestrierungs-Telemetrie, `speaker_idx`/`character_id` bleiben Character-/Face-Geometrie und wirken nie identitätsbildend.
3. **Fail-closed statt Ersatzidentität.** Löst ein Pass nicht eindeutig auf genau einen kanonischen `dialog_turn` auf, wird **vor** dem Ledger-Acquire mit `PREFLIGHT_BLOCKED` abgebrochen. Für `stage='sync_segment'` ist `segment_id IS NULL` unzulässig — kein stiller Rückfall auf den alten NULL-Key. `audio_mux` behält `segment_id = NULL` (anderer Stage-Key, keine Kollision).
4. **Kardinalität.** 6 Turns ⇒ 6 Attempt-1-Jobs. Sarah in Turn 1 und Turn 5: gleiche `character_id`, gleicher `speaker_idx`, unterschiedliche `dialog_turn.id` ⇒ zwei Jobs. Kein Turn erhält je `already_completed`/`predecessor_exists` wegen eines Nachbar-Turns.
5. **Retry.** Gleicher Turn ⇒ `composer_replace_pipeline_attempt` erzeugt Attempt N+1 mit identischem `segment_id`. Ein Retry darf nie einen fremden Turn ablösen (Identitätsprüfung im RPC + Segment-Vererbung).
6. **Adoption.** `adoptPreAcquiredLedgerJob` adoptiert nur, wenn die Ledger-Row identisch ist in `scene_id`, `run_id`, `plate_generation`, `stage='sync_segment'` und `segment_id = dialog_turn.id` des dispatchenden Passes. Sonst keine Adoption.
7. **Callback/Apply.** `pipeline_job_id` bleibt alleinige, authoritative Callback-Provenance. Der Callback sucht keine Turns und interpretiert kein `speaker_idx`; das befüllte `segment_id` macht die Row lediglich eindeutig. Keine Änderung an G3.2.2, RS3, F1, Preclip, Plate oder Accounting.
8. **Audio-Mux.** Unverändert genau **ein** `audio_mux`-Job, erst nach Terminalität aller sechs Turn-Jobs.

## 5. Testinvarianten

- `set(sync_segment.segment_id) == set(dialog_turns.id)` für genau diese sechs Turns, alle `attempt_no = 1`.
- Turn 1 (Sarah) vs. Turn 5 (Sarah): unterschiedliche `segment_id`, gleicher `speaker_idx`.
- Turn 2 (Samuel) vs. Turn 6 (Samuel): unterschiedliche `segment_id`, gleicher `speaker_idx`.
- Re-entry Turn 1 ⇒ `already_completed`/`already_in_flight` ausschließlich für den Turn-1-Job.
- Re-entry Turn 2 ⇒ skippt niemals wegen Turn 1.
- Retry Turn 3 ⇒ Attempt 2 mit derselben Turn-3-`segment_id`.
- Pass ohne eindeutigen Turn ⇒ `PREFLIGHT_BLOCKED`, kein Acquire, keine Row.
- Nach sechs terminalen Sync-Jobs ⇒ genau 1 `audio_mux` (`segment_id = NULL`).

## 6. Nicht enthalten

Kein Schema-Change, kein Ledger-RPC-Redesign, keine Änderung an `speaker_idx`-Semantik, keine Reparatur von S10. Nach dem Fix wird eine **frische** Szene S11 für den Retest angelegt.

