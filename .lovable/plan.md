# v431 G2.3 — Finaler Scope-Vertrag v3 (nur Analyse, keine Migration)

Die drei Widersprüche sind aufgelöst. Ergebnis: G2.3 wird kleiner und
`compose-dialog-segments` fällt vollständig heraus.

## 1. `cds:pending-3` / deferred — komplett aus G2.3

Der Widerspruch ist bestätigt und wird wie vorgegeben aufgelöst:

- Der einzige echte `deferred`-State-Write liegt im Initial-Dispatch-Zweig
  (`!isAdvance && !isRetry`, index.ts:4229) — genau der Zweig mit dem nicht
  race-sicheren Refund. Bleibt **Legacy** bis zur Credit-Härtung.
- Der `isAdvance || isRetry`-Zweig (index.ts:4204) schreibt heute **nur**
  `clip_error` + `updated_at`. Er bleibt reine Diagnose und wird **nicht** zu
  einem State-Writer umdefiniert.

Keine neue State-Semantik in G2.3.

## 2. `lipsync-watchdog` bleibt G4 — und nimmt Circuit-Open mit

Verifiziert: der Watchdog ruft `compose-dialog-segments` mit
`{ scene_id, advance: true, pass_idx }` auf (lipsync-watchdog:426) — **exakt**
derselbe Body wie die internen Self-Invokes (index.ts:3916, :7717). Es gibt
heute **keinen** Origin-/Provenienzmarker, mit dem der Branch
Watchdog-Herkunft von G2-eigener Herkunft unterscheiden könnte.

Nach der Phasenregel gilt damit: der gesamte gemeinsame
`isAdvance || isRetry`-Branch wartet bis G4. Das betrifft auch den
Circuit-Open-Writer (`cds:conditional-running-or-pending`), dessen
`keepRunning`-Pfad genau über diese Flags läuft
(`isRetry || isAdvance || hasActiveV5`).

**Folge:** `compose-dialog-segments` ist in G2.3 gar nicht mehr enthalten.
Das geplante Primitive `composer_park_lipsync_dispatch` entfällt ersatzlos.
Ein Origin-Marker wird als G4-Vorarbeit notiert, nicht hier eingeführt.

## 3. `composer_finalize_upload_scene` — Härtung auf G0-Niveau

Variante C bleibt, mit korrigiertem Security-Vertrag:

| Invariante | Festlegung |
| --- | --- |
| Signatur | `public.composer_finalize_upload_scene(_scene_id uuid, _run_id uuid, _generation int, _write_id text, _upload_url text)` |
| write_id | ausschliesslich `'cvc:upload-complete'`, sonst `invalid_write_id` ohne Write |
| Row Lock | `SELECT ... FROM public.composer_scenes WHERE id = _scene_id FOR UPDATE` als erste Anweisung |
| Run-Gate | `active_run_id = _run_id` → sonst `stale_run`; `plate_generation = _generation` → sonst `stale_generation`; beide unter dem Lock |
| From-Set | fest `{idle, plate_queued}`, sonst `unexpected_from_state` |
| To-State | fest `complete`, kein Parameter |
| Provenienzspalte | `pipeline_state_run_id = _run_id` + Generation-Spiegel wie in den G2.2-Primitiven |
| Atomarität | Output-Tripel (`clip_url`, `base_video_url`, `processed_video_url`) + `pipeline_state='complete'` + `clip_status='ready'` in **einem** Commit |
| Audit | ein Eintrag in `public.composer_scene_transition_log`: `write_id`, Run, Generation, From/To, Ergebnis `applied` \| `stale_run` \| `stale_generation` \| `unexpected_from_state` \| `invalid_write_id` |
| Kein Write bei Ablehnung | stale oder unzulässiger From-State → kein Output-, kein Spiegel-Write, nur Audit |
| **Härtung** | `SECURITY DEFINER`, **`SET search_path = pg_catalog, public`**, alle Tabellen-/Funktionsreferenzen im Rumpf explizit `public.` bzw. `auth.` qualifiziert, `REVOKE ALL ... FROM PUBLIC, anon, authenticated`, `GRANT EXECUTE ... TO service_role` |
| State Machine | keine neuen Kanten in `composer_scene_transitions`, keine Änderung am generischen G0-Core |

## 4. Finaler G2.3-Migrationsscope — drei Pfade

| # | writeId | Primitive | From → To/Substate | Run-Quelle | Spiegel (atomar im selben Commit) |
| --- | --- | --- | --- | --- | --- |
| 1 | `compose-twoshot-audio:failed` (:653), **nur** G2-Caller `compose-video-clips` mit Body-Provenienz | `composer_fail_scene_with_mirrors` (G2.2, unverändert) | `audio_prep` → `failed` + `dialog_turns_required` | Body `run_id` / `plate_generation` (:572) | `lip_sync_status='failed'`, `twoshot_stage='failed'`, `clip_error` |
| 2 | `cvc:upload-complete` (:4117) | `composer_finalize_upload_scene` (neu) | `idle\|plate_queued` → `complete` | `sceneRunStamps` (G2.1) | `clip_status='ready'` + Output-Tripel |
| 3 | `cvc:failed/pika` (:4904) | `composer_fail_scene_with_mirrors` | `idle\|plate_queued\|plate_rendering` → `failed` + `provider_error` | `sceneRunStamps` (G2.1) | `clip_status='failed'`, `clip_error` + nur die heute tatsächlich gesetzten weiteren Spiegel |

Genau **ein** neues Primitive (`composer_finalize_upload_scene`). Keine neuen
Runless-/Grandfather-Ausnahmen, kein generischer Bypass, keine frei
übergebbaren Zielstates. Webhook- und Self-Heal-Caller von
`compose-twoshot-audio` bleiben unverändert bis G3/G5.

## 5. Ausserhalb G2.3

`compose-dialog-segments` vollständig (Circuit-Open, Deferred, Diagnosezweig),
`lipsync-watchdog`, `useTwoShotAutoTrigger`, `ClipsTab`-Auto-Trigger,
`compose-clip-webhook`, `autopilotComposerBridge`, Reset-Pfade,
`clip_error`-only-Diagnosen, Output-Writes ohne Statuswechsel, Job-Metadata.

Vorgemerkt für spätere Gates:
- **Credit-Gate:** Deferred-Refund an Transaction-Key binden + Idempotenz
  (bevorzugt über die vorhandenen Reservations-Primitive).
- **G4-Vorarbeit:** Origin-/Provenienzmarker für Advance/Retry, damit
  Watchdog-Herkunft von G2-eigener Herkunft unterscheidbar wird.

## 6. Umsetzungsreihenfolge nach GO

1. DB-Migration: `composer_finalize_upload_scene` mit dem Vertrag aus §3.
   (Keine Payload-Erweiterung an `compose-dialog-segments` — die Funktion ist
   nicht mehr Teil von G2.3.)
2. Writer-Migration der drei Pfade aus §4, caller-spezifisch bei
   `compose-twoshot-audio`.
3. Verifikation: `tsgo`, Composer-/Lip-Sync-Suite, Writer-Inventar-Test um das
   neue Primitive erweitert, transaktionale DB-Smokes (stale run, stale
   generation, unzulässiger From-State, falsches `write_id`, doppelter
   Callback, Cancel-Race, Audit-Vollständigkeit, „kein Output-Write bei
   Ablehnung").
4. Bericht `docs/v431-g2-3-report.md`.

Baseline-Vermerk: die vorbestehenden Social-Publishing-Reds in
`src/pages/__tests__/Composer.test.tsx` bleiben unverändert ausserhalb Scope.
