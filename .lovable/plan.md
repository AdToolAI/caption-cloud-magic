# v431 — G2.4 Analyse & Scope (hybrid-extend-scene)

Reiner Scope-Bericht. Keine Migration, keine Code-Änderung in diesem Schritt.

## Befund 1 — `hybrid-extend-scene:idle` ist eine Falschklassifikation

`supabase/functions/hybrid-extend-scene/index.ts:194` schreibt `pipeline_state: "idle"` **nicht** als Transition, sondern als Feldwert im `INSERT` der neuen Szene (Zeilen 183–204). Es gibt keine Vorgängerzeile, keinen From-State, keinen Run.

Konsequenz für das Inventar:
- Eintrag `hybrid-extend-scene:idle` in `docs/v431-prep-inventory.md` (Zeile 89) und in `src/lib/composer/__tests__/fixtures/v431LegacyWriteInventory.ts` (Zeile ~947) wird als `insert-default` reklassifiziert bzw. aus dem State-Writer-Inventar entfernt.
- Ebenso zu korrigieren: die Einstufung „3 — Recovery-Override / kein legaler Übergang“ (Inventar Zeile 161). Sie beschreibt einen Reset auf beliebige Bestandszeilen — das passiert hier nachweislich nicht.
- Damit sinkt der Writer-Count um 1; keine Runless-Ausnahme, kein Grandfathering nötig.

## Befund 2 — Run-Akquise ist heute nicht fail-closed

Nach dem INSERT holt die Funktion den kanonischen Run über `composer-start-scene-generation { prepare_only: true }` (Zeilen 216–246). Der `catch` ist bewusst weich (G2.1): bei Fehlschlag läuft der Pfad ohne `run_context` weiter, `compose-video-clips` erzeugt dann seinen Legacy-Run.

Für G2.4 ist das der eigentliche Blocker: die Failure-Pfade können nur dann run-gebunden schreiben, wenn der Run vor der Frame-Extraktion garantiert existiert.

## Befund 3 — die drei echten Failure-Pfade

Alle drei laufen heute über `markSceneFailed()` → `transitionScene(admin, sceneId, "failed", …)` (Zeile 414), also id-only, ohne Run/Generation, ohne atomaren Legacy-Spiegel.

| writeId | Ort | Auslöser | Erlaubter From-State | Ziel | Provenienz heute | Spiegel |
|---|---|---|---|---|---|---|
| `hybrid:frame-extract-failed` | Z. 294–296 | `extractFrame()` wirft | `plate_queued` | `failed` | keine | nein |
| `hybrid:no-anchor` | Z. 298–301 | kein `startAnchor` produziert | `plate_queued` | `failed` | keine | nein |
| `hybrid:dispatch-failed` | Z. 350–353 | `compose-video-clips` antwortet non-2xx | nur `plate_queued` — sonst No-op | `failed` | keine | nein |

Nicht im Scope, aber benannt: der äußere `catch` (Zeile 367–369) markiert die Szene gar nicht als `failed` — er loggt nur. Das ist eine getrennte Lücke (Szene bleibt hängen) und gehört fachlich zu G4/Recovery, nicht zu G2.4; ich führe sie im Bericht als bekannte Restschuld.

## Befund 4 — `prepare_only` erzeugt keine Credit-Reservation (geprüft)

`composer-start-scene-generation` mit `prepare_only: true` durchläuft nur Ownership-Check, `startSceneRun()`, `hardResetScene()` und den Eintritt nach `plate_queued`. Es gibt in dieser Funktion keinen Aufruf von `reserveRunCredits()`/`composer_reserve_run_credits`; der einzige Aufrufer im gesamten Functions-Baum ist `compose-video-clips` (`_shared/v427-credit-contract.ts` wird nur dort importiert).

## Befund 5 — `prepare_only` ist NICHT alles-oder-nichts (Variante B gilt)

Geprüft in der DB und im Code:
- `composer_start_scene_run(_scene_id)` ist für sich atomar (`SELECT … FOR UPDATE` + ein `UPDATE`), committet aber **sofort** `plate_generation+1`, `active_run_id`, `active_run_started_at`.
- Danach laufen in `composer-start-scene-generation` **separate** Schritte: `hardResetScene()` (kann mit `reset_failed`/409 abbrechen) und erst dann `transitionScene(… 'plate_queued')`.

Damit ist eine Teilmutation real möglich: Antwort non-2xx, während die Szene bereits `active_run_id` gesetzt hat und noch auf `idle` steht. Der bisher vorgeschlagene Delete-Guard (`active_run_id IS NULL`) würde dann **nicht** greifen — also Variante B.

