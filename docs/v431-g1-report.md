# v431 — G1-Abnahmebericht (reduzierter Scope)

Status: **G1 umgesetzt**. G0-State-Core unverändert (eingefroren).

## 1. Migrierte Writes

| bisherige semantische ID | neue Branch-IDs | Vertrag |
| --- | --- | --- |
| `compose-video-clips:failed` | `compose-video-clips:failed-unsupported-source`<br>`compose-video-clips:failed-lipsync-uncertified`<br>`compose-video-clips:failed-anchor-input-unsupported` | `transitionSceneV2()`, `guardMode: run_bound`, `runId`/`generation` aus `sceneRunStamps` (Dispatch-Snapshot) |
| `SceneCard:canceled` | `cancel-dialog-lipsync:reset` | `composer_reset_lipsync_full()` SQL-Primitive mit `expected_generation`/`expected_run_id`-Guards; kein direkter Client-Write mehr |

`markSceneContractFailure()` wurde **nicht pauschal** umgestellt, sondern gesplittet:

- `legacyMarkSceneContractFailure()` — unveränderter Legacy-Write, greift ausschließlich,
  wenn zum Fehlerzeitpunkt **kein** Run-Stempel für die Szene existiert (z. B. Lip-Sync-Szene
  mit Nicht-`ai-`-`clipSource`). Diese Zweige bleiben Debt für **G2**.
- `markSceneContractFailure(sceneId, message, writeId)` — run-gestempelter Pfad: Zustand und
  `clip_error` atomar über den G0-Core (`_error_text`), danach ein **run-geguardeter**
  Kompatibilitätsspiegel für `clip_status` (`.eq(active_run_id).eq(plate_generation)`).
  Wird der Übergang abgelehnt (z. B. `stale_run`), erfolgt **kein** Legacy-Fallback —
  der verspätete Lauf darf den aktuellen nicht überschreiben.

`resumeContinuityChain()` läuft in beiden Pfaden unverändert.

## 2. Nicht migriert (bewusst)

- **`cancel-dialog-lipsync:canceled`** (nicht-Reset-Cancel) — nicht angefasst. Kein `run_bound`
  möglich (kennt nur den *jetzt* aktiven Run); Delegation an `composer-cancel-scene` ist
  fachlich **nicht** deckungsgleich (Scene-Cancel ist ein Voll-Cancel, hier bleibt das
  Basis-Video erhalten). Keine neue Runless-Regel angelegt.
- Unverändert außerhalb des Änderungssets: `_shared/lipsync-fail.ts`, `generate-talking-head`,
  `report-lipsync-motion-probe`, alle Webhooks/Watchdogs/Fan-in, `hybrid-extend-scene` (G2),
  Lip-Sync-Frozen-Contracts, Cast & World, Reverse-Bridge.

## 2.1 SceneCard-Reset-Implementierung

Der Client-Pfad für „Lip-Sync komplett zurücksetzen“ (und den in-flight-Abbruch-Button)
wurde auf den G0-Vertrag migriert:

- Kein direktes `supabase.from('composer_scenes').update(...)` mehr im Client.
- Stattdessen einziger Aufruf: `supabase.functions.invoke('cancel-dialog-lipsync', { body: { scene_id, reset: true } })`.
- `cancel-dialog-lipsync` nutzt für `reset === true` das SQL-Primitive
  `composer_reset_lipsync_full(_scene_id, _expected_generation, _expected_run_id)`.
- Das Primitive führt den atomaren Row-Lock, Stale-Request-Guard, Base-Restore
  (`clip_url = base_video_url`, `processed_video_url = NULL`) und die Bereinigung der
  13 Lip-Sync-Runtime-Keys in `audio_plan.twoshot` durch.
- Der Client macht einen optimistischen lokalen Rollback (inkl. Rückstellung von
  `clipUrl` auf `baseVideoUrl` und Löschen von `processedVideoUrl`) und kann bei
  Fehler (`stale_reset`, `no_base_plate`, etc.) sauber zurückrollen.
- Der Reset-Button funktioniert nun auch für bereits angewandte Szenen
  (`lip_sync_applied_at IS NOT NULL`), weil `reset: true` den früheren
  `already_applied`-Shortcut überspringt.

## 3. Grandfathering / Runless

- `composer_transition_grandfather` enthält ausschließlich Wrapper-Signaturen
  (`legacy_6`, `legacy_7`) — **keine** writer-spezifischen Kanten für
  `compose-video-clips`. Der migrierte Write lief bisher als direkter Tabellen-Update,
  nie über eine Grandfather-Kante. Es gibt daher nichts zu entfernen; entscheidend ist:
  **keine Zeile hinzugefügt** (im Smoke geprüft).
- `composer_runless_transition_rules`: unverändert, keine neue Regel
  (im Smoke geprüft: 0 Regeln mit `write_id LIKE 'compose-video-clips:%'`).

## 4. Nachweise

DB-Smoke (Fixture-Szene, danach rückstandsfrei gelöscht):

| Assertion | Ergebnis |
| --- | --- |
| B1 — run-gestempelter Contract-Failure setzt `failed` + `clip_error` atomar, 1 Audit-Zeile | PASS |
| B2 — verspäteter Fehler aus altem Run wird mit `stale_run` abgewiesen, keine Zustands-/Fehlerschreibung | PASS |
| B3 — Anchor-Branch-`write_id` greift auf gestempeltem Run | PASS |
| B4 — keine neuen Runless-Regeln, keine neuen Grandfather-Zeilen | PASS |

Statische Prüfungen:

