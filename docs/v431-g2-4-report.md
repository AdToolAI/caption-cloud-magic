# v431 — G2.4 Abschlussbericht (hybrid-extend-scene)

Umsetzung exakt nach der autoritativen Endfassung des G2.4-Vertrags.

## 1. `hybrid-extend-scene:idle` = insert-default

- `docs/v431-prep-inventory.md` Zeile 89 und Zeile 161 reklassifiziert (kein State-Writer, kein Recovery-Override).
- Eintrag aus `src/lib/composer/__tests__/fixtures/v431LegacyWriteInventory.ts` entfernt, mit Begründung als Kommentar an Ort und Stelle. Writer-Count −1.
- Kein Runless, kein Grandfathering.

## 2. Fail-closed Run-Akquise + Compensating Cleanup

`supabase/functions/hybrid-extend-scene/index.ts`:

- `composer-start-scene-generation { prepare_only: true }` bleibt der einzige Akquise-Pfad (kein `beginSceneRun()`, kein Sonder-Run).
- Fehlt Run oder Generation, wird **abgebrochen**: keine Frame-Extraktion, kein Provider-Dispatch.
- Cleanup deckt den Partial-Run ab (`composer_start_scene_run` committet `active_run_id` bereits vor möglichen Folgefehlern). Guards des Deletes:
  `id = newSceneId` ∧ `continuity_source_scene_id = sourceSceneId` ∧ `pipeline_state IN ('idle','plate_queued')` ∧ `clip_status = 'pending'` ∧ `clip_url IS NULL` ∧ `base_video_url IS NULL` ∧ `processed_video_url IS NULL`.
  `active_run_id` ist **kein** Ausschlusskriterium.
- Greift der Guard nicht: kein Delete, `hybrid_zombie_unresolved` im Log **und** im Response (`unresolvedSceneId`).
- Response in beiden Fällen: `hybrid_run_acquire_failed` mit `cleaned: true|false`.

## 3. Neues Primitive `composer_fail_hybrid_extend_scene`

Signatur (genau eine, 5 Argumente, keine Defaults, kein Overload):
`(_scene_id uuid, _run_id uuid, _generation int, _write_id text, _error_text text) RETURNS jsonb`

- Delegiert an `composer_scene_transition_core` mit den **Konstanten** `_to = 'failed'`, `_guard_mode = 'run_bound'`, `_from = ARRAY['plate_queued']`, `source_signature = 'v2'`, `caller_class = 'v2'` — nicht parametrisierbar.
- Write-ID-Allowlist: `hybrid:frame-extract-failed`, `hybrid:no-anchor`, `hybrid:dispatch-failed`; alles andere → `write_id_not_allowed` + Audit-Zeile.
- Ablehnungen: `missing_run_provenance`, `stale_run`, `stale_generation`, `unexpected_state` (aus `unexpected_from_state` gemappt) — jeweils ohne Mutation.
- Legacy-Spiegel (`clip_status='failed'`, `clip_error`) nur nach erfolgreichem Core-Write, im selben Aufruf.
- `composer_fail_scene_with_mirrors` blieb unverändert frozen; `markSceneFailed()` ersatzlos entfernt (auch der `transitionScene`-Import).

### Security-Nachweis (G0)

```
count=1 | prosecdef=true | proconfig=search_path=pg_catalog, public | pronargs=5
has_function_privilege: anon=f | authenticated=f | service_role=t
```

## 4. Transaktionaler DB-Smoke (mit Rollback)

| Fall | Ergebnis | Zeile danach |
|---|---|---|
| applied aus `plate_queued` (`hybrid:no-anchor`) | `applied:true, success` | `failed/failed/boom`, `clip_url` unverändert |
| applied aus `plate_queued` (`hybrid:frame-extract-failed`) | `applied:true, success` | `failed/failed/boom`, `clip_url` unverändert |
| `plate_rendering` (`hybrid:dispatch-failed`) | `applied:false, unexpected_state` | `plate_rendering/pending/-`, unverändert |
| stale run | `applied:false, stale_run` | unverändert |
| stale generation | `applied:false, stale_generation` | unverändert |
| fremde write_id (`cvc:failed/pika`) | `applied:false, write_id_not_allowed` | unverändert |
| fehlende Provenienz | `applied:false, missing_run_provenance` | unverändert |

Bei allen Ablehnungen wurden weder Output-Felder (`clip_url`) noch Legacy-Spiegel (`clip_status`, `clip_error`) mutiert. Der gesamte Smoke lief in einer Transaktion, die per `RAISE EXCEPTION` zurückgerollt wurde — keine Restdaten.

## 5. Verifikation

- `npx vitest run src/lib/composer src/lib/video-composer` → **46 Dateien / 527 Tests grün** (identischer Command und identische Zahl wie die G2.3-Baseline).
- `npx tsgo --noEmit` → fehlerfrei.
- Edge-Function `hybrid-extend-scene` deployed.

## Bewusst offen (nicht G2.4)

- Äußerer Catch-all in `hybrid-extend-scene` ohne Fail-Write → G4/Recovery.
- `compose-dialog-segments` Deferred-Refund → eigener Credit-Gate-Track vor G3/G4.

**Status: G2.4 umgesetzt. STOP — kein G3 ohne neuen Auftrag.**
