# v431 G3.1 — Deploy & Drain-Fenster

## Deploy

- **T0 (Drain-Startmarke, UTC): `2026-08-15T09:05:17Z`**
- Deployte Functions (ein Zug, alle erfolgreich):
  `compose-video-clips`, `compose-clip-webhook`, `compose-dialog-segments`,
  `sync-so-webhook`, `render-sync-segments-audio-mux`, `remotion-webhook`,
  `lipsync-watchdog`
- Keine Migration in diesem Schritt. Alle DB-Objekte (Acquire-/Replace-RPC,
  Predecessor-Guard, Retry-Allowlist, Reaper, REVOKE) waren bereits migriert.

## Post-Deploy-Rauchprüfung

| Function | Boot/Import | Beleg |
| --- | --- | --- |
| lipsync-watchdog | OK | `booted (time: 38ms)` @ 09:06:02Z, Cron-Lauf `scanned=0 polled=0 advanced=0 failed=0` |
| compose-video-clips | kein Boot-Fehler | keine Logeinträge seit T0 (noch nicht invoziert) |
| compose-clip-webhook | kein Boot-Fehler | keine Logeinträge seit T0 |
| compose-dialog-segments | kein Boot-Fehler | keine Logeinträge seit T0 |
| sync-so-webhook | kein Boot-Fehler | keine Logeinträge seit T0 |
| render-sync-segments-audio-mux | kein Boot-Fehler | keine Logeinträge seit T0 |
| remotion-webhook | kein Boot-Fehler | keine Logeinträge seit T0 |

Der einzige Function-Kaltstart nach T0 (Watchdog, Cron-getrieben) ist sauber
gebootet — die geänderte `_shared/v431-ledger.ts` lädt live ohne Importfehler.
Für die übrigen sechs steht der Boot-Beleg erst mit dem ersten Post-Deploy-Lauf
im Drain aus.

## Drain-Status

Stand T0 + 0: `composer_pipeline_jobs` enthält **0 Zeilen mit `created_at >= T0`**.
Das Fenster ist eröffnet, aber noch ohne Verkehr — es braucht mindestens einen
echten Produktionslauf (Basisvideo → Sync-Segmente → Audio-Mux → Remotion), bevor
die Gates aussagekräftig sind.

## Auswertung je Callback-Kanal (auszufüllen am Fensterende)

| Kanal | Function | Post-Deploy-Attempts | missing_binding | job_not_found | wrong_job | binding_pending | stale_run | stale_generation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Replicate / Base-Video | `compose-clip-webhook` | 0 (nicht beobachtet) | – | – | – | – | – | – |
| Sync.so-Segment | `sync-so-webhook` | 0 (nicht beobachtet) | – | – | – | – | – | – |
| Audio-Mux | `render-sync-segments-audio-mux` | 0 (nicht beobachtet) | – | – | – | – | – | – |
| Remotion | `remotion-webhook` | 0 (nicht beobachtet) | – | – | – | – | – | – |

Kanäle mit 0 Post-Deploy-Attempts gelten ausdrücklich als **nicht beobachtet**,
nicht als grün.

Ergänzend am Fensterende auszuweisen:

- Attempt-Verteilung: Attempt 1 (Initial-Akquise) vs. Replace-Attempts (`attempt_no > 1`).
- Jedes Vorkommnis von `predecessor_exists`, `retry_superseded`,
  `failure_not_retryable` mit Begründung.
- `stale_run` / `stale_generation` je Vorkommnis auf einen legitimen Run-Wechsel
  zurückgeführt.

## Gates

Hart (jeweils 0 für Post-Deploy-Jobs): `missing_binding`, `job_not_found`, `wrong_job`.
Messwert ohne Blockade: `binding_pending`.
Diagnostisch: `stale_run`, `stale_generation`.

## Auswertungsabfragen

```sql
-- Attempt-Verteilung je Stage
select stage, attempt_no, status, count(*)
from composer_pipeline_jobs
where created_at >= '2026-08-15T09:05:17Z'
group by 1,2,3 order by 1,2,3;

-- Terminale/abgelöste Attempts
select stage, status, error_code, count(*)
from composer_pipeline_jobs
where created_at >= '2026-08-15T09:05:17Z'
  and status in ('failed','stale','dispatch_uncertain')
group by 1,2,3 order by 1,2,3;
```

