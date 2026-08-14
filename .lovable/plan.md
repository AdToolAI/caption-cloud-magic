# G0 — Implementierungsvertrag State-Core (final, zur Freigabe)

Scope: ausschließlich der State-Core. Keine Lip-Sync-Writer-Migration, kein G1–G6, kein Cast & World. Der Lip-Sync-Freeze (`.lovable/LIPSYNC-FEATURE-FREEZE.md`) bleibt unangetastet — G0 ändert das Kernprimitive, nicht seine Aufrufer.

## 1. Kern-Primitive und drei Fassaden

Das eigentliche Primitive ist **intern**: `public.composer_scene_transition_core(...)`, `SECURITY DEFINER`, `SET search_path = pg_catalog, public` (leerer, nicht frei auflösbarer Suchpfad-Vertrag; alle Tabellen, Typen und Funktionen werden im Rumpf zusätzlich schema-qualifiziert: `public.composer_scenes`, `public.can_edit_composer_project(...)`, `public.composer_scene_state` usw.). `REVOKE ALL ON FUNCTION … FROM public, anon, authenticated, service_role` — **niemand** ruft den Core direkt auf, nur die drei Fassaden (selber Owner, daher intern aufrufbar).

```text
        composer_scene_transition_core(..., _source_signature, _caller_class)
             ↑                     ↑                      ↑
composer_scene_transition_v2   ..._transition/6      ..._transition/7
   source = 'v2'                source = 'legacy_6'   source = 'legacy_7'
   caller_class = 'v2'          caller_class = 'legacy'
```

`_source_signature` und `_caller_class` sind **nicht** Teil der öffentlichen Signaturen und werden von den Fassaden als Literale gesetzt. Ein direkter service-role-Aufruf von `v2` kann sich damit nie als `legacy_6` ausgeben, und der Audit-Log ist unverfälschbar.

Öffentliche Signatur `public.composer_scene_transition_v2(...)`, `SECURITY DEFINER`, gleicher search_path- und Qualifizierungs-Vertrag:

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
- `runless`: `_run_id`/`_generation` müssen NULL sein (sonst `guard_mode_conflict`), `_runless_reason` ist Pflicht. Die zulässige Menge hängt von `_caller_class` ab:
  - `caller_class = 'v2'` (direkter Aufruf): `user_cancel_no_active_run`, `project_teardown_no_active_run`, `image_scene_no_run_context`. **`system_migration` ist hier verboten** (`runless_reason_not_allowed_for_caller`).
  - `caller_class = 'legacy'` (nur 6er/7er-Wrapper): ausschließlich `system_migration`, geprüft allein gegen die Grandfather-Tabelle (Abschnitt 5). Die drei v2-Gründe sind für Legacy-Wrapper verboten.
  - Recovery hat gar keinen Runless-Grund — dafür existiert ausschließlich `composer_recover_scene()`. `admin_recovery` ist **entfernt**.
  Ein unbekannter Grund wird abgelehnt (`runless_reason_invalid`). `hybrid_extend_*` ist **bewusst nicht** in dieser Menge.

### 1a. Kanten-Allowlist für direkte v2-Runless-Aufrufe

Ein legitimer Runless-Grund allein berechtigt **nicht** zu jeder state-machine-legalen Kante. Neue Tabelle `public.composer_runless_transition_rules(reason text, write_id text, from_state composer_scene_state, to_state composer_scene_state, note text, PRIMARY KEY(reason, write_id, from_state, to_state))`, service_role only, RLS an, kein `anon`/`authenticated`-Grant.

Bei `caller_class = 'v2'` muss jeder `runless`-Aufruf unter dem Row Lock ein Match auf `(_runless_reason, _write_id, current_state, _to)` finden. Kein Match ⇒ `reason = 'runless_edge_not_allowed'`, kein Write, aber Audit-Zeile. Die Zeilen werden in der Migration aus dem Cancel-Vertrag (Abschnitt 8) und dem Image-Szenen-Pfad befüllt. `system_migration` bekommt hier **keinen** Eintrag — die beiden Verträge sind strikt getrennt: v2 → `composer_runless_transition_rules`, Legacy → `composer_transition_grandfather`. Kein Aufruf durchläuft beide.

### 1b. Runless-Gründe mit „kein aktiver Run"-Bedingung

