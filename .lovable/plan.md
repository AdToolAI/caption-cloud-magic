# v431 G3.1f — Recovery/Re-Injection Provenance Fix

Enger Transport-Fix für genau die drei in G3.1e bestätigten Re-Injection-Pfade. Kein G3.2-Apply-Umbau, keine neue Provenienz-SoT, keine Änderung an Lip-Sync-Geometrie oder Providerlogik. G3.2.2 bleibt BLOCKED.

## Pfad-Analyse (verifiziert)

| Pfad | Externe Job-ID persistiert in | `pipeline_job_id` beim Dispatch verfügbar | Pointer-Slot | Leser |
| --- | --- | --- | --- | --- |
| Sync.so | `dialog_shots.passes[i].job_id` (`compose-dialog-segments`, gesetzt direkt vor `bindLedgerExternalJob`) | `v431SyncLedgerJob.id` (dieselbe Codestelle) | `dialog_shots.passes[i].pipeline_job_id` | `lipsync-watchdog` (liest heute schon `p.job_id` an beiden `pollAndForward`-Aufrufstellen) |
| Base Video (Replicate) | `composer_scenes.replicate_prediction_id` | `ledgerJobId` in `compose-video-clips` (Stelle mit `bindLedgerExternalJob`) | neue Spalte `composer_scenes.plate_pipeline_job_id` | `recover-stuck-composer-clip` (`replayWebhook`) |
| Base Video (ModelArk) | `composer_scenes.replicate_prediction_id` mit `modelark:`-Prefix | derselbe `ledgerJobId` | dieselbe Spalte `plate_pipeline_job_id` | `modelark-poll` (`notifyWebhook`) |

Beide Base-Video-Forwarder lesen bereits `replicate_prediction_id` von der Szene — sie bekommen deshalb **einen** gemeinsamen Pointer, keine zweite Metadatenquelle.

## Vertrag (verbindlich)

- `composer_pipeline_jobs` bleibt alleinige autoritative Quelle. Der gespeicherte Wert ist ausschließlich ein Transport-Pointer.
- **Der Pointer ist attempt-bound, nicht lebenslang immutable.** `external_job_id` und `pipeline_job_id` sind ein **Paar desselben Attempts**: sie werden nur gemeinsam gesetzt, nur gemeinsam zurückgesetzt und nie einzeln gewechselt.
- **Ledger-Bindung und Transport-Paar entstehen in einer DB-Transaktion.** Kein Zwischenzustand „External-ID gebunden, Pointer fehlt" (oder umgekehrt) — realisiert über ein schmales Bind-RPC statt zweier aufeinanderfolgender Client-Updates.
- Geschrieben wird das Paar ausschließlich beim Dispatch des Attempts. Kein Forwarder, kein Webhook, kein Reaper schreibt es.
- Recovery-/Poll-Forwarder erzeugen keine Ledger-Identität und keinen neuen Attempt; sie reichen den gelesenen Pointer unverändert in URL bzw. Body weiter.
- Der empfangende Webhook behält seine bestehende Ledger-/Run-/Generation-Prüfung unverändert. **Kein** Fallback auf `external_job_id + scene_id + stage`.
- Falscher/staler Pointer wird vom bestehenden Webhook-Guard abgewiesen (`wrong_job` / `stale_run` / `stale_generation`), nicht repariert.
- **Post-Cutover ohne Pointer wird nicht re-injiziert.** `reinject_missing_pipeline_job_id` auf Error-Level, und die Re-Injection selbst fällt aus: kein ungebundener Callback an einen Observe-/Apply-Handler, kein Ledger-Insert, kein Resolve-Fallback, kein erfundener Pointer. Der übrige Recovery-Pfad darf loggen und enden.

## Lücke 1 — Attempt-Wechsel und atomare Paarbindung

**Sync.so (belegt).** Der Pass-Slot wird ausschließlich über die RPC `update_dialog_pass_slot` geschrieben. Deren heutiger Stand:
- G2.1: `run_id` und `plate_generation` sind nach dem ersten Setzen unpatchbar.
- G2.2: `job_id` ist unveränderlich, sobald gesetzt — „einziger erlaubter Weg zurück ist der explizite Reset (`job_id: null`)".
- Terminal-Slots werden bei Rückschritt entschärft (`status`/`output_url`/`finished_at`/`error` aus dem Patch entfernt).

Der Vertrag, der einen Pass für einen neuen Attempt öffnet, ist damit die Kombination aus (a) dem Terminal-Transition-Guard `assertSafeDispatchEntry` in `compose-dialog-segments` — ein terminaler Pass darf nur mit `user_retry_flag=true` + frischem `new_attempt_id` erneut dispatchen — und (b) dem expliziten Reset-Patch, der `job_id: null` schreibt (Skeleton-/Reset-Pfade, z. B. Fan-out-Skeleton mit `job_id: null`, sowie `composer_reset_lipsync_full`). Erst danach ist der Slot wieder bindbar.