- `tsgo` grün.
- `vitest run src/lib/composer/__tests__` — 29 Dateien / 368 Tests grün, inkl.
  `lipsyncFrozenContract`, `legacyWriterAllowlist`, `sceneStateClientContract`,
  `forceCinematicSyncRouting`.
- `clientReaderContract5E` grün nach Einführung von `legacy-mapping-allowed`-Markern
  für die optimistischen Rollback-Snapshots in `SceneCard.tsx`.
- Inventar `v431LegacyWriteInventory.ts`: Eintrag `SceneCard:canceled` auf
  `migratedIn: "G1"`, `contractWriteId: "cancel-dialog-lipsync:reset"` gesetzt;
  verbliebener Legacy-Zweig entfernt.

## 5. Änderungsset

- `supabase/functions/compose-video-clips/index.ts` (Helper-Split + 3 Call-Sites, deployed)
- `supabase/functions/cancel-dialog-lipsync/index.ts` (`reset: true` verwendet
  `composer_reset_lipsync_full`, deployed)
- `src/components/video-composer/SceneCard.tsx` (beide Cancel-/Reset-Buttons rufen
  ausschließlich `cancel-dialog-lipsync` auf, mit Rollback-Handling für
  `stale_reset`/`no_base_plate`)
- `src/lib/composer/__tests__/fixtures/v431LegacyWriteInventory.ts` (Inventar-Diff)
- Smoke-Migration (Fixture, self-cleaning)
- `docs/v431-g1-report.md`

**STOP.** Kein G2 ohne neue Freigabe.

## G1-Abnahme — die drei offenen Nachweise (2026-08-14)

### 1. Vollreset-Smoke (DB, service-role, temporäre QA-Function, danach gelöscht)
Vier Wegwerf-Szenen in einem echten Projekt, Fixtures mit realen Job-Shapes
(`dialog_shots.shots[].sync_job_id`, `dialog_shots.passes[].job_id`,
`audio_plan.twoshot.syncJobs.jobs[]`, `replicate_prediction_id = "sync:job-4"`).

| Fall | Ergebnis |
| --- | --- |
| A laufender Lip-Sync | `ok:true`, `clip_url` = `base_video_url`, `processed_video_url=NULL`, `lip_sync_status=canceled`, `dialog_shots=NULL`, `plate_generation 1 → 2`, `canceled_jobs=[job-1..job-4]` |
| B bereits angewandt | `ok:true`, Base wiederhergestellt, `lip_sync_applied_at=NULL`, `plate_generation 1 → 2`, kein Refund |
| C stale (`expected_generation=99`) | `ok:false reason=stale_reset`, before/after byte-gleich — kein DB-Write |
| D `no_base_plate` (kein Base, kein Source-Clip, `processed_video_url` gesetzt) | `ok:false reason=no_base_plate`, before/after byte-gleich **inkl. `plate_generation` = 1** |

- **audio_plan.twoshot**: nach A/B nur noch `turns`, `speakers`, `plan_version`;
  alle 13 Runtime-Keys entfernt, `audio_plan.other` unverändert.
- **Credits/Reservations**: unverändert; die Funktion enthält keinen Credit-/
  Reservation-Pfad, `composer_run_reservations` vor/nach identisch.
- **Callback mit alter Generation**: durch den Bump auf 2 greift die bestehende
  Fencing-Prüfung in `compose-clip-webhook/index.ts` (Zeilen 133–142:
  Vergleich `active_run_id` + `plate_generation`, Abweichung → verworfen).
- Alle QA-Szenen wurden gelöscht, die temporäre QA-Function ist entfernt.

### 2. Optimistischer Client-Rollback (`SceneCard` + `lipSyncResetFlow.ts`)
Optimistisch verändert: `lipSyncStatus`, `lipSyncAppliedAt`,
`lipSyncSourceClipUrl`, `clipUrl` (→ `baseVideoUrl`), `processedVideoUrl`,
`twoshotStage`, `dialogShots`, `lipSyncWithVoiceover`, `dialogMode`,
`engineOverride`, `clipError`, `replicatePredictionId` — plus die drei
Pending-Marker (`markLipSyncPending`, `markDialogModePending`,
`markEngineOverridePending`).

Bei Serverfehler wird der komplette Snapshot zurückgeschrieben **und** die drei
Pending-Marker aus dem Snapshot rekonstruiert
(`restoreResetMarkersFromSnapshot`) — die Karte kann also nicht in
„Lip-Sync aus“ hängen bleiben. Bei `stale_reset` (409) greift
`recoverFromStaleReset`: Refetch der Szene und Marker/Felder aus dem **frischen
Serverstand**, nicht aus dem alten Snapshot (`__staleResetHandled` verhindert
den Snapshot-Rollback). Regression: `lipSyncResetRollback.test.ts`.

### 3. Finale Teststufe
- Vollständige Composer-/Lip-Sync-Suite: **30 Dateien, 373 Tests, alle grün**
  (inkl. `clientReaderContract5E`, `lipSyncIntentGateScanner`,
  `customerLanguageContract63`, `forceCinematicSyncRouting`).
- Der frühere Timeout in `customerLanguageContract63` war Last-Flakiness; im
  vollen Lauf grün (2772 ms).
- `tsgo --noEmit`: grün.
- Neue Einträge: `lipSyncResetFlow.ts` mit 4 Snapshot-/Rollback-Reads im
  Intent-Gate-Inventar registriert (kein Intent-Gate, reine Serialisierung) und
  mit `legacy-mapping-allowed`-Markern versehen.