Für `user_cancel_no_active_run`, `project_teardown_no_active_run` und `image_scene_no_run_context` prüft die DB unter demselben `FOR UPDATE` zusätzlich `active_run_id IS NULL`. Ist zwischen dem vorbereitenden SELECT des Aufrufers und dem RPC ein Run B gestartet, ist der Aufruf ein **No-op** mit `reason = 'run_reappeared'` — Run B wird niemals durch einen runless-Cancel terminiert. Damit ist der No-active-run-Cancel-Race vollständig in der DB geschlossen.

`pipeline_state_run_id`: bei `run_bound` = `_run_id`; bei `runless` **explizit `NULL`**. Kein `COALESCE(_run_id, active_run_id)` mehr.

Detail/Substate/Fehlertext: `_error_text` schreibt das Fehlertextfeld der Szene, `_clear_detail`/`_clear_substate`/`_clear_error` setzen das jeweilige Feld explizit auf NULL; ohne sie gilt weiter `COALESCE`. Zielzustand, Detail, Substate und Fehlertext werden in genau einem `UPDATE` geschrieben — damit ist „State + Error atomar" tatsächlich implementierbar, und `failSceneState()` braucht keinen zweiten Write mehr.

## 2. Atomarer Pfad statt v391-Loop

Der Client-Loop in `_shared/scene-state.ts:352-371` entfällt ersatzlos. Die Pfadlogik wandert unter den Row Lock:

1. `SELECT … FOR UPDATE` auf `composer_scenes`.
2. Guards (Ownership, guard_mode, `_from`).
3. Direkte Kante in `composer_scene_transitions`? → anwenden.
4. Sonst: `WITH RECURSIVE` über `composer_scene_transitions` den kürzesten Pfad `current → _to` suchen, **eingeschränkt auf die Vorwärtsordnung der linearen Kette** (`idle, plate_queued, plate_rendering, plate_ready, audio_prep, audio_ready, lipsync_dispatched, lipsync_running, lipsync_muxing, complete`). Kanten nach `failed`, `canceled`, `idle` sowie Self-Kanten sind als Pfad-Zwischenschritte ausgeschlossen; Suchtiefe hart begrenzt.
5. Kein Pfad → `transition_not_allowed`, nichts geschrieben.
6. Pfad gefunden → **ein** `UPDATE` auf den Zielzustand, plus **eine Audit-Zeile je traversierter Kante** (also inklusive der letzten Kante auf `_to`), alles in derselben Transaktion. Für einen Pfad mit n Kanten entstehen exakt n Audit-Zeilen mit `step_index = 1..n`; `is_intermediate = true` für `step_index < n`, `false` für die letzte Zeile. `path` kommt im Result zurück.

Damit werden folgende Kanten **nicht** zusätzlich in die Allowlist aufgenommen: `plate_ready→audio_ready`, `plate_ready→lipsync_dispatched|lipsync_running|lipsync_muxing`, `audio_prep→lipsync_dispatched|lipsync_running|lipsync_muxing`, `audio_ready→lipsync_running|lipsync_muxing`. Die Allowlist behält ausschließlich echte Einzelschrittkanten.

## 3. Transition-Audit

Neue Tabelle `public.composer_scene_transition_log`:
`id, scene_id, project_id, from_state, to_state, step_index, is_intermediate, guard_mode, runless_reason, run_id, generation, write_id, applied, reason, source_signature ('v2'|'legacy_6'|'legacy_7'|'recovery'), caller_role, auth_uid, created_at`.

RLS an, `service_role` voll, `authenticated` nur lesend auf eigene Projekte, kein `anon`-Grant. Geschrieben wird ausschließlich aus den SECURITY-DEFINER-Funktionen. Die Tabelle bedient drei Zwecke gleichzeitig: Zwischenschritt-Historie (2.), Wrapper-Telemetrie (5.) und Auditpflicht des Recovery-Primitives (6.).

## 4. Sicherheit