**Vertrag:** Der Compensating-Cleanup deckt beide Formen ab und `cleaned:false` ist kein akzeptierter Endzustand für die eben erzeugte Szene. Gelöscht wird die Zeile, wenn **alle** gelten:
`id = <newSceneId dieser Anfrage>` und `continuity_source_scene_id = <sourceSceneId>` (Beweis: von dieser Anfrage angelegt) und `pipeline_state IN ('idle','plate_queued')` und `clip_status = 'pending'` und `clip_url IS NULL` und `base_video_url IS NULL` und `processed_video_url IS NULL`.
`active_run_id` ist **kein** Ausschlusskriterium mehr — ein halb erworbener Run ist genau der Fall, der weg muss. Vor jedem Frame-/Provider-Spend gibt es kein fremdes Output an dieser Zeile, deshalb ist der Delete sicher. Greift der Guard trotzdem nicht (Zeile hat bereits Output oder ist fortgeschritten — nur denkbar bei paralleler Fremdmutation), wird nicht gelöscht, sondern **laut** als `hybrid_zombie_unresolved` mit Scene-ID geloggt und im Fehler-Response ausgewiesen. Antwort: `hybrid_run_acquire_failed` mit `cleaned: true|false`.
Kein atomares Insert+Run-Primitive in G2.4 (bleibt notierte Verbesserung).

## Befund 6 — `composer_fail_scene_with_mirrors` kann `expected_from` NICHT ausdrücken

Die eindeutige 10-Argument-Signatur lautet
`(_scene_id, _run_id, _generation, _write_id, _error_text, _substate, _lip_sync_status, _twoshot_stage, _clip_status, _clear_lip_sync_fields)`
und ruft intern `composer_scene_transition_core(…, _from := NULL, …)` auf — es gibt also keinen From-State-Guard, nur die allgemeine Legalität `current → failed`. Da `failed` aus mehreren Zuständen legal ist, könnte `dispatch-failed` eine bereits nach `plate_rendering` fortgeschrittene Szene überschreiben.

`composer_scene_transition_core` besitzt den Guard bereits als Parameter `_from composer_scene_state[]`.

**Vertrag:** Das eingefrorene Primitive wird **nicht** angefasst (kein neuer Default-Parameter, kein Overload-Risiko). Stattdessen ein enges Hybrid-Primitive:

```text
composer_fail_hybrid_extend_scene(
  _scene_id uuid, _run_id uuid, _generation int, _write_id text, _error_text text
) RETURNS jsonb
```
- write_id-Allowlist: exakt `hybrid:frame-extract-failed`, `hybrid:no-anchor`, `hybrid:dispatch-failed` — sonst `applied:false, reason:'write_id_not_allowed'` inkl. Audit-Zeile.
- delegiert an `composer_scene_transition_core(_to := 'failed', _guard_mode := 'run_bound', _from := ARRAY['plate_queued'], …)` — Row Lock, Run/Generation-Fencing und Audit kommen vom Core.
- fehlende Provenienz → `missing_run_provenance`; falscher From-State → No-op mit `unexpected_state`; keine Output-, keine Legacy-Mutation bei Ablehnung.
- Legacy-Spiegel: setzt im selben Aufruf nach erfolgreichem Core-Write `clip_status = 'failed'` und `clip_error = _error_text` (identisches Muster wie `composer_fail_scene_with_mirrors`, aber ohne Lip-Sync-Felder und ohne Clear-Flag).

**G0-Sicherheitsvertrag für `composer_fail_hybrid_extend_scene` (verbindlich, identisch zu den übrigen neuen Facades):**
- `SECURITY DEFINER` mit `SET search_path = pg_catalog, public`.
- Alle Tabellen- und Funktionsreferenzen schema-qualifiziert (`public.composer_scenes`, `public.composer_scene_transition_core`, `public.composer_scene_transition_log`).
- Rechte: `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated;` und `GRANT EXECUTE … TO service_role;` — kein Client-Zugriff, Aufruf nur aus der Edge-Function.
- `caller_class` und `source_signature` sind **fest im Primitive** verdrahtet (`'v2'`/`'v2'`), nicht als Parameter exponiert und nicht überschreibbar.
- Die Signatur exponiert **keine** Parameter für Zielstate, Guard-Mode, From-States, Substate, Clear-Flags oder Legacy-Lip-Sync-Felder: `_to = 'failed'`, `_guard_mode = 'run_bound'`, `_from = ARRAY['plate_queued']` sind Konstanten im Funktionskörper. Die einzige textuelle Steuerung ist `_write_id`, und die läuft gegen die geschlossene Drei-Werte-Allowlist.
- Genau **eine** auflösbare Signatur (5 Argumente, keine Defaults, kein Overload) — Nachweis über `pg_proc` wie in S1.

Alle drei Hybrid-Failure-Writes nutzen dieses Primitive; `markSceneFailed()` entfällt ersatzlos.