Umsetzung: `pipeline_job_id` bekommt in der Slot-Schreibschicht **exakt dieselbe** Regel wie `job_id` plus eine Paarklausel:
- gesetzt und nicht-null → nicht überschreibbar (Patch-Feld wird verworfen, wie bei `job_id`);
- ein Patch, der `job_id` non-null bindet, **muss** `pipeline_job_id` non-null mitliefern und umgekehrt — sonst `RAISE EXCEPTION` (kein stilles Halb-Binding);
- jeder Reset, der `job_id: null` schreibt, setzt `pipeline_job_id: null` mit (und umgekehrt). Alle bestehenden Reset-/Skeleton-Patches werden entsprechend ergänzt.

Kein unabhängiges Überschreiben eines immutable Slots: der neue Attempt bindet erst nach dem regulären Reset, und dann beide Werte gemeinsam in einem Patch.

**Atomarität (neu, verbindlich).** Die Bindung erfolgt nicht mehr als „Ledger binden + danach Scene patchen", sondern über **ein** SECURITY-DEFINER-RPC pro Klasse, das Ledger-Row und Transport-Ziel in derselben Transaktion schreibt:

- `composer_bind_plate_attempt(_pipeline_job_id, _external_job_id, _scene_id, _run_id, _plate_generation)` — bindet `composer_pipeline_jobs.external_job_id` **und** setzt `composer_scenes.replicate_prediction_id` + `plate_pipeline_job_id` (Row-Lock auf die Szene, Run-/Generation-Guard wie in G3.1). Ersetzt `bindLedgerExternalJob` + separates Scene-Update im Replicate- **und** ModelArk-Zweig; der ModelArk-Prefix (`modelark:`) wird als Parameterwert übergeben, nicht als zweite Codepfad-Variante.
- `composer_bind_sync_pass_attempt(_pipeline_job_id, _external_job_id, _scene_id, _pass_idx)` — bindet die Ledger-Row **und** patcht `passes[i].job_id` + `passes[i].pipeline_job_id` über dieselbe Slot-Logik (Immutabilitäts-, Paar- und Terminal-Regeln aus `update_dialog_pass_slot` werden geteilt, nicht dupliziert).

Beide RPCs sind idempotent bei identischem Paar (No-op) und schlagen fehl, wenn die Ledger-Row bereits an eine **andere** `external_job_id` gebunden ist oder Run/Generation nicht passen. Schlägt das RPC fehl, gilt der Dispatch als nicht gebunden und läuft in den bestehenden G3.1b-Dispatch-Settle-Pfad (`uncertain`/`failed`) — es entsteht kein halbgebundener Zustand. Ein Helper `setPlateAttemptBinding` als reines Client-Update entfällt damit; die Reset-Pfade setzen beide Spalten weiterhin gemeinsam auf `null`, ein Guard-Test verbietet Einzelschreiber von `replicate_prediction_id`.

### G0-Sicherheitsvertrag der beiden Bind-RPCs (verbindlich)

Gilt identisch für `composer_bind_plate_attempt` und `composer_bind_sync_pass_attempt` — derselbe Standard wie bei allen G0/G2/G3-Primitives:

- `SECURITY DEFINER`, `SET search_path = pg_catalog, public`, `LANGUAGE plpgsql`, `VOLATILE`.
- Alle Tabellen-, Typ- und Funktionsreferenzen schema-qualifiziert (`public.composer_pipeline_jobs`, `public.composer_scenes`, `pg_catalog.now()` usw.).
- `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated;` und `GRANT EXECUTE ON FUNCTION … TO service_role;` — kein Zugriff aus dem Client.
- **Keine Default-Parameter, keine Overloads** — genau eine Signatur je RPC.
- **Deterministische Lock-Reihenfolge:** zuerst `public.composer_pipeline_jobs … FOR UPDATE`, danach `public.composer_scenes … FOR UPDATE`. Keine andere Reihenfolge, kein zweites Lock-Muster.
- **Geschlossene Stage-Prüfung:** Plate-RPC akzeptiert ausschließlich `stage = 'base_video'`, Sync-RPC ausschließlich `stage = 'sync_segment'`; jede andere Stage → Exception, kein Fallthrough.
- **Autorität liegt bei der gelockten Ledger-Zeile:** `scene_id`, `run_id` und `plate_generation` werden aus der gelockten Job-Zeile gelesen und gegen die Szene geprüft. Caller-Parameter dürfen ausschließlich **bestätigen** (Mismatch → Exception); sie dürfen niemals bestimmen, welche Bindung geschrieben wird.
- Rückgabe ist ein schmaler Statuswert (`bound` / `noop`), keine Row-Dumps; keine dynamische SQL-Ausführung.