- `REVOKE EXECUTE … FROM anon` auf `composer_scene_transition/6`, `/7` und `composer_scene_transition_v2`; auf `composer_scene_transition_core` `REVOKE ALL FROM public, anon, authenticated, service_role` — inklusive `ALTER DEFAULT PRIVILEGES`-Korrektur bzw. explizitem Revoke, damit der `pg_default_acl`-Eintrag für Schema `public` nicht erneut greift.
- **Search-Path-Härtung:** alle neuen bzw. umgebauten `SECURITY DEFINER`-Funktionen (`_core`, `_v2`, `/6`, `/7`, `composer_recover_scene`) bekommen `SET search_path = pg_catalog, public` und qualifizieren im Rumpf jede Tabelle, jeden Typ und jeden Funktionsaufruf explizit mit `public.` bzw. `auth.`. Kein Verlass auf ein frei auflösbares `public`.
- **Rollenerkennung (exakt festgelegt):** In `SECURITY DEFINER` ist `current_user` der Funktions-Owner und darf **nicht** zur Autorisierung verwendet werden. Maßgeblich ist ausschließlich der Request-Claim: `coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', current_setting('request.jwt.claim.role', true), '')`. Nur der Wert `service_role` gilt als privilegiert. Fällt der Claim leer aus (direkte SQL-Session ohne PostgREST), gilt der Aufrufer als **nicht** privilegiert.
- Die Ownership-Lücke wird geschlossen: ist der Claim nicht `service_role`, ist `auth.uid()` Pflicht und `can_edit_composer_project(auth.uid(), project_id)` muss zutreffen; `auth.uid() IS NULL` ohne `service_role` ⇒ `forbidden`. Edge Functions laufen mit `service_role`-Claim und sind nicht betroffen.
- Pflichttests: `anon` ⇒ verboten; `authenticated` + fremdes Projekt ⇒ verboten; `authenticated` + eigenes Projekt ⇒ erlaubt; `service_role` ⇒ erlaubt.

## 5. Compatibility-Wrapper

`composer_scene_transition/6` und `/7` bleiben bestehen, kein Drop in G0. Sie sind die einzige kontrollierte Compatibility-Grenze während des Beobachtungsfensters:

- Die öffentliche Fassade `composer_scene_transition_v2` ist **nur für `service_role`** ausführbar (`REVOKE EXECUTE FROM public, anon, authenticated`). Die Wrapper sind `SECURITY DEFINER` und behalten die heutige Aufrufbarkeit für `authenticated`. Beide delegieren an `composer_scene_transition_core` und setzen dort `_source_signature = 'legacy_6'|'legacy_7'` und `_caller_class = 'legacy'` als Literale.
- Wrapper-Write-IDs: `legacy_wrapper_6` / `legacy_wrapper_7`.
- Ein Wrapper-Aufruf **mit** `_run_id` **und** `_generation` läuft als `run_bound` — unverändert.
- **Partial Guard — kein Fallback auf runless.** `run_bound` gilt nur, wenn beide Guard-Argumente gesetzt sind. Genau eines von beiden gesetzt ⇒ `reason = 'guard_args_missing'`, **kein Write**, Audit-Zeile. Weder `_run_id` ohne `_generation` noch `_generation` ohne `_run_id` darf jemals in den runless-Pfad fallen.
- **Runless-Pfad der Wrapper (strikt getrennt):** beide Guard-Argumente NULL ⇒ `_runless_reason = 'system_migration'`, und geprüft wird **ausschließlich** `public.composer_transition_grandfather` auf `(source_signature, write_id, from_state, to_state)`. Kein Match ⇒ `runless_not_grandfathered`, kein Write, Audit-Zeile. Die Regeln aus 1a gelten für Wrapper **nicht** und `system_migration` erscheint nie in `composer_runless_transition_rules`. Umgekehrt kann ein direkter v2-Aufruf `system_migration` nicht verwenden. Die Prüfung aus 1b (`active_run_id IS NULL`) gilt nur für die drei v2-Gründe.
- Die Grandfather-Allowlist wird beim Migrationsschreiben aus dem bestehenden Inventar (`docs/v431-prep-inventory.md`) befüllt, ist eine eigene Tabelle (service_role only, RLS an) und schrumpft mit jeder Gruppe G1–G5, bis sie in G6 leer ist.
- Erst wenn der Audit-Log über ein Beobachtungsfenster keine Fremdaufrufe zeigt **und** die Allowlist leer ist, ist ein Drop in G6 begründbar.

## 6. Recovery-Primitive

