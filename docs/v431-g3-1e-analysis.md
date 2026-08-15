# v431 — G3.1e: Analyse `missing_binding` / interne Callback-Wiedereinspeisungen

Status: **ANALYSIS DONE — kein Code geändert.** Empfehlung: G3.1f (Fix) vor G3.2.2.
Erstellt: 2026-08-15. Beweisquellen: `composer_callback_observations` (append-only),
`composer_pipeline_jobs`, Edge-Function-Logs `lipsync-watchdog`, Quellstand `supabase/functions/`.

---

## 1. Auslösender Befund

Resmoke-Fenster 2026-08-15, Szene `b34d1eae…`, Run `73efdcab…`, `plate_generation = 5`,
Stage `sync_segment`, `external_job_id = 56267d8e-2408-42d9-a03a-d2249bbfc405`:

| Zeit (UTC) | Quelle | `pipeline_job_id` | Verdikt |
| --- | --- | --- | --- |
| 16:14:01.418 | echter Sync.so-Provider-Webhook | `7b234ad8…` | `bound` |
| 16:14:03.006 | interner Forward aus `lipsync-watchdog` | fehlt | `missing_binding` |

Log-Beleg 16:14:07Z: `[lipsync-watchdog] polled job=56267d8e… status=COMPLETED → forwarded to
webhook scene=b34d1eae…`.

Ursache im Code: `lipsync-watchdog/index.ts:192` baut
`…/functions/v1/sync-so-webhook?scene_id=…&token=…` — ohne `pipeline_job_id`.
Der reguläre Dispatcher `compose-dialog-segments/index.ts:6010` hängt dagegen
`&pipeline_job_id=<ledger job>` an. `observeCallbackProvenance` hat keine Ersatzauflösung
(Basisverdikt bei fehlender ID ist `missing_binding`) — korrekt so, das ist der D2-Vertrag.

Einordnung: **derselbe aktuelle Gen-5-Run, derselbe echte Provider-Job, nach der
G3.1-Verdrahtung, ohne `pipeline_job_id`** → echter G3.1-Coverage-Befund, kein Legacy-Artefakt.

---

## 2. Inventar aller internen Wiedereinspeisungen

Erfasst wurde jeder Pfad, der einen Handler **mit Ledger-Observe** aufruft
(`compose-clip-webhook`, `sync-so-webhook`, `remotion-webhook`) — unabhängig davon, ob eine
Webhook-URL gebaut oder ein rekonstruierter Payload direkt gepostet wird.

| # | Pfad | Ziel-Handler / Stage | Trägt `pipeline_job_id`? | Verdikt-Folge |
| --- | --- | --- | --- | --- |
| 1 | `compose-dialog-segments:6010` (Dispatcher, Provider-URL) | `sync-so-webhook` / `sync_segment` | **ja** | `bound` |
| 2 | `compose-video-clips:614` (Dispatcher, Provider-URL) | `compose-clip-webhook` / `base_video` | ja (G3.1) | `bound` |
| 3 | `compose-clip-webhook:647` (Selbst-Retry Replicate) | `compose-clip-webhook` / `base_video` | **ja** — neuer Attempt via `replaceLedgerAttempt`, ID reist in der neuen Provider-URL mit | `bound` |
| 4 | `sync-so-webhook:1250` (Fan-in → Audio-Mux) | `remotion-webhook` / `audio_mux` | **ja** — `pipeline_job_id` im Mux-Body → Lambda-`customData` | `bound` |
| 5 | **`lipsync-watchdog:192`** (Poll + Forward des Provider-Payloads) | `sync-so-webhook` / `sync_segment` | **NEIN** | **`missing_binding`** (belegt) |
| 6 | **`recover-stuck-composer-clip:127`** (`replayWebhook`, rekonstruierter Prediction-Payload) | `compose-clip-webhook` / `base_video` | **NEIN** | `missing_binding` (latent, im Fenster nicht exercised) |
| 7 | **`modelark-poll:122`** (Poll + synthetischer Payload) | `compose-clip-webhook` / `base_video` | **NEIN** — transportiert `run_id` + `generation`, aber keine Ledger-ID | `missing_binding` (latent) |
| 8 | `report-lipsync-motion-probe:271` (NOOP-Ladder-Re-Dispatch) | ruft **`compose-dialog-segments`**, nicht einen Observe-Handler | n/a — der gerufene Dispatcher erzeugt/ersetzt den Attempt selbst und baut die URL mit ID | unkritisch |
| 9 | `composer_reap_*` / Reaper (SQL) | schreibt nur Ledger, speist keinen Handler | n/a | unkritisch |
| 10 | Remotion-Dispatcher außerhalb Composer (`render-*`, `auto-generate-universal-video`, `pass-face-preclip`) | `remotion-webhook`, aber `stage ≠ sync_segments_audio_mux` | n/a — Observe greift dort nicht | unkritisch |

**Kern:** genau drei Pfade sind betroffen — 5 (bewiesen), 6 und 7 (gleiche Bauart, latent).
Allen dreien ist gemeinsam: sie sind **Recovery-/Poll-Forwarder**, die einen Provider-Zustand
nachträglich einspeisen und die Ledger-ID nie in der Hand hatten.

---

## 3. Telemetrie-Rückblick

Alle bisher erfassten Observationen (`composer_callback_observations`, gesamter Bestand):

