# v427 — Run-Vertrag (verbindliche Fassung)

Beide Korrekturen sind richtig und übernommen. Diese Datei ersetzt alle früheren Fassungen: verbindlich sind ausschließlich die Abschnitte "Verträge", "v427A–v427D" und "Rollout".

Geprüft: Postgres 17.6 → `UNIQUE NULLS NOT DISTINCT` ist verfügbar, keine partiellen Ersatzindizes nötig. `composer_scenes` besitzt heute `active_run_id`, `pipeline_state_run_id`, `clip_status`, `lip_sync_status`, `duration_seconds`, `cost_euros`, `audio_plan`, `audio_source` — alle neuen Vertragsfelder kommen additiv dazu.

## Nicht verhandelbar: der Lip-Sync-Freeze bleibt intakt

`.lovable/LIPSYNC-FEATURE-FREEZE.md` friert unter anderem `compose-video-clips/`, `sync-so-webhook/`, `_shared/scene-run-begin.ts` und `_shared/provider-tracker.ts` ein. v427 ist **kein** Unfreeze. Regeln für jeden Patch:

- Keine Änderung an Gates, Schwellenwerten, Framing, Maskengeometrie, Kamerapfad, Provider-Payload oder Reprojektion.
- Keine neuen Retries im Lip-Sync-Pfad (v353-Verbot gilt weiter). `attempt_no` zählt nur, was ohnehin schon als neuer Lauf gestartet wird.
- Das Callback-Gate wird **vorgeschaltet**, nicht eingewebt: `claimComposerPipelineCallback()` läuft vor der bestehenden Logik und kann nur ablehnen. Der vorhandene `run_guard_discarded`-Pfad in `sync-so-webhook` bleibt unverändert bestehen (Invariante I3).
- `beginSceneRun()` bleibt der einzige Run-Start (Invariante I2); v427 ergänzt dort nur zusätzliche Spalten.
- `src/lib/composer/__tests__/lipsyncFrozenContract.test.ts` und der Deno-Contract-Test müssen nach jedem Teilschritt grün sein — sie sind Abnahmebedingung, nicht Nachgedanke.

## Verträge

### Dauervertrag

```text
raw_required_duration_ms =
  max(requested_duration_ms, measured_audio_end_ms + tail_padding_ms)
→ Aufrunden auf nächstes zulässiges Providerfenster
→ effective_duration_ms / effective_duration_frames
→ billable_duration_seconds → Preis
```

Voiceover verlängert, verkürzt nie. Intern ganzzahlige Millisekunden/Frames; `effective_duration_seconds` ist nur abgeleiteter Anzeige- und Providerwert. Auto-Extend (compose-video-clips ~2046) wird zur reinen Kontrollschranke: Abweichung = `duration_contract_drift`, kein stilles Verlängern.

Kein stiller Providerwechsel bei Dialog-/Lip-Sync-Szenen. Die bestehende Dauerumleitung nicht-dialogischer Szenen >15 s auf Seedance 2.5 bleibt bestehen (Produktverhalten).

### Reihenfolge: kein bezahlter Auftrag ohne Reservierung

```text
1  Auth + Ownership
2  Dialog kanonisieren
3  Provider-/Engine-Zulässigkeit (dauerunabhängig)
4  vorläufige Maximalkosten (Hailuo max 10 s, HappyHorse max 15 s, Seedance max 30 s)
5  Run + Obergrenzen-Reservierung ATOMAR (eine Transaktion)
6  TTS mit Idempotency-Key (scene_id + run_id + stage)
7  Audio messen
8  exakte Dauer + exakter Preis
9  Reservierung auf exakten Betrag reduzieren (Rest sofort freigeben)
10 Run-Vertrag einfrieren
11 Videojob dispatchen
```

Verursacht TTS keine externen Kosten, entfällt nur der TTS-Anteil der Obergrenze — die Reihenfolge bleibt. Das gemessene Audio ist das später verwendete Audio: `audio_asset_id`/`audio_asset_hash` sind Teil des Run-Vertrags, die Sync-Unterpipeline synthetisiert nicht neu.

