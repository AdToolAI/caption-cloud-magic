# G0 — Implementierungsvertrag State-Core (final, zur Freigabe)

Scope: ausschließlich der State-Core. Keine Lip-Sync-Writer-Migration, kein G1–G6, kein Cast & World. Der Lip-Sync-Freeze (`.lovable/LIPSYNC-FEATURE-FREEZE.md`) bleibt unangetastet — G0 ändert das Kernprimitive, nicht seine Aufrufer.

## 1. Kanonische RPC

Neuer Kern `public.composer_scene_transition_v2(...)`, `SECURITY DEFINER`, `search_path = public`:

```
_scene_id            uuid      NOT NULL
_to                  composer_scene_state NOT NULL
_guard_mode          text      NOT NULL     -- 'run_bound' | 'runless'
_run_id              uuid      DEFAULT NULL -- Pflicht bei run_bound
_generation          integer   DEFAULT NULL -- Pflicht bei run_bound
_runless_reason      text      DEFAULT NULL -- Pflicht bei runless, geschlossene Menge
_write_id            text      NOT NULL     -- stabile semantische Write-ID
_from                composer_scene_state[] DEFAULT NULL
_detail              text      DEFAULT NULL
_substate            text      DEFAULT NULL
_error_text          text      DEFAULT NULL
_clear_detail        boolean   DEFAULT false
_clear_substate      boolean   DEFAULT false
_clear_error         boolean   DEFAULT false
RETURNS TABLE(applied boolean, state composer_scene_state, substate text, reason text, path composer_scene_state[])
```

`_guard_mode` hat keinen Default — jeder Aufrufer muss sich entscheiden.

- `run_bound`: `_run_id` und `_generation` sind Pflicht (sonst `reason = 'guard_args_missing'`). Geprüft wird **atomar unter demselben Row Lock**: `active_run_id = _run_id` (sonst `stale_run`) **und** `plate_generation = _generation` (sonst `stale_generation`). Kein JS-seitiger Vorabvergleich mehr — das heutige TOCTOU-Fenster entfällt.
- `runless`: `_run_id`/`_generation` müssen NULL sein (sonst `guard_mode_conflict`), `_runless_reason` ist Pflicht und muss aus der geschlossenen Menge stammen:
  `user_cancel_no_active_run`, `project_teardown_no_active_run`, `image_scene_no_run_context`, `admin_recovery`, `system_migration`.
  Ein unbekannter Grund wird abgelehnt (`runless_reason_invalid`). `hybrid_extend_*` ist **bewusst nicht** in dieser Menge.

`pipeline_state_run_id`: bei `run_bound` = `_run_id`; bei `runless` **explizit `NULL`**. Kein `COALESCE(_run_id, active_run_id)` mehr.

Detail/Substate/Fehlertext: `_error_text` schreibt das Fehlertextfeld der Szene, `_clear_detail`/`_clear_substate`/`_clear_error` setzen das jeweilige Feld explizit auf NULL; ohne sie gilt weiter `COALESCE`. Zielzustand, Detail, Substate und Fehlertext werden in genau einem `UPDATE` geschrieben — damit ist „State + Error atomar" tatsächlich implementierbar, und `failSceneState()` braucht keinen zweiten Write mehr.

## 2. Atomarer Pfad statt v391-Loop

Der Client-Loop in `_shared/scene-state.ts:352-371` entfällt ersatzlos. Die Pfadlogik wandert unter den Row Lock:

1. `SELECT … FOR UPDATE` auf `composer_scenes`.
2. Guards (Ownership, guard_mode, `_from`).
3. Direkte Kante in `composer_scene_transitions`? → anwenden.
4. Sonst: `WITH RECURSIVE` über `composer_scene_transitions` den kürzesten Pfad `current → _to` suchen, **eingeschränkt auf die Vorwärtsordnung der linearen Kette** (`idle, plate_queued, plate_rendering, plate_ready, audio_prep, audio_ready, lipsync_dispatched, lipsync_running, lipsync_muxing, complete`). Kanten nach `failed`, `canceled`, `idle` sowie Self-Kanten sind als Pfad-Zwischenschritte ausgeschlossen; Suchtiefe hart begrenzt.
5. Kein Pfad → `transition_not_allowed`, nichts geschrieben.
6. Pfad gefunden → **ein** `UPDATE` auf den Zielzustand, plus eine Audit-Zeile je logischem Zwischenschritt, alles in derselben Transaktion. `path` kommt im Result zurück.