Observe-Verdikte (`missing_binding`, `job_not_found`, `wrong_job`,
`binding_pending`, `stale_run`, `stale_generation`) werden aus den
Function-Logs der vier Callback-Kanäle gezogen (`v431_observe`-Zeilen).

## Abbruchkriterien

- Ein `missing_binding`, `job_not_found` oder `wrong_job` auf einem
  Post-Deploy-Job → Drain sofort stoppen, Ursache melden.
- Boot-/Importfehler in einer der sieben Functions → sofortiger Stopp.

## Status

G3.1 deployt, Drain-Fenster läuft. G3.2 bleibt gesperrt. STOP.

## Produktionslauf #1 (Post-T0)

- Auslösung: UI (Motion Studio → Storyboard → „Neu rendern“ → Bestätigung 546 Cr), keine Code-/Schema-/Config-Änderung.
- Projekt `04b80fab-090d-4108-a734-63e651c1b41c`, Szene `b34d1eae-6bf3-437d-a6ab-624be0155adc`.
- Run: `62949b1b-6d2f-4e25-9757-bcfc87cf8a17`, `plate_generation = 3`.
- Ledger-Attempt: `b02ae224-7f6f-40a1-8b32-c6e1313f7e12`, stage `base_video`, attempt_no 1, plate_generation 3 (beim INSERT gesetzt) — INSERT-Pflicht erfüllt.
- Zeitachse: Ledger-INSERT 09:23:06Z, Szene `plate_rendering/anchor` 09:23:57Z; Stand 09:31:50Z weiterhin Anchor-Vorlauf.
- Kanaltabelle noch offen: Attempt steht auf `dispatching` ohne gebundene external ID (erwartetes `binding_pending`-Fenster, solange der Anchor-Vorlauf läuft). Webhook-/Fan-in-Kanäle (Replicate, Sync.so, Remotion-Mux) haben Post-T0 noch keinen Callback erzeugt.
- Kein Observe-Verdikt bisher, keine State-Eingriffe durch die Observe-Pfade.

### Abschlussverdikt Lauf #1: **INCONCLUSIVE / NOT OBSERVED**

- Szene terminal `failed` um 09:34:03.536Z, `clip_error = watchdog_no_prediction_id (refunded €5.46)`,
  `pipeline_substate = anchor`, `pipeline_state_run_id` = korrekter Run.
- Alle vier Callback-Kanäle bleiben `not_observed` (0 Post-T0-Dispatches, 0 Callbacks).
  Die drei harten Gates sind formal 0, aber mangels Verkehr **ohne Abnahmewert**.
- Kein Abnahmehaken für G3.1. Status bleibt `G3.1 DEPLOYED / DRAINING`, `G3.2 LOCKED`.

## G3.1c — Ursachenanalyse (rein lesend, 2026-08-15 ~10:20Z)

### A — `watchdog_no_prediction_id` → **not yet proven** (starke, konsistente Hypothese)

Rekonstruierte Zeitachse (aus persistiertem State, da Logs des Fensters rotiert sind):

```text
09:23:06.362Z  beginSceneRun + acquireLedgerJob  -> Ledger b02ae224 (dispatching, external NULL)
09:23:0x  Response 200 an UI, Restarbeit läuft in EdgeRuntime.waitUntil(processScenes())
09:23:57.778Z  Anchor fertig + Audit ok (4/4 Gesichter, audit v15),
               min_face_check ok:false (0.106 < 0.120) -> retried:true (tight_grid),
               reference_image_url auf /scene-anchors/…-e50942c2f47c.png gesetzt
   ...        KEIN weiterer State-Write dieser Function
09:34:03.536Z  qa-watchdog (Cron */2, Regel 4b „>10 min generating, kein Webhook")
               -> recover-stuck-composer-clip -> predictionId leer
               -> refundScene() + markFailed('watchdog_no_prediction_id')
```