"Erfolgreich gestartet" = Provider hat einen Auftrag erzeugt UND die Job-Identität ist persistiert. Timeout nach Create → `dispatch_uncertain`, Klärung durch Reconciliation, keine sofortige Freigabe. Commit/Release/Refund idempotent über `UNIQUE(scene_id, run_id, charge_type)`. Batch: alle Szenenreservierungen in einer Transaktion (Parent-Reservierung + Allokationen).

### Provider-Capabilities vs. Lip-Sync-Zertifizierung

Zwei getrennte Verträge: `ProviderCapabilities` (`durationPolicy`, `supportedQualities`, `supportedInputs`, `supportsAudio`) und `LipSyncCertification` (`certified`, `supportedEngines`, `dialogRestrictions`, bleibt in `lipsyncMasterProvider.ts`). Seedance 2.5: Dauer 4–30, `lipSyncCertified = false`. Build-Paritätstest zwischen Client-Policy und `_shared/composer-ai-sources.ts`.

### Zwei Fertigbegriffe

```text
Kontinuitäts-Gate:   base_clip_status = ready AND Übergangsmaterial vorhanden
Nutzer-/Export-Gate: clip_status = ready AND (requires_lip_sync = false OR lip_sync_status = done)
```

## v427A — Run- und Job-Integrität (reiner Expand-Deploy)

Keine neue Abrechnung, keine geänderte `ready`-Semantik, kein sichtbar veränderter Szenenstatus.

**A.1 Schema (alles nullable, kein Backfill)**
`composer_scenes`: `run_contract_version`, `requested_duration_ms`, `required_duration_ms`, `effective_duration_ms`, `effective_duration_frames`, `billable_duration_seconds`, `duration_run_id`, `duration_policy_version`, `quoted_cost_euros`, `reservation_id`, `audio_plan_id`, `audio_asset_id`, `audio_asset_hash`, `measured_audio_duration_ms`, `dialog_content_hash`, `voice_configuration_hash`, `base_clip_status`.

Neue Tabelle:

```text
composer_pipeline_jobs
  id UUID PK                      -- primäre Callback-Identität
  scene_id, run_id UUID NOT NULL
  run_contract_version INT NOT NULL
  stage TEXT NOT NULL             -- base_video | audio_plan | tts | preclip
                                  -- | sync_segment | audio_mux | final_render
  segment_id UUID NULL, speaker_id UUID NULL
  attempt_no INT NOT NULL DEFAULT 1
  provider TEXT NULL, external_job_id TEXT NULL
  idempotency_key TEXT NOT NULL
  status TEXT NOT NULL            -- pending|dispatched|running|succeeded|failed|stale
  payload_hash TEXT NULL
  last_heartbeat_at, started_at, completed_at TIMESTAMPTZ NULL
  error_code TEXT NULL, metadata JSONB NOT NULL DEFAULT '{}'
  created_at, updated_at TIMESTAMPTZ NOT NULL

UNIQUE(idempotency_key)
UNIQUE NULLS NOT DISTINCT (scene_id, run_id, stage, segment_id, attempt_no)
GRANT: service_role ALL; authenticated nur SELECT über Szenen-Ownership (RLS)
```

**A.2 Jobzeile vor jedem Dispatch**
Erst lokal `status = pending`, `external_job_id = null` anlegen, `id` in Webhook-URL/Provider-Metadaten mitgeben, dann extern aufrufen, danach `external_job_id` + `status = dispatched`. Ein sehr schneller Callback findet die Identität also immer vor. Gilt in A für `base_video`, `sync_segment`, `audio_mux`, `final_render`; `tts` und `preclip` folgen in B.

**A.3 Ein gemeinsames Callback-Gate**
`_shared/claimComposerPipelineCallback.ts` (+ SQL-Funktion) prüft atomar `scene.active_run_id = run_id`, Job-Identität (`id`, `scene_id`, `run_id`, `stage`, `attempt_no`, optional `external_job_id`), Nicht-Terminalität und erwarteten `pipeline_state`:

```sql
UPDATE composer_pipeline_jobs
   SET status = 'processing'
 WHERE id = :pipeline_job_id
   AND run_id = :run_id
   AND status IN ('pending','dispatched','running')
RETURNING id;
```

Kein Rückgabewert → `stale_callback | duplicate_callback | wrong_run | wrong_job | already_terminal`, strukturiert protokolliert (`scene_id`, `run_id`, `pipeline_job_id`, `stage`, `attempt_no`, `reason`), keine Szenenmutation. Eingebaut in `compose-clip-webhook`, `modelark-poll`, `sync-so-webhook`, `render-sync-segments-audio-mux` — jeweils als vorgeschalteter Guard.

**A.4 Versioniertes Verhalten**
Strikte Prüfung nur für `run_contract_version = 427`. v426-Läufe nutzen weiter den Legacy-Pfad. `composer-start-scene-generation` vergibt die `run_id` heute vor `compose-video-clips`; diese Grenze wird erst in v427B so verschoben, dass Snapshot und Reservierung in einer Transaktion entstehen.

**Abnahme A (automatisiert):** (1) v427-Run legt vor Dispatch einen Job an; (2) passender Callback schreibt; (3) zweiter identischer Callback ist No-op; (4) Callback eines alten Runs verändert nichts; (5) falsche `external_job_id` schreibt nicht; (6) Retry ⇒ `attempt_no = 2`, verspäteter Callback von Attempt 1 wirkungslos; (7) zwei Sync-Segmente ändern nur ihr eigenes Segment; (8) v426-Runs laufen weiter; (9) `stale_callback` strukturiert geloggt; (10) weder Abrechnung noch sichtbarer Status ändern sich; (11) Lip-Sync-Freeze-Tests grün.

## v427B — Dauer und Geld als Einheit
Obergrenzen-Reservierung → TTS → Messung → exakter Dauervertrag → Reduktion → Snapshot einfrieren → Video-Dispatch. `tts`/`preclip` bekommen Jobzeilen. Commit/Refund lesen ausschließlich `quoted_cost_euros` aus dem Snapshot.

## v427C — Fertig-Semantik
Provider-Webhook: `clip_status = generating`, `pipeline_state = base_clip_ready`, `base_clip_status = ready`; Übergangsmaterial extrahieren und Kontinuitätskette sofort fortsetzen. `clip_status = ready` / `pipeline_state = completed` nur für das endgültige Nutzerergebnis; Vorschau, Export, Abschluss und Benachrichtigung hängen am Nutzer-Gate.

## v427D — Wartezeiten und Wiederherstellung
`lease_expires_at`, `lease_run_id`, `lease_job_id`, `last_heartbeat_at`; TTL = Provider-Timeout + Toleranz (ModelArk 30 min statt 15), Heartbeat nur bei passender Run- und Job-ID; Kettenlease hängt allein am `base_video`-Job. Storyboard-Autosave mit `draft_revision`, `last_saved_revision`, `client_instance_id` und Optimistic Concurrency. UI-Phasen werden aus `pipeline_state` abgeleitet statt frei gesetzt.

## Rollout (Expand and Contract)
1. Neue Felder/Tabellen nullable. 2. Neue Runs dual-write mit `run_contract_version = 427`. 3. Strikte Checks nur für v427-Runs. 4. v426-Runs auslaufen lassen. 5. Legacy-Fallback entfernen.

Bestandsdaten mit `clip_status = ready` + `lip_sync_status = pending/running` werden nicht pauschal migriert; ein Reconciliation-Lauf unterscheidet aktive Altläufe von echten Ergebnissen.

## Erster Patch
Migration A.1 (Spalten + `composer_pipeline_jobs` inkl. GRANTs/RLS), danach `_shared/claimComposerPipelineCallback.ts` mit Tests — beides ohne Verhaltensänderung an der Lip-Sync-Kette.