**Security-Smoke (Teil der Testmatrix):** je RPC prüfen — `prosecdef = true`; `proconfig` enthält `search_path=pg_catalog, public`; `has_function_privilege('anon', …, 'EXECUTE') = false` und dasselbe für `authenticated`; `has_function_privilege('service_role', …, 'EXECUTE') = true`; genau **eine** Zeile in `pg_proc` je Funktionsname (keine Overload); `pronargdefaults = 0`. Zusätzlich negative Fälle: falsche Stage, fremde `scene_id`, abweichender Run/Generation → Exception, keine Teilwirkung.

### Pass-Identitätsgate für `composer_bind_sync_pass_attempt`

`_pass_idx` darf nicht länger allein vom Caller bestimmt werden. Verbindlich:

- Der gelockte Ledger-Job muss `stage = 'sync_segment'` haben (geschlossene Prüfung, siehe oben).
- Der adressierte Pass wird über die **bereits vorhandene stabile Identität** aus der Ledger-Zeile aufgelöst: `composer_pipeline_jobs.segment_id` bzw. `speaker_id` werden gegen die Identitätsfelder des Pass-Slots (`passes[i].segment_id` / `speaker_id` / kanonische Speaker-UUID aus dem v201-Vertrag) geprüft. Genau ein Pass darf matchen.
- `_pass_idx` ist nur **bestätigend**: stimmt er nicht mit dem aufgelösten Index überein — oder ist die Auflösung mehrdeutig bzw. leer — wird eine Exception geworfen. Kein Slot-Write, keine Ledger-Bindung, vollständiger Rollback.
- Smoke: gültiger Job für Pass A gegen `_pass_idx = B` → Exception; danach ist weder `external_job_id` gebunden noch `passes[A]`/`passes[B]` verändert (vollständiger Rollback nachgewiesen).


## Lücke 2 — Cutover-Vertrag für Rows ohne Pointer

Bestandsaufnahme (heute, 16:34Z): `plate_rendering` = 0, davon mit `replicate_prediction_id` = 0, davon ModelArk = 0; Lip-Sync in-flight (`lipsync_dispatched|lipsync_running|lipsync_muxing`) = 0. Es existieren aktuell **keine recoveryfähigen Base-Video-Jobs ohne Pointer**.

Cutover-Gate (unmittelbar vor dem Deploy, **beide Klassen**):
1. **Base Video in flight ohne Pointer:** Szenen in `plate_rendering` mit `replicate_prediction_id IS NOT NULL` (inkl. `modelark:`) und `plate_pipeline_job_id IS NULL`.
2. **Sync-Passes in flight ohne Pointer:** Szenen mit einem Pass `status='rendering'|'pending'`-Nachfolge mit `job_id IS NOT NULL` und fehlendem `pipeline_job_id` (inkl. Zustände `lipsync_dispatched|lipsync_running|lipsync_muxing`).

Beide Zählungen 0 → Cutover per Nachweis, kein Backfill, kein Übergangsmodus.

- Base Video > 0 → **einmaliger** Backfill genau dieser Rows aus `composer_pipeline_jobs`, nur bei **eindeutigem** Match (`scene_id` + `stage='base_video'` + `external_job_id` + aktueller `run_id`/`plate_generation`, genau eine Zeile, nicht terminal). Einmalige Datenmigration, keine Laufzeitauflösung, im Bericht mit betroffenen IDs protokolliert.
- Sync > 0 → **bevorzugt Drain bis 0**, dann deployen; kein spontan erfundener Backfill-Vertrag. Nur falls ein Drain nicht abwartbar ist: derselbe eindeutige Einmal-Match, aber ausschließlich gegen einen bestehenden `stage='sync_segment'`-Ledger-Job (scene + Pass-Identität + `external_job_id` + Run/Generation, genau eine nicht-terminale Zeile).

**Endgate (verbindlich):** Nach jedem Backfill bzw. Drain werden **beide** Cutover-Abfragen erneut ausgeführt. Deploy-fähig ist ausschließlich der Zustand **Base unresolved = 0 und Sync unresolved = 0**. Mehrdeutige oder nicht matchbare aktive Rows bedeuten: warten, bis der bestehende Job sauber ausläuft oder über den regulären Reaper-/Fail-Pfad terminiert wird — **kein Deploy über eine unresolved aktive Row hinweg**, weil post-Cutover ein fehlender Pointer bewusst nicht mehr re-injiziert wird.