Damit werden folgende Kanten **nicht** zusätzlich in die Allowlist aufgenommen: `plate_ready→audio_ready`, `plate_ready→lipsync_dispatched|lipsync_running|lipsync_muxing`, `audio_prep→lipsync_dispatched|lipsync_running|lipsync_muxing`, `audio_ready→lipsync_running|lipsync_muxing`. Die Allowlist behält ausschließlich echte Einzelschrittkanten.

## 3. Transition-Audit

Neue Tabelle `public.composer_scene_transition_log`:
`id, scene_id, project_id, from_state, to_state, step_index, is_intermediate, guard_mode, runless_reason, run_id, generation, write_id, applied, reason, source_signature ('v2'|'legacy_6'|'legacy_7'|'recovery'), caller_role, auth_uid, created_at`.

RLS an, `service_role` voll, `authenticated` nur lesend auf eigene Projekte, kein `anon`-Grant. Geschrieben wird ausschließlich aus den SECURITY-DEFINER-Funktionen. Die Tabelle bedient drei Zwecke gleichzeitig: Zwischenschritt-Historie (2.), Wrapper-Telemetrie (5.) und Auditpflicht des Recovery-Primitives (6.).

## 4. Sicherheit

- `REVOKE EXECUTE … FROM anon` auf `composer_scene_transition/6`, `/7` und dem neuen Kern — inklusive `ALTER DEFAULT PRIVILEGES`-Korrektur bzw. explizitem Revoke, damit der `pg_default_acl`-Eintrag für Schema `public` nicht erneut greift.
- Die Ownership-Lücke wird geschlossen: statt `IF auth.uid() IS NOT NULL AND NOT can_edit_composer_project(...)` gilt künftig — ist der Aufrufer **nicht** `service_role`, ist `auth.uid()` Pflicht und `can_edit_composer_project()` muss zutreffen; NULL ohne `service_role` ⇒ `forbidden`. Edge Functions laufen als `service_role` und sind davon nicht betroffen. Verifiziert wird das mit einem anon-Aufruf gegen die Data API (muss `forbidden`/403 liefern) und einem service_role-Aufruf (muss weiter funktionieren).

## 5. Compatibility-Wrapper

`composer_scene_transition/6` und `/7` bleiben bestehen, kein Drop in G0. Beide werden zu dünnen Wrappern, die auf den neuen Kern delegieren mit `_guard_mode := CASE WHEN _run_id IS NOT NULL THEN 'run_bound' ELSE 'runless' END`, `_runless_reason := 'system_migration'`, `_write_id := 'legacy_wrapper'`, und die jeden Aufruf mit `source_signature = 'legacy_6'|'legacy_7'` plus Caller-Rolle in den Audit-Log schreiben. Erst wenn dieser Log über ein Beobachtungsfenster keine Fremdaufrufe zeigt, ist ein Drop in G6 begründbar.

## 6. Recovery-Primitive

`public.composer_recover_scene(_scene_id, _expected_run_id uuid, _expected_plate_generation int, _to composer_scene_state, _reason text, _write_id text)`:
- Zielzustand nur `failed` oder `canceled`.
- `_reason` aus geschlossener Menge (`watchdog_timeout`, `stuck_clip_recovery`, `orphaned_job`, `manual_admin`).
- Stimmt `active_run_id`/`plate_generation` nicht mit den Erwartungswerten überein, ist der Aufruf ein **No-op** mit `reason = 'stale_recovery'` — kein Force-Write.
- Jeder Aufruf, auch der No-op, erzeugt eine Audit-Zeile mit `source_signature = 'recovery'`.
- Nur `service_role`.

## 7. `failSceneState()`

