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

Offen bleibt nur die **Herkunft eines stabilen Segment-UUID pro Pass**, da `dialog_shots.passes[]` heute keinen trägt.

## 4. Fix-Contract (LOCKED, Implementierung separat)

**Identität:** `(scene_id, run_id, plate_generation, stage='sync_segment', segment_id)` mit `segment_id ≠ NULL` für jeden Pass.

1. **Segment-Key-Quelle.** Beim Bau von `dialog_shots.passes[]` erhält jeder Pass ein immutables `segment_id` (UUID). Für bestehende/rekonstruierte Passes ohne Feld gilt eine **deterministische Ableitung** aus `(scene_id, plate_generation, pass.idx)` — gleicher Pass ⇒ gleicher Key, nie kollidierend über Turns. Der Key ist an den Pass gebunden, nicht an `speaker_idx` und nicht an `character_id`.
2. **Dispatcher.** `compose-dialog-segments` übergibt diesen Key als `segmentId` an `resolveLedgerDispatch`/`acquireLedgerJob`; `metadata.pass_idx` bleibt reine Orchestrierungs-Telemetrie. `speakerId` darf gesetzt werden, wirkt aber nie identitätsbildend.
3. **Kardinalität.** 6 Turns ⇒ 6 Attempt-1-Jobs. Wiederholter Character ⇒ eigener Job pro Turn. Kein Turn erhält je `already_completed`/`predecessor_exists` wegen eines Nachbar-Turns.
4. **Retry.** Gleicher Turn ⇒ `composer_replace_pipeline_attempt` erzeugt Attempt N+1 mit identischem `segment_id`. Ein Retry darf nie einen fremden Turn ablösen (Identitätsprüfung im RPC + Segment-Vererbung).
5. **Adoption.** `adoptPreAcquiredLedgerJob` (NOOP-Escalate-Redispatch) prüft zusätzlich, dass der adoptierte Job denselben `segment_id` trägt wie der Pass, für den dispatcht wird.
6. **Callback/Apply.** `pipeline_job_id` bleibt alleinige Callback-Provenance. Keine Änderung an G3.2.2, RS3, F1, Preclip, Plate oder Accounting.
7. **Audio-Mux.** Unverändert genau **ein** `audio_mux`-Job (`segment_id = NULL`), erst nach Terminalität aller sechs Turn-Jobs.
8. **Invariante/Test.** 6-Turn-Szene mit wiederholten Sprechern ⇒ genau 6 `sync_segment`-Rows mit sechs distinkten `segment_id`, `attempt_no = 1`, plus genau 1 `audio_mux`. Zweiter Aufruf desselben Passes ⇒ `already_in_flight` nur für **denselben** Segment-Key.

## 5. Nicht enthalten

Kein Schema-Migrationsbedarf am Index, keine Änderung an `speaker_idx`-Semantik (bleibt Character-/Face-Geometrie), keine Reparatur von S10. Nach dem Fix wird eine **frische** Szene S11 für den Retest angelegt.