- Ausfallpunkt: **nach** Anchor-Persistenz, **vor** dem HappyHorse-Dispatch.
  Provider war `ai-happyhorse`; der Dispatch samt `replicate_prediction_id`-Write und
  `bindLedgerExternalJob()` sitzt in `supabase/functions/compose-video-clips/index.ts`
  ab Zeile ~5078 (`else if (scene.clipSource === "ai-happyhorse")`, Prediction-Write 5188,
  Ledger-Bindung 5233). Ledger-Akquise dagegen bereits Zeile 542.
- Wahrscheinlichste Ursache: **Wall-Clock-Abbruch der Function**. Die schwere Arbeit läuft
  als Hintergrundtask (`EdgeRuntime.waitUntil`, Zeile 5363) und teilt sich das Budget
  `timeout_sec = 180` (`supabase/config.toml`, `[functions.compose-video-clips]`).
  Anchor-Compose (`compose-scene-anchor`, eigenes Budget 120 s) plus der durch
  `min_face_ratio` ausgelöste `tight_grid`-Retry verbrauchen den Großteil davon; die
  Kette danach (universelles Cast-Anchor-Netz, Dialogaufbereitung, Provider-Call)
  erreicht das Fenster nicht mehr.
- Warum kein Fehler geschrieben wurde: Ein Kill des Hintergrundtasks löst weder den
  `catch`-Block noch `safeMarkSceneFailed()` aus. Es gibt an dieser Stelle **keine**
  Guard-/Failure-Semantik — die einzige Sicherung ist der externe qa-watchdog nach 10 min,
  und der kennt den Ledger nicht.
