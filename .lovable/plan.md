# v431 G2.3 — Scope-Tabelle (nur Analyse, keine Migration)

Status: G0 / G1 / G2.1 / G2.2 DONE + FROZEN. Diese Vorlage definiert ausschliesslich
den Migrationsscope für G2.3. Es wird kein Code geändert, bevor die Tabelle freigegeben ist.

## 1. Die fünf semantischen Pfade

| writeId | from-state(s) | to-state / substate | immutable run source | Legacy-Spiegel | Output im selben Write? | Provider/Credit-Spend davor? | stale behavior |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `compose-dialog-segments:conditional-running-or-pending` (index.ts:1285, Circuit-Open) | `audio_ready`, `lipsync_dispatched`, `lipsync_running` | kein Terminal: `keepRunning=true` → bleibt `lipsync_running`; `keepRunning=false` → `audio_ready` + substate `circuit_open` | Szenen-Snapshot `active_run_id` + `plate_generation` (bereits im SELECT :785 geladen) | `lip_sync_status` (`running`/`pending`), `twoshot_stage='circuit_open'`, `clip_error` | nein — reiner State/Substate-Write | nein (Circuit-Gate liegt **vor** dem Wallet-Debit) | stale Run/Generation → No-op, 202-Antwort unverändert (Client-Retry bleibt gültig) |
| `compose-dialog-segments:pending-3` (index.ts:4221, deferred-Zweig) | `audio_ready`, `lipsync_dispatched` | `audio_ready` + substate `deferred` | dito Szenen-Snapshot | `lip_sync_status='pending'`, `twoshot_stage='deferred'`, `clip_error` | nein | ja — Initial-Dispatch wurde belastet und wird **im selben Zweig refundiert** (:4200). Refund bleibt ausserhalb des State-Writes und unverändert | stale → No-op; Refund läuft trotzdem (Geldpfad ist nicht run-gefenced) |
| — Diagnosezweig `isAdvance/isRetry` (index.ts:4204) | — | **nicht migrieren** | — | nur `clip_error` + `updated_at` | — | — | bleibt reine Diagnose, kein State-Writer |
| `compose-twoshot-audio:failed` (index.ts:653, `id_only_dialog_turns_required`) | `audio_prep` (bzw. Vorzustand des Callers) | `failed` + substate `dialog_turns_required` | **nur** `run_id` + `plate_generation` aus dem Request-Body (:572, heute schon durchgereicht) | `lip_sync_status='failed'`, `twoshot_stage='failed'`, `clip_error` | nein | nein (Gate liegt vor TTS/ElevenLabs-Spend) | ohne Body-Provenienz **kein** migrierter Write → Legacy-Verhalten unverändert (siehe §2) |
| `compose-video-clips:upload-complete` (index.ts:4117) | `idle`, `plate_queued` | `complete` | `sceneRunStamps` (G2.1, bereits vorhanden) | `clip_status='ready'` | **ja — zwingend** (Output-Tripel via `materializeCompatibilityOutput('base')` + Terminalstate in einem Write) | nein | stale → No-op, kein Output-Overwrite |
| `compose-video-clips:failed/pika` (index.ts:4904) | `idle`, `plate_queued`, `plate_rendering` | `failed` + substate `provider_error` | `sceneRunStamps` (G2.1) | `clip_status='failed'`, `clip_error`, ggf. `twoshot_stage` aus `failedClipUpdate()` | nein | ja — Pika-HTTP-Call erfolgt davor; Credit-Refund bleibt im bestehenden Pfad | stale → No-op, `results[]`-Antwort unverändert `failed` |

## 2. Prüfpunkt A — `compose-twoshot-audio` nicht pauschal migrieren

Drei Caller, drei Provenienz-Niveaus:

| Caller | Gruppe | Run-Provenienz heute |
| --- | --- | --- |
| `compose-video-clips` (:2217) | G2 | ja — `run_id` + `plate_generation` im Body |
| `compose-clip-webhook` (:473) | G3 | nein |
| `_shared/autopilotComposerBridge.ts` (:313) | G5 Self-Heal | nein |

Folge: der Writer wird **caller-spezifisch** migriert. Nur wenn der Body eine
vollständige Provenienz trägt, läuft der Fail über das geguardete Primitive; sonst
bleibt exakt der heutige Write bestehen (dokumentierter Legacy-Ast bis G3/G5).
Kein Fail-closed hier — das würde Webhook und Self-Heal stumm brechen.
Die Output-/`audio_plan`-/`dialog_turns`-Writes (:721, :1470) bleiben ausdrücklich
ausserhalb der State-Migration.

## 3. Prüfpunkt B — Upload → `complete` ist atomar

`complete` ist final, deshalb gilt dieselbe Lektion wie beim Talking Head: Output
und `pipeline_state='complete'` gehören in **einen** geguardeten Write, nicht
Output-Write plus nachgelagerte Transition.

Zusätzlicher, in der DB verifizierter Befund: `composer_scene_transitions` enthält
heute **keine** Kante `idle → complete` und keine `plate_queued → complete`
(erlaubt sind nur `plate_ready|audio_ready|lipsync_* |complete → complete`).
Upload-Szenen starten aber in `idle`/`plate_queued`. G2.3 braucht deshalb eine
Entscheidung, die in der Umsetzung explizit zu treffen ist:

- **Variante A (bevorzugt):** zwei legale Kanten `idle → complete` und
  `plate_queued → complete` ergänzen — semantisch korrekt, da Upload keinen
  Provider-Lauf hat.
- **Variante B:** Upload zuerst nach `plate_ready`, dann `plate_ready → complete`
  — zwei Transitionen, damit kein Ein-Write-Atom mehr. Widerspricht Prüfpunkt B.

Empfehlung: Variante A, umgesetzt über ein schmales Primitive
`composer_finalize_upload_scene(_scene_id,_run_id,_generation,_write_id,_upload_url)`
nach dem Muster von `composer_finalize_talking_head` — geschlossener Modus,
feste From/To-Klasse, Transition über `composer_scene_transition_core`
(`caller_class='v2'`), Legacy-Spiegel `clip_status='ready'` unter demselben Row Lock.

## 4. Ausdrücklich ausserhalb G2.3

Reset-Pfade, Diagnose-Writes (`clip_error`-only), Output-Writes ohne Statuswechsel
und Job-Metadata (`replicate_prediction_id`, `audio_plan`, `dialog_turns`,
`dialog_shots`) bleiben unverändert. Keine Erweiterung des generischen G0-Cores.

## 5. Baseline-Vermerk

Der G2-Bericht hält die vorbestehenden Social-Publishing-Reds in
`src/pages/__tests__/Composer.test.tsx` als unveränderte Baseline fest
(nicht durch G2.x verursacht, ausserhalb Scope).

## 6. Freigabefrage

Migration erst nach Abnahme dieser Tabelle — insbesondere der Entscheidung
Variante A vs. B bei Upload → `complete` und des caller-spezifischen Zuschnitts
bei `compose-twoshot-audio`.