`public.composer_recover_scene(_scene_id, _expected_run_id uuid, _expected_plate_generation int, _to composer_scene_state, _reason text, _write_id text)`:
- Zielzustand nur `failed` oder `canceled`.
- `_reason` aus geschlossener Menge (`watchdog_timeout`, `stuck_clip_recovery`, `orphaned_job`, `orphaned_run`, `manual_admin`).
- **`_expected_plate_generation` ist immer Pflicht** und wird immer verglichen — auch beim orphaned Recovery. Stimmt sie nicht, ist der Aufruf ein No-op mit `reason = 'stale_generation'`. Recovery bleibt damit ausnahmslos generationsgebunden.
- **`_expected_run_id` darf ausschließlich bei `_reason = 'orphaned_run'` NULL sein.** In diesem Fall verlangt die DB unter dem Row Lock zusätzlich `active_run_id IS NULL`; ist dort ein Run gesetzt, ist der Aufruf ein No-op mit `reason = 'run_reappeared'`. Bei jedem anderen Grund ist `_expected_run_id` NULL ein harter Fehler (`expected_run_id_required`).
- Bei gesetztem `_expected_run_id`: stimmt `active_run_id` nicht überein, No-op mit `reason = 'stale_recovery'` — kein Force-Write.
- Jeder Aufruf, auch jeder No-op, erzeugt eine Audit-Zeile mit `source_signature = 'recovery'` inkl. `reason`.
- Nur `service_role`.

## 7. `failSceneState()`

Wird run-sicher gemacht (Pflichtparameter `guardMode`, `writeId`, bei `run_bound` zusätzlich `runId`+`generation`) und bleibt in G0 **ohne Aufrufer**. Der Helfer ist als Debt markiert; verdrahtet wird er erst in G1–G4. Der Contract-Test hält fest, dass er heute 0 Repo-Caller hat.

## 8. Cancel-Vertrag (Produktentscheidung umgesetzt)

`composer-cancel-scene` und `composer-cancel-project` laden `active_run_id` bereits. Beide erfassen künftig zusätzlich `plate_generation` und rufen:
- mit aktivem Run: `guard_mode = 'run_bound'` und exakt diesem Run + dieser Generation. Wurde zwischenzeitlich ein neuer Run gestartet, schlägt der Cancel mit `stale_run` fehl und terminiert Run B **nicht**.
- ohne aktiven Run: `guard_mode = 'runless'` mit `user_cancel_no_active_run` bzw. `project_teardown_no_active_run`. Die DB prüft diesen Fall gemäß 1b erneut unter dem Row Lock: ist inzwischen Run B da, No-op mit `run_reappeared` — die Edge Function meldet das als „Abbruch nicht angewendet, neuer Run aktiv" und cancelt B nicht.

Projekt-Abbruch wendet denselben Vertrag **pro Szene** an, nicht pauschal auf das Projekt.

Write-IDs: `composer-cancel-scene:cancel-active-run`, `composer-cancel-scene:cancel-no-active-run`, `composer-cancel-project:cancel-active-run`, `composer-cancel-project:teardown-no-active-run`.

## 9. `hybrid-extend-scene`

Bleibt in G0 unverändert und wird **nicht** in die permanente Runless-Allowlist aufgenommen. Er wird als Vertragslücke `hybrid-extend-scene:mark-failed-on-error` im Inventar geführt und läuft übergangsweise über `system_migration`, mit Contract-Test-Eintrag „bekannte Debt, Ziel G2: run_bound". In G2 bekommt der Extend-Pfad einen echten Run-Kontext.

## 10. Tests