- Beweislücke: Die Function-Logs von 09:23–09:34 sind rotiert (siehe C). Ein sauberer
  Beleg („shutdown/wall clock exceeded" bzw. letzte erreichte Log-Zeile vor dem Dispatch)
  ist erst mit Punkt C möglich. Deshalb **not yet proven**, nicht „confirmed".
- Minimal nötige Korrektur (nicht ausgeführt): Beweisführung über retentionssichere Logs
  bei Lauf #2; erst danach über Budget/Fensterschnitt entscheiden.
- Voraussetzung für Lauf #2: **nein** für die Reparatur, **ja** für C — sonst wiederholt
  sich exakt dieselbe Beweislücke.

### B — Reaper → **root cause / confirmed**

- `public.composer_reap_orphaned_dispatches(p_older_than_minutes integer DEFAULT 10)`
  existiert in Produktion, `SECURITY DEFINER`, `REVOKE ALL … FROM PUBLIC, anon, authenticated`,
  `GRANT EXECUTE … TO service_role`.
- **Es gibt keinen Aufrufer.** Weder ein `cron.job` (Volltextsuche über alle 312 Zeilen der
  Cron-Tabelle: kein Treffer auf `reap`) noch eine Edge-Function ruft die Funktion auf.
  Codeweite Suche findet sie ausschließlich in den drei Migrationen und in
  `src/integrations/supabase/types.ts`. Der Reaper wurde angelegt und berechtigt,
  aber nie geplant.
- Das Eligibility-Prädikat trifft die Zielzeile eindeutig. Read-only-Gegenprobe mit exakt
  dem Funktionsprädikat liefert genau eine Zeile:
  `b02ae224…`, `status = dispatching`, `external_job_id = NULL`,
  `started_at = 09:23:06.362Z`, Alter 00:54:09. Die Zeile wird also **nicht** durch
  Status/Timestamps ausgeschlossen — sie wurde schlicht nie geprüft.
- Keine fehlgeschlagene Mutation: `error_code` ist NULL, `updated_at` ist unverändert
  identisch mit `created_at`. Die Zeile wurde seit dem INSERT nie angefasst.
- Vertragstreue der Funktion selbst ist korrekt: `pending|dispatching` +
  `external_job_id IS NULL` + Altersfenster → `dispatch_uncertain` mit
  `error_code = 'reaper_orphaned_dispatch'`; kein `stale`, nichts Terminales.
- Code-/Schema-Stellen: `supabase/migrations/20260815003034_*.sql` (Definition),
  `20260815085014_*.sql` / `20260815085206_*.sql` (Grants/REVOKE), `cron.job` (Lücke).
- Minimal nötige Korrektur: genau ein Scheduler-Eintrag, der den Reaper periodisch
  (Vorschlag: minütlich oder alle 2 min, Fenster 10 min) als `service_role` ausführt.
  Keine Änderung an Funktionskörper, Prädikat oder Observe-Vertrag.
- Voraussetzung für Lauf #2: **ja**. Ohne Scheduler ist der Dispatch-Lifecycle in G3.1
  nicht beobachtbar abgeschlossen.

### C — Drain-Telemetrie → **root cause / confirmed**

Gemessene reale Retention (Messung 2026-08-15 ~10:18Z):

| Quelle | ältester Eintrag | jüngster Eintrag | Spanne | Zeilen im Fenster |
| --- | --- | --- | --- | --- |
| `function_edge_logs` | 10:09:00.79Z | 10:18:01.61Z | **9,0 min** | 49 |
| `function_logs` | 10:09:00.54Z | 10:18:48.23Z | **9,8 min** | 387 |

Folge: Ein 60-Minuten-Gate ist über diese Quellen **prinzipiell nicht rückwirkend
beweisbar**. Rund 50 der 60 Minuten sind zum Auswertungszeitpunkt bereits verloren.

Optionen (keine Vorentscheidung; G3.1-Observe ist bewusst read-only, ein INSERT im
Observe-Pfad wäre eine Vertragsänderung):

| Option | Eingriff in den Callback-Pfad | Beweisbarkeit 60-Min-Gate | Risiko |
| --- | --- | --- | --- |
| **C1** Append-only Observe-Telemetrie in eigener Tabelle, strikt fail-open, eigener Telemetry-Vertrag getrennt vom Ledger-Vertrag | ja — zusätzlicher Write im Callback; muss `try/catch`-gekapselt und ohne Rückwirkung auf das Verdikt sein | vollständig, lückenlos, direkt abfragbar | Vertragsänderung an G3.1; ein nicht fail-offener Write könnte Callbacks beeinflussen |
| **C2** Vorhandener langlebiger Log-Sink | keiner | abhängig vom Sink | im Projekt ist aktuell **kein** langlebiger Sink verdrahtet — Option existiert derzeit nur theoretisch (externer Drain/Log-Forwarder wäre erst einzurichten) |
| **C3** Periodisches Snapshotten der Function-Logs in Intervallen < Retention (z. B. alle 5 min in eine Snapshot-Tabelle) | keiner | vollständig, solange der Snapshotter läuft; jede Snapshotter-Störung erzeugt ein unbeweisbares Loch | Beweiskette hängt an einem zweiten Cron; keine Rückwirkung auf Callback-Verhalten |

- Code-/Schema-Stellen: `supabase/functions/_shared/v431-ledger.ts` (Observe-Verdikte,
  heute reines `console.log` mit Tag `[v431] g31_observe`), plus je nach Option eine neue
  Telemetrie-/Snapshot-Tabelle und ein Cron-Eintrag.
- Voraussetzung für Lauf #2: **ja** — ohne eine der Optionen bleibt jeder weitere Lauf
  aus denselben Gründen `not observed`.

### Gate vor Produktionslauf #2

1. Reaper ist geplant und nachweislich aktiv (B, confirmed → Korrektur offen).
2. `watchdog_no_prediction_id`-Pfad bewiesen, nicht nur plausibel (A, offen).
3. Entscheidung für C1, C2 oder C3 getroffen und wirksam.

STOP. Keine Reparatur, kein neuer Lauf.

---

# v431 G3.1d — Drain-Hardening (Reaper + persistente Observe-Telemetrie)

## Rollout-T0

- **T0 (neu, Drain-Startmarke) = `2026-08-15T10:47:35Z`**
  = max(Migrationsabschluss, letzter der sieben Function-Deploys). Erst ab
  diesem Zeitpunkt ist das komplette G3.1d-Rollout (DB-Objekte **und** alle
  Function-Instanzen) aktiv. Der alte T0 (`09:05:17Z`) ist damit historisch.
- Redeployte Functions (ein Zug, alle erfolgreich): `compose-video-clips`,
  `compose-clip-webhook`, `compose-dialog-segments`, `sync-so-webhook`,
  `render-sync-segments-audio-mux`, `remotion-webhook`, `lipsync-watchdog`.

## B — Reaper-Scheduler (Lücke geschlossen)

- pg_cron-Job `composer-reap-orphaned-dispatches` läuft im Minutentakt; Reaper
  und Heartbeat entstehen im **selben** SQL-Block: schlägt der Reaper fehl,
  entsteht kein falscher grüner `reaped_count`.
- **Smoke B (positiv):** künstlicher `dispatching`-Attempt ohne
  `external_job_id` wurde nach Überschreiten des 10-Minuten-Thresholds vom
  Cron-Lauf auf `dispatch_uncertain` gesetzt; Heartbeat
  `{"ok": true, "reaped_count": 1, "threshold_minutes": 10}`. Testzeile danach
  entfernt.
- **Laufender Beleg:** `cron_heartbeats` @ `2026-08-15T10:48:00Z` →
  `ok`, `reaped_count: 0` (keine Waisen offen).
- Der Reaper terminalisiert weiterhin nicht: `dispatch_uncertain` bleibt ein
  recoverable Zustand, kein `failed`.

## C — Persistente Observe-Telemetrie (C1, isoliert)

- Neue append-only Tabelle `composer_callback_observations`, strikt isoliert:
  `REVOKE ALL` inkl. `service_role` (verifiziert: `ins/upd/del/sel = f`),
  einziger Schreibpfad ist das `SECURITY DEFINER`-RPC
  `composer_record_callback_observation` (`rpc_sr = t`).
- **Smoke C:** RPC-Insert erfolgreich; direkte `UPDATE`/`DELETE`-Versuche
  werden DB-seitig vom Append-only-Trigger abgewiesen (`42501`).
- Verdrahtung in `supabase/functions/_shared/v431-ledger.ts`
  (`recordObservationBestEffort`): genau ein Insert-Versuch pro Observe, kein
  Retry, `try/catch` ohne Rethrow.

## Präzisierter Observe-Vertrag (ab G3.1d verbindlich)

> Observe ist read-only gegenüber allen Produktions- und Orchestrierungsdaten.
> Erlaubt ist ausschließlich ein append-only Telemetrie-Insert in
> `composer_callback_observations`, dessen Fehler ignoriert wird. Telemetrie ist
> **kein** Callback-Gate: ein RPC-Fehler ändert weder Verdikt noch HTTP-Status
> noch State-/Ledger-Pfad.

## Verifikation

| Prüfung | Ergebnis |
| --- | --- |
| Smoke B (Reaper + Heartbeat) | grün (`reaped_count: 1`, danach `0`) |
| Smoke C (RPC-Insert / Append-only-Trigger) | grün (`42501` bei UPDATE/DELETE) |
| Grants `composer_callback_observations` | `service_role`: ins/upd/del/sel = `f`, RPC = `t` |
| Neue Vertragstests `v431ObserveTelemetryFailOpen.test.ts` | 4/4 grün (genau 1 RPC, RPC-Error und Exception ändern Verdikt nicht) |
| Frozen-Suite `vitest run src/lib/composer src/lib/video-composer` | **540/540 grün** = 536-Baseline + 4 neue Tests (zwei FS-Scanner-Tests sind unter Default-Timeout flaky, mit `--testTimeout=60000` reproduzierbar grün) |
| `tsgo --noEmit` | grün |
| `deno check` | `_shared/v431-ledger.ts` und `render-sync-segments-audio-mux` grün; die übrigen Functions brechen lokal am vorbestehenden `npm:replicate@0.25.2`-Resolver ab (Umgebungslimit, kein Codebefund) — Deploy-Build serverseitig erfolgreich |
| Supabase-Linter | keine neuen Findings zur G3.1d-Migration |

## Status

- **G3.1d: DONE.** Lücken B und C sind geschlossen und belegt.
- **A (`watchdog_no_prediction_id`) bleibt offen** als separat dokumentierte
  Pipeline-Restschuld; nicht Teil von G3.1d.
- **Drain-Fenster läuft ab dem neuen T0.** Frühestes Ende des 60-Minuten-Gates:
  `2026-08-15T11:47:35Z`.
- **G3.2 bleibt gesperrt.**

STOP — Freigabe für Produktionslauf #2 abwarten.

## Produktionslauf #2 (Post-T0, G3.1d)

- T0 (G3.1d-Rollout) = 2026-08-15T10:47:35Z
- Projekt `04b80fab-090d-4108-a734-63e651c1b41c`, Szene `b34d1eae-6bf3-437d-a6ab-624be0155adc`
- Vereinfachter Fall: Skript auf **einen Sprecher** reduziert ("Samuel Dusatko: Ein Studio fuer alles."), 13 s, HappyHorse, kein `tight_grid`-Retry
- Start via UI (Storyboard → "Neu rendern" → "Rendern für 546 Cr") um **11:11:12Z**
- Run-Identität: `run_id = 1ecc3f53-7b19-4f03-a084-f69f531de64b`, `plate_generation = 4`
- Endzustand **11:17:03Z**: `pipeline_state = complete`, `clip_status = ready`, Clip vorhanden, kein `clip_error`

### Ledger-Attempts (alle Post-T0, alle attempt_no = 1, plate_generation = 4, alle gebunden)

| Stage | Job-ID | external_job_id | Status |
|---|---|---|---|
| base_video | 7c9abe7b… | 6exy628c7srmy0d00mfvnv7h0g | dispatched |
| sync_segment | fa7f731a… | 83b6b532-cbf5-45f0-81f3-56734fe9c7d9 | dispatched |
| audio_mux | 4fba9eef… | 96737a67-1f67-44af-9fb4-27667c12b78b | dispatched |

### Persistente Observe-Telemetrie (`composer_callback_observations`, Post-T0)

| Kanal | Handler | Post-T0 Events | Verdikt | missing_binding | job_not_found | wrong_job | binding_pending | stale_run | stale_generation |
|---|---|---|---|---|---|---|---|---|---|
| Replicate / Base-Video | compose-clip-webhook | 1 | bound | 0 | 0 | 0 | 0 | 0 | 0 |
| Sync.so-Segment | sync-so-webhook | 1 | bound | 0 | 0 | 0 | 0 | 0 | 0 |
| Audio-Mux / Remotion | remotion-webhook | 1 | bound | 0 | 0 | 0 | 0 | 0 | 0 |

Letztes geprüftes Event: 2026-08-15T11:17:03.444Z.

### Nebenbefunde

- **B (Reaper) bestätigt wirksam:** Der Waisen-Attempt aus Lauf #1 (`b02ae224…`, `dispatching` ohne `external_job_id`) steht jetzt auf `dispatch_uncertain`. Heartbeat `composer-reap-orphaned-dispatches` läuft minütlich, `last_status = ok`, `threshold_minutes = 10`.
- **A (`watchdog_no_prediction_id`)** ist in Lauf #2 nicht aufgetreten; bleibt dokumentierte Restschuld.

### Status

```text
G3.1 DEPLOYED / DRAINING — Lauf #2 PASS (alle drei Null-Gates erfüllt)
Drain-Fenster läuft bis 2026-08-15T11:47:35Z
G3.2 LOCKED
```

---

## Vollfenster-Auswertung (T0 → Auswertungsende)

```text
T0                 = 2026-08-15T10:47:35Z
60-Min-Gate Ende   = 2026-08-15T11:47:35Z (abgelaufen)
Ausgewertet bis    = 2026-08-15T12:57:00Z
Quelle (maßgeblich)= composer_callback_observations (persistent, append-only)
```

### 1. Gates je Kanal (alle Post-T0-Events)

| Kanal | Handler | Stage | Events | bound | missing_binding | job_not_found | wrong_job | binding_pending | stale_run | stale_generation | sonstige |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Replicate / Base-Video | compose-clip-webhook | base_video | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Sync.so-Segment | sync-so-webhook | sync_segment | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Audio-Mux | (Dispatch `render-sync-segments-audio-mux`) | audio_mux | — | — | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Remotion | remotion-webhook | audio_mux | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| **Gesamt** | | | **3** | **3** | **0** | **0** | **0** | **0** | **0** | **0** | **0** |

Harte Gates über das gesamte Fenster: `missing_binding = 0`, `job_not_found = 0`,
`wrong_job = 0`. `binding_pending = 0`. Keine `stale_run`/`stale_generation`,
keine `observe_error`- oder sonstigen Verdikte.

Präzisierung zur Kanalzählung: Audio-Mux und Remotion sind in dieser Kette **ein
physischer Rückkanal** — der Mux wird per Remotion gerendert, der zugehörige
Ledger-Job (`stage = audio_mux`) wird beim Dispatch in
`render-sync-segments-audio-mux` erzeugt und sein Callback trifft in
`remotion-webhook` ein. Das eine Event `remotion-webhook / audio_mux / bound`
belegt damit beide Kanäle; es ist kein zweites, unabhängiges Ereignis.
`render-sync-segments-audio-mux` ist Dispatcher und schreibt selbst keine
Observation.

### 2. Ledger-Gegenprobe (`composer_pipeline_jobs`, Post-T0)

| Stage | Job-ID | attempt_no | plate_generation | external_job_id gebunden | Status | replaced_by |
|---|---|---|---|---|---|---|
| base_video | 7c9abe7b-6634-4927-821c-67738d940222 | 1 | 4 | ja | dispatched | — |
| sync_segment | fa7f731a-5212-46b4-a131-92a4c9842b2f | 1 | 4 | ja | dispatched | — |
| audio_mux | 4fba9eef-0d41-48d3-b899-66e67b949353 | 1 | 4 | ja | dispatched | — |

- Alle drei Zeilen: `run_id = 1ecc3f53-7b19-4f03-a084-f69f531de64b`,
  `scene_id = b34d1eae-6bf3-437d-a6ab-624be0155adc`, `plate_generation` gesetzt.
- Je Dispatch genau ein Ledger-Job; jede Observation trifft per
  `pipeline_job_id` exakt diesen Job (1:1-Zuordnung, Identitätsfelder
  deckungsgleich).
- Attempt-Verteilung: **3× Attempt 1, 0 Replace-Attempts**. Kein Initial-Acquire
  mit `attempt_no > 1`, keine `predecessor_exists`/`retry_superseded`/
  `failure_not_retryable`-Verdikte, keine parallel aktiven Attempts derselben
  Identität.

### 3. Reaper-Lückenfreiheit (`cron.job_run_details`)

| Kennzahl | Wert |
|---|---|
| Job | `composer-reap-orphaned-dispatches` |
| Läufe im Fenster (ab T0) | 129 |
| Erster / letzter Lauf | 10:48:00.22Z / 12:56:00.24Z |
| Nicht-`succeeded`-Läufe | 0 |
| Größter Abstand zwischen zwei Läufen | 60,63 s (Minutentakt eingehalten) |
| Heartbeat aktuell | `last_status = ok`, `last_run_at = 12:57:00.27Z`, `consecutive_failures = 0`, `last_details = {ok: true, reaped_count: 0, threshold_minutes: 10}` |

Ergebnis: **lückenlos** über das gesamte Post-T0-Fenster.

### 4. Restschuld

- **A — `watchdog_no_prediction_id`** bleibt offene, dokumentierte
  Pipeline-Restschuld. In Lauf #2 nicht aufgetreten, nicht Teil von G3.1.

### 5. Abschlussverdikt

Letztes geprüftes Observation-Event: **2026-08-15T11:17:03.444Z**
(Auswertungsstand 12:57Z).

```text
G3.1 DONE / FROZEN
  - missing_binding = 0, job_not_found = 0, wrong_job = 0 (gesamtes Post-T0-Fenster)
  - binding_pending = 0
  - Reaper minütlich, 129/129 succeeded, max. Abstand 60,6 s
  - Callback-Kanäle beobachtet & bound: Base-Video, Sync.so-Segment,
    Audio-Mux/Remotion (ein gemeinsames Ereignis, siehe Präzisierung oben)
G3.2 LOCKED — Freigabe nur auf separaten Auftrag
```