Nach dem Cutover ist ein Dispatch ohne persistiertes Paar ein Vertragsfehler: Error-Log `reinject_missing_pipeline_job_id` (Felder `function`, `scene_id`, `stage`, `external_job_id`, `run_id`, `generation`) **und die Re-Injection unterbleibt** — der Forwarder sendet keinen ungebundenen Callback. Kein Ledger-Insert, kein Resolve-Fallback, keine erfundene ID; der übrige Recovery-Pfad (Refund-/Fail-/Reaper-Logik) bleibt unverändert.

Eine dauerhafte Pre-Cutover-Auflösung im Forwarder wird **nicht** eingeführt.

## Umsetzung

1. **Migration:** Spalte `composer_scenes.plate_pipeline_job_id uuid null`; Slot-Schreibschicht (`update_dialog_pass_slot`) um Immutabilitäts- und Paarklausel für `pipeline_job_id` erweitern; neue Bind-RPCs `composer_bind_plate_attempt` und `composer_bind_sync_pass_attempt` (siehe Lücke 1); Einmal-Backfill nur, falls das Cutover-Gate > 0 liefert.
2. **`compose-video-clips`:** alle Bindungsstellen (Replicate- und ModelArk-Zweig) von `bindLedgerExternalJob` + Scene-Update auf `composer_bind_plate_attempt` umstellen; Reset-Stellen setzen beide Spalten gemeinsam auf `null`.
3. **`recover-stuck-composer-clip`:** Szene-Select um `plate_pipeline_job_id` erweitern, `replayWebhook` hängt `&pipeline_job_id=…` an die bestehende URL; ohne Pointer wird **nicht** gesendet (Error-Telemetrie, Abbruch der Re-Injection).
4. **`modelark-poll`:** Szene-Select um `plate_pipeline_job_id` erweitern, `notifyWebhook` hängt `&pipeline_job_id=…` an die bestehende URL (neben `run_id`/`generation`); ohne Pointer wird **nicht** gesendet (Error-Telemetrie, Abbruch der Re-Injection).
5. **`compose-dialog-segments`:** Bindung des Passes über `composer_bind_sync_pass_attempt` (ein Aufruf statt Slot-Patch + `bindLedgerExternalJob`); alle Reset-/Skeleton-Patches ergänzen `pipeline_job_id: null`. `run_id`, `plate_generation` und die Provider-`job_id` bleiben unverändert geschützt.

6. **`lipsync-watchdog`:** an beiden `pollAndForward`-Aufrufstellen (reguläre `rendering`-Passes und der 201-Probe-Zweig) `pipelineJobId: p.pipeline_job_id` mitgeben; `pollAndForward` hängt es an die `sync-so-webhook`-URL. Auswahl-, Poll- und Recovery-Logik bleiben unverändert.

## Tests

- Neue Unit-/Fixture-Tests: Watchdog-Forward-URL enthält denselben Pointer wie der reguläre Dispatch; `recover`-Replay und `modelark-poll`-Forward tragen die Plate-Pointer-ID; fehlender Pointer → genau ein `reinject_missing_pipeline_job_id`-Error-Event und **kein** ausgehender Callback (Fetch-Spy: 0 Requests).
- Guard-Test: manipulierter/staler Pointer wird vom bestehenden Webhook-Guard abgewiesen; kein Fallback-Resolve.
- Paar-/Atomaritätstests (SQL, transaktional): `job_id` non-null ohne `pipeline_job_id` → Exception; zweites Binding ohne Reset → beide Felder verworfen; Reset setzt beide auf `null`; danach bindet der neue Attempt beide gemeinsam. Bind-RPCs: identisches Paar = No-op, fremde `external_job_id` bzw. falscher Run/Generation = Fehler, Rollback lässt weder Ledger-Bindung noch Pointer halb gesetzt zurück. Base Video: kein Pfad schreibt `replicate_prediction_id` ohne `plate_pipeline_job_id`.
- Invarianz: keine neue Ledger-Zeile und kein neuer Attempt durch Re-Injection; Retry-/Acquire-Verträge aus G3.1 sowie G2.1/G2.2-Immutabilität unverändert (bestehende Suites).
- Frozen-Suite, `tsgo`, `deno check` für die vier berührten Functions.
- `composer_callback_observations` nach den gezielten Re-Injection-Tests: `missing_binding = 0`.

## Abschluss

Bericht `docs/v431-g3-1f-report.md` (Pfadtabelle, Vertragsnachweis, Testmatrix, Telemetrie-Auszug), danach **STOP**. Kein Deploy, kein G3.2.2 — der gezielte Watchdog-Forward-Resmoke wird separat freigegeben.