## Zielvertrag G2.4 — autoritative Endfassung

Diese Liste ist der einzige gültige Implementierungsvertrag für G2.4. Frühere Formulierungen (Cleanup-Guard mit `active_run_id IS NULL`, „kein neues Primitive", Failure-Writes über `composer_fail_scene_with_mirrors`) sind ersatzlos gestrichen.

1. `hybrid-extend-scene:idle` = **insert-default**, kein State-Writer; raus aus dem State-Writer-Inventar.
2. `prepare_only`-Run-Akquise ist **fail-closed** vor jedem Frame-Extract- und Provider-Spend.
3. Cleanup bei Run-Akquise-Fehler **gemäß Befund 5**: auch der Partial-Run mit bereits gesetztem `active_run_id` wird gelöscht, solange die dort definierten Ownership-, State- und Output-Guards gelten. Ist die Zeile nicht sicher löschbar (Fremdmutation/Output vorhanden), kein Delete, sondern `hybrid_zombie_unresolved` mit Scene-ID im Log und im Fehler-Response.
4. Genau **ein** neues Primitive: `composer_fail_hybrid_extend_scene` (Signatur, Semantik und **G0-Sicherheitsvertrag** nach Befund 6 — SECURITY DEFINER, fixiertes `search_path`, schema-qualifiziert, EXECUTE nur `service_role`, fest verdrahtete `caller_class`/`source_signature`, keine über Parameter öffenbaren States/Guard-Modes/Write-IDs).
5. Alle drei Hybrid-Failure-WriteIDs (`hybrid:frame-extract-failed`, `hybrid:no-anchor`, `hybrid:dispatch-failed`) schreiben ausschließlich aus `plate_queued`, run- und generation-gebunden; `markSceneFailed()` entfällt ersatzlos.
6. `composer_fail_scene_with_mirrors` bleibt **unverändert frozen**; keine neue Signatur, kein Overload, `_clear_lip_sync_fields` bleibt auf `cvc:failed/pika` beschränkt.
7. Kein Runless, kein Grandfathering, kein `beginSceneRun()`-Sonderweg; `run_context` an `compose-video-clips` bleibt unverändert.
8. Smokes gemäß Verifikationsabschnitt unten, danach Frozen-Suite (identischer Command wie G2.3-Baseline, 527 Tests) + `tsgo` → **STOP**.



## Verifikation, die zu G2.4 gehört

- Unit/Fixture: Inventar-Fixture ohne `hybrid-extend-scene:idle`, Count-Assertion angepasst.
- Transaktionaler DB-Smoke pro writeId: `applied`, `stale run`, `falsche Generation`, `falsche write_id`, zusätzlich für `dispatch-failed` der Fall „Szene steht bereits auf `plate_rendering`/`failed`" → No-op — inkl. Nachweis, dass bei allen Ablehnungen weder Output- noch Legacy-Spiegel mutiert werden (Muster wie S3).
- Cleanup-Nachweis (beide Formen): (a) Fehler **vor** Run-Erwerb → Zeile weg; (b) Fehler **nach** `composer_start_scene_run`, also `active_run_id` bereits gesetzt und State `idle` → Zeile ebenfalls weg (`cleaned:true`); (c) Gegenprobe mit Zeile, die bereits `clip_url` trägt → kein Delete, `hybrid_zombie_unresolved` geloggt und im Response ausgewiesen.
- DB-Smoke für `composer_fail_hybrid_extend_scene`: `applied` aus `plate_queued`; No-op aus `plate_rendering` (`unexpected_state`); stale run/generation; nicht erlaubte write_id — jeweils mit Nachweis unveränderter Output- und Legacy-Felder.
- Security-Nachweis für das neue Primitive: `pg_proc`-Abfrage mit genau einer Signatur, `prosecdef = true`, `proconfig` enthält `search_path=pg_catalog, public`, sowie `has_function_privilege('anon'|'authenticated', …, 'EXECUTE') = false` und für `service_role` `= true`.
- Frozen-Suite mit demselben exakten Command wie die G2.3-Baseline (527 Tests) plus `tsgo`.
- Danach: G2 komplett DONE / FROZEN.

## Offene Punkte, die G2.4 bewusst nicht anfasst

- `compose-dialog-segments` Deferred-Refund (kein Transaction-Key, keine Idempotenz, Wallet read-modify-write) — bleibt eigener Credit-Gate-Track vor G3/G4.
- Äußerer Catch-all in `hybrid-extend-scene` ohne Fail-Write — Kandidat für G4.

## Reihenfolge danach

G2.4 → G3 (Webhooks/Fan-in) → G4 + Credit-Gate → G5 → T1 → G6 → CW1.

Freigabe hier bedeutet: Umsetzung von G2.4 nach genau diesem Vertrag, dann Bericht und STOP.