Wird run-sicher gemacht (Pflichtparameter `guardMode`, `writeId`, bei `run_bound` zusätzlich `runId`+`generation`) und bleibt in G0 **ohne Aufrufer**. Der Helfer ist als Debt markiert; verdrahtet wird er erst in G1–G4. Der Contract-Test hält fest, dass er heute 0 Repo-Caller hat.

## 8. Cancel-Vertrag (Produktentscheidung umgesetzt)

`composer-cancel-scene` und `composer-cancel-project` laden `active_run_id` bereits. Beide erfassen künftig zusätzlich `plate_generation` und rufen:
- mit aktivem Run: `guard_mode = 'run_bound'` und exakt diesem Run + dieser Generation. Wurde zwischenzeitlich ein neuer Run gestartet, schlägt der Cancel mit `stale_run` fehl und terminiert Run B **nicht**.
- ohne aktiven Run: `guard_mode = 'runless'` mit `user_cancel_no_active_run` bzw. `project_teardown_no_active_run`.

Projekt-Abbruch wendet denselben Vertrag **pro Szene** an, nicht pauschal auf das Projekt.

Write-IDs: `composer-cancel-scene:cancel-active-run`, `composer-cancel-scene:cancel-no-active-run`, `composer-cancel-project:cancel-active-run`, `composer-cancel-project:teardown-no-active-run`.

## 9. `hybrid-extend-scene`

Bleibt in G0 unverändert und wird **nicht** in die permanente Runless-Allowlist aufgenommen. Er wird als Vertragslücke `hybrid-extend-scene:mark-failed-on-error` im Inventar geführt und läuft übergangsweise über `system_migration`, mit Contract-Test-Eintrag „bekannte Debt, Ziel G2: run_bound". In G2 bekommt der Extend-Pfad einen echten Run-Kontext.

## 10. Tests

- **Contract-Test Guard-Modi**: jeder Aufruf des neuen Kerns liefert `guard_mode` und `write_id`; `runless` nur mit Grund aus der geschlossenen Menge; `runless` in Webhook-/Watchdog-Dateien verboten.
- **Race-Test Run-Guard**: Run A startet, Run B startet, Cancel für A darf B nicht terminal setzen. Zusätzlich zwei konkurrierende Transitionen auf dieselbe Szene — genau eine gewinnt, die andere liefert `stale_run`/`stale_generation`.
- **Pfad-Atomizität**: `plate_ready → lipsync_running` erzeugt genau ein `UPDATE`, drei Audit-Zeilen und keinen sichtbaren Zwischenzustand; ein Abbruch mittendrin lässt die Szene auf dem Ausgangszustand.
- **`pipeline_state_run_id`**: nach `runless` exakt NULL, nach `run_bound` exakt `_run_id`.
- **Grants**: `has_function_privilege('anon', …, 'EXECUTE')` ist auf allen drei Funktionen `false`; anon-Aufruf über die Data API liefert `forbidden`.
- **Wrapper-Telemetrie**: Aufruf über 6er und 7er erzeugt je eine Audit-Zeile mit korrekter `source_signature`.
- **Recovery**: stale Erwartungswerte ⇒ No-op + Audit-Zeile; passende Werte ⇒ Übergang + Audit-Zeile.
- Bestehende Composer-Suite und `tsgo` müssen grün bleiben; die Lip-Sync-Frozen-Contract-Tests dürfen sich nicht bewegen.

## 11. Reihenfolge und Abschluss

1. Migration: Audit-Tabelle + Grants.
2. Migration: neuer Kern, Pfadvalidierung, Recovery-Primitive, Revoke/Ownership-Fix, Wrapper-Umbau.
3. `_shared/scene-state.ts`: v391-Loop entfernen, `guardMode`/`writeId` als Pflichtparameter, `failSceneState()` härten.
4. Nur die zwei Cancel-Functions auf den neuen Vertrag heben (das ist Teil des Cancel-Vertrags, nicht G1).
5. Tests, Deployment, Race-Nachweis, Bericht.

Danach STOP. G1 erst nach separater Freigabe. Cast & World bleibt CW1 nach v431.