- **Contract-Test Guard-Modi**: jeder Aufruf des neuen Kerns liefert `guard_mode` und `write_id`; `runless` nur mit Grund aus der geschlossenen Menge (`admin_recovery` existiert nicht mehr); `runless` in Webhook-/Watchdog-Dateien verboten.
- **Runless-Kanten-Allowlist**: ein direkter service_role-v2-Aufruf mit gültigem Grund, aber nicht in `composer_runless_transition_rules` gelisteter Kante ⇒ `runless_edge_not_allowed`, kein Write, Audit-Zeile; gelistete Kante ⇒ angewendet.
- **Runless No-active-run-Race**: bei gesetztem `active_run_id` liefern `user_cancel_no_active_run`, `project_teardown_no_active_run` und `image_scene_no_run_context` `run_reappeared` und schreiben nichts.
- **Partial Guard**: Wrapper-Aufruf mit `_run_id` ohne `_generation` und umgekehrt ⇒ `guard_args_missing`, kein Write, Audit-Zeile, **kein** runless-Fallback.
- **Rollenerkennung**: vier Fälle — `anon` verboten, `authenticated` + fremdes Projekt verboten, `authenticated` + eigenes Projekt erlaubt, `service_role` erlaubt. Zusätzlich Nachweis, dass `current_user` nirgends autorisierend ausgewertet wird.
- **Race-Test Run-Guard**: Run A startet, Run B startet, Cancel für A darf B nicht terminal setzen. Zusätzlich zwei konkurrierende Transitionen auf dieselbe Szene — genau eine gewinnt, die andere liefert `stale_run`/`stale_generation`.
- **Pfad-Atomizität**: `plate_ready → lipsync_running` läuft über vier Kanten (`plate_ready→audio_prep→audio_ready→lipsync_dispatched→lipsync_running`) und erzeugt genau ein `UPDATE` und **genau vier** Audit-Zeilen (`step_index` 1–4, die letzte mit `is_intermediate = false`) sowie keinen sichtbaren Zwischenzustand; ein Abbruch mittendrin lässt die Szene auf dem Ausgangszustand.
- **State + Error atomar**: ein `failed`-Übergang mit `_error_text` schreibt Zustand und Fehlertext in einem `UPDATE`; ein Folgeübergang mit `_clear_error` leert ihn.
- **`pipeline_state_run_id`**: nach `runless` exakt NULL, nach `run_bound` exakt `_run_id`.
- **Grants**: `anon` hat auf keiner der öffentlichen Funktionen EXECUTE; `authenticated` hat auf `composer_scene_transition_v2` kein EXECUTE; `composer_scene_transition_core` hat für `public`, `anon`, `authenticated` und `service_role` kein EXECUTE (direkter Core-Aufruf schlägt fehl); anon-Aufruf über die Data API liefert `forbidden`.
- **Unverfälschbare `source_signature`**: ein direkter v2-Aufruf erzeugt ausschließlich Audit-Zeilen mit `source_signature = 'v2'` — es gibt keinen Parameterweg, über den ein Caller `legacy_6`/`legacy_7` erzeugen könnte.
- **Reason-Trennung**: direkter v2-Aufruf mit `system_migration` ⇒ `runless_reason_not_allowed_for_caller`, kein Write; Wrapper-Aufruf mit `user_cancel_no_active_run` ⇒ ebenfalls abgelehnt.
- **Search-Path**: alle fünf SECURITY-DEFINER-Funktionen haben ein gesetztes `search_path`-Attribut (`proconfig`-Check) und der Linter meldet keine `function_search_path_mutable`-Warnung dazu.
- **Wrapper-Grandfathering**: ein run-loser Wrapper-Aufruf auf einer gelisteten Kante wird angewendet; derselbe Aufruf auf einer nicht gelisteten, aber state-machine-legalen Kante wird mit `runless_not_grandfathered` abgelehnt und auditiert.
- **Wrapper-Telemetrie**: Aufruf über 6er und 7er erzeugt je eine Audit-Zeile mit korrekter `source_signature`.
- **Recovery**: stale Run oder stale Generation ⇒ No-op + Audit-Zeile; `orphaned_run` mit `_expected_run_id = NULL` bei tatsächlich NULLem `active_run_id` ⇒ Übergang, bei wieder gesetztem Run ⇒ `run_reappeared`-No-op; `_expected_run_id = NULL` mit anderem Grund ⇒ harter Fehler.
- Bestehende Composer-Suite und `tsgo` müssen grün bleiben; die Lip-Sync-Frozen-Contract-Tests dürfen sich nicht bewegen.

## 11. Reihenfolge und Abschluss

1. Migration: Audit-Tabelle `composer_scene_transition_log`, Regel-Tabelle `composer_runless_transition_rules`, Grandfather-Tabelle `composer_transition_grandfather` + Grants + Seed-Zeilen.
2. Migration: neuer Kern (inkl. `_error_text`/`_clear_error`, Claim-basierte Rollenerkennung, 1a/1b-Prüfungen), Pfadvalidierung, Recovery-Primitive, Revoke/Ownership-Fix, Wrapper-Umbau inkl. Partial-Guard-Regel.
3. `_shared/scene-state.ts`: v391-Loop entfernen, `guardMode`/`writeId` als Pflichtparameter, `failSceneState()` härten.
4. Nur die zwei Cancel-Functions auf den neuen Vertrag heben (das ist Teil des Cancel-Vertrags, nicht G1).
5. Tests, Deployment, Race-Nachweis, Bericht.

Danach STOP. G1 erst nach separater Freigabe. Cast & World bleibt CW1 nach v431.