| Handler | Stage | Verdikt | Anzahl | Zeitraum |
| --- | --- | --- | --- | --- |
| `compose-clip-webhook` | `base_video` | `bound` | 3 | 11:14:19 – 16:11:08 |
| `sync-so-webhook` | `sync_segment` | `bound` | 2 | 11:16:38 – 16:14:01 |
| `remotion-webhook` | `audio_mux` | `bound` | 2 | 11:17:03 – 16:14:27 |
| `g31d-smoke` | `base_video` | `bound` | 1 | 10:37:22 |
| **`sync-so-webhook`** | `sync_segment` | **`missing_binding`** | **1** | **16:14:03** |

`job_not_found`, `wrong_job`, `stale_run`, `stale_generation`, `binding_pending`: 0.

Bewertung — bewusst so formuliert:

> Das G3.1-Drain-Ergebnis (`missing_binding = 0` über T0 → 12:57Z) war für den in diesem
> Fenster **tatsächlich beobachteten Traffic korrekt**. Das **Coverage-Gate war unvollständig**:
> die Recovery-/Poll-Forwarder (Watchdog, Recover, ModelArk-Poll) wurden im Drain-Fenster nie
> exercised — der Provider lieferte dort jedes Mal selbst und rechtzeitig. Erst späterer
> Produktionsverkehr (16:14Z) hat diesen nicht beobachteten Re-Injection-Pfad aufgedeckt.

Das Gate war also nicht falsch gemessen, sondern gegen eine zu schmale Pfadmenge gemessen.

---

## 4. Fixrichtung (Bewertung, keine Umsetzung)

**Vorzugsrichtung (verbindlich): explizites Weiterreichen der bestehenden `pipeline_job_id`.**
Eine Auflösung über `external_job_id + scene_id + stage` wird **nicht** als Ersatz-Source-of-Truth
eingeführt; der eingefrorene D2-Vertrag (Bindung entsteht ausschließlich beim Dispatch und reist
mit) bleibt unangetastet.

Problem der drei Forwarder: sie kennen heute nur `scene_id` + Provider-Job-ID, weil sie ihre
Arbeitsliste aus Szenen-JSON (`audio_plan.twoshot.syncJobs`, `dialog_shots.passes[]`,
`replicate_prediction_id`) beziehen. Die Ledger-ID steht dort nicht.

Optionen für G3.1f:

- **F-a (empfohlen): Ledger-ID am selben Ort mitschreiben wie die Provider-Job-ID.**
  Der Dispatcher besitzt beide (`v431SyncLedgerJob.id` und `jobId`, siehe
  `bindLedgerExternalJob` in `compose-dialog-segments:7244`). Wird `pipeline_job_id` beim
  Dispatch zusätzlich in denselben Datensatz geschrieben, aus dem der Forwarder die Job-ID
  liest, kann jeder Forwarder sie unverändert weiterreichen. Keine Inferenz, keine zweite
  Auflösungsregel, dieselbe Provenienzquelle wie in der Provider-URL.
  Analoge Stellen: ModelArk (`replicate_prediction_id`-Prefix-Record) und
  `recover-stuck-composer-clip` (liest Replicate-Prediction; Ledger-ID müsste beim
  CVC-Dispatch mitpersistiert werden).
- **F-b (nur Notfalloption, ausdrücklich benannt):** Forwarder-lokaler Lookup
  `composer_pipeline_jobs` über `external_job_id (+ scene_id, stage)`, um die ID zu
  *beschaffen* — nicht, um im Handler die Bindung zu *ersetzen*. Risiken: `wrong_job` bei
  Provider-ID-Wiederverwendung, `stale_generation` bei mehrfach ersetzten Attempts mit
  gleichem `external_job_id`, und die faktische Etablierung einer zweiten Auflösungsregel.
  Nur akzeptabel als Übergang für Pfade, für die F-a nicht rechtzeitig persistiert werden kann,
  und dann mit explizitem Verdikt-Marker in der Telemetrie.
- **F-c (verworfen):** Observe/Apply über `external_job_id` auflösen lassen. Weicht D2 auf,
  verschiebt Provenienz vom Dispatcher zum Callback. Nicht weiterverfolgen.

Zusätzlich empfohlen für G3.1f: Verdikt-Differenzierung, damit ein Forward ohne ID nicht wie ein
fremder/unbekannter Callback aussieht (z. B. Detail-Feld `reinjected_by: <function>` im
Observation-Payload), damit das Coverage-Gate künftig pro Re-Injection-Pfad auswertbar ist.

---

## 5. Ergebnis / Statusraster

- **G3.2.1 — DONE / FROZEN.** Der A/Plate-Pfad ist vom Befund nicht betroffen; der echte
  Provider-Callback war `bound`, RPC A `applied = true`, Outputs korrekt.
- **G3.1 Core — FROZEN** (Vertrag unverändert gültig; nur die Pfadabdeckung war unvollständig).
- **G3.1e — DONE (dieser Bericht).**
- **G3.1f — EMPFOHLEN:** Fix nach Option F-a für Pfade 5, 6, 7 + gezielter Resmoke, der
  mindestens den Watchdog-Forward erzwingt (Provider-Webhook unterdrücken / Forward simulieren)
  und `bound` statt `missing_binding` nachweist.
- **G3.2.2 — BLOCKED** bis G3.1f gefixt und resmoked ist. Begründung: ab G3.2 ist die
  Ledger-Bindung nicht mehr nur Telemetrie, sondern Voraussetzung des Apply. Ein Forward ohne
  `pipeline_job_id` würde dann nicht mehr nur eine Beobachtung verlieren, sondern den
  Apply-Pfad des betroffenen Callbacks verfehlen.

STOP — keine automatische Reparatur in diesem Schritt.
