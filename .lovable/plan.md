# v431 — G2.0 Analysebericht (read-only, keine Writer-Migration)

Alle Angaben sind am Ist-Code belegt. Keine Datei außer diesem Plan wurde angefasst.
Grundsätze aus der Freigabe übernommen: **keine neue Runless-Regel, kein neues Grandfathering.**

## 0. Kernbefund vorab — `hybrid-extend-scene` ist kein State-Writer

`supabase/functions/hybrid-extend-scene/index.ts:185–209` ist ein **INSERT einer neuen Szene**
(`.insert({ …, clip_status: "pending", pipeline_state: "idle", … })`), kein Override einer
bestehenden Szene. Die Inventar-Klassifikation „Recovery-Override, kein legaler Übergang“
ist damit falsch.

Konsequenz: Es braucht weder eine `runless`-Ausnahme noch den Hard-Reset-Vertrag.
Rolle wird zu **`insert-default`** korrigiert und aus dem State-Writer-Inventar genommen.
Der eigentliche Extend-Render läuft danach über `compose-video-clips` (Zeile ~300, fetch),
dort entsteht der Run. Die Fehlerpfade der Funktion (`markSceneFailed`, Zeilen 258/263/313)
laufen bereits über `transitionScene()` auf die **neu eingefügte** Szene — deren Run ist zu
dem Zeitpunkt noch nicht gestartet, sie sind daher G2-Kandidaten mit dem Ziel „Run zuerst
starten, dann `run_bound`“, nicht „Ausnahme“.

## 1. Kandidatentabelle (Rolle · Provenienz · Zielverhalten)

Legende Rolle: `state` | `substate` | `output` | `job_metadata` | `diagnostic` | `reset` | `insert-default`.
Nur `state` und echte `substate`-Semantik gehen in die State-Migration.

### G2-A

| # | writeId heute | Fundstelle | Rolle (korrigiert) | Run-Provenienz heute | Immutable vom Dispatch? | Payload-Änderung | writeId künftig | Spend vor/nach Run | Verhalten ohne Run |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `hybrid-extend-scene:idle` | `hybrid-extend-scene:194` | **insert-default** (kein State-Write) | entfällt | entfällt | keine | — (aus Inventar entfernen) | vor Run (Frame-Extraktion) | n/a |
| 2 | `hybrid-extend-scene:markSceneFailed` (nicht inventarisiert) | `:258/:263/:313` → `:373` | state (failed) | keine — Szene wurde gerade erst eingefügt | nein | Run vor Dispatch starten (`beginSceneRun`) | `hybrid-extend:failed` (`run_bound`) | Extraktion vor Run; Provider-Spend erst in `compose-video-clips` | Run wird vorher erzeugt → fail-closed nie nötig |
| 3 | `generate-talking-head:plate-rendering` | `:648` | state + job_metadata + output(`clear`) | keine; Body kennt nur `sceneId`/`projectId` | nein | `runId` + `plateGeneration` **pflicht bei `sceneId`** | `talking-head:plate-rendering` | HeyGen-Job wird **vor** dem Write erzeugt (`createHeyGenVideo`, :634) → Spend vor Run | **fail-closed**: kein `composer_scenes`-State-Write; Standalone-Rendering läuft weiter |
| 4 | `generate-talking-head:plate-ready` | `:464` | output + state (`plate_ready`) | keine (Background-Poller, `jobOpts.sceneId`) | nein | Run-Kontext in `jobOpts` mitschleifen (Snapshot beim Dispatch) | `talking-head:plate-ready` | nach Provider-Spend | fail-closed (nur Storage/Signed-URL, kein Scene-Write) |
| 5 | `generate-talking-head:failed` | `:510` (`refundCredits`) | state (failed) | keine | nein | dito | `talking-head:failed` | Refund unabhängig vom Scene-Write | Refund bleibt, Scene-Write entfällt |
| 6 | `generate-talking-head:failed-2` | `:695` (`earlySceneId`) | state (failed) | keine | nein | dito | `talking-head:failed-early` | vor Spend möglich | fail-closed |
| 7 | `report-lipsync-motion-probe:failed` | `:305` | state (failed) + **substate** (`needs_clip_rerender`) | nur `job_id` aus Client-Payload; `run_id` existiert weder im Payload noch im Pass-Slot (`rg run_id` in `compose-dialog-segments` → 0 Treffer) | **nein** | `run_id` + `plate_generation` beim Dispatch in den Pass-Slot einfrieren **und** in die Probe-Antwortkette reichen | `motion-probe:noop-ladder-exhausted` | Provider-Spend längst erfolgt | fail-closed: nur `syncso_dispatch_log` + Pass-Patch, kein Scene-State |
| 8 | `compose-video-clips:clear` | `:641` | **kein Write** — Definition des Helpers `failedClipUpdate()` | — | — | keine | Inventareintrag korrigieren (Helper, kein Writer) | — | — |
| 9 | `compose-video-clips:clear-2` | `:1743` | **job_metadata** (`engine_override: heygen → auto`) | — | — | keine | `cvc:normalize-engine-override` | — | bleibt Legacy, kein State |
| 10 | `compose-video-clips:pending` | `:1888` | **job_metadata** (`clip_source: ai-sora → ai-veo`) | — | — | keine | `cvc:sunset-sora` | — | bleibt Legacy, kein State |
| 11 | `compose-video-clips:pending-2` | `:4131` | **output** + state (`complete`) für Upload-Szenen | ungestempelt (Upload-Pfad läuft vor Run-Stamp) | nein | Upload-Pfad in `sceneRunStamps` aufnehmen | `cvc:upload-complete` | kein Provider-Spend | fail-closed nach Stamp-Aufnahme |
| 12 | `compose-video-clips:pending-3` | `:4907` | state (failed) + job_metadata (`replicate_prediction_id`) | ungestempelt (Pika-Zweig) | nein | Branch in `sceneRunStamps` aufnehmen | `cvc:failed/pika` | Spend **vor** dem Write | nach Stamp `run_bound` |
| 13 | `compose-video-clips:clear-4` | `:5255` | state (failed), Catch-all über `__parsedBody.scenes` | **keine** — Body-IDs, kein Run | nein | keine (Fatal-Handler) | bleibt Legacy | variabel | **nach G3** verschieben (Fan-in-/Fatal-Semantik) |

### G2-B

| # | writeId heute | Fundstelle | Rolle (korrigiert) | Run-Provenienz heute | Payload-Änderung | writeId künftig | Spend | Verhalten ohne Run |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 14 | `compose-dialog-segments:pending` | `:1028` | **reset** (Self-Heal: ungültige Talking-Head-Master-Plate) | keine | keine | `cds:reset/raw-talking-head` | vor Spend | bleibt Reset, kein State-Übergang |
| 15 | `compose-dialog-segments:pending-2` | `:1125` | **reset** (Auto-Reset sauber refundeter Fehlversuche) | keine | keine | `cds:reset/stale-failed` | nach Refund | bleibt Reset |
| 16 | `compose-dialog-segments:conditional-running-or-pending` | `:1285` | **state + substate** (Circuit-Open) | Dispatch kennt Szene, aber kein Run-Feld | `runId`/`plateGeneration` aus Dispatch-Snapshot | `cds:circuit-open` | vor Spend | fail-closed (nur `logSyncDispatch`) |
| 17 | `compose-dialog-segments:pending-3` | `:4221` | Zweig A **diagnostic** (nur `clip_error`-Marker), Zweig B **substate** (`deferred`) | wie 16 | wie 16 | `cds:deferred` | vor Spend | Zweig A bleibt diagnostic |
| 18 | `compose-twoshot-audio:*` | `:652` | state (failed) + substate | **keine** — Body kennt nur `scene_id` | `run_id`/`plate_generation` vom Aufrufer pflichtend | `twoshot-audio:failed/id-only` | vor ElevenLabs-Spend | fail-closed |
| 19 | `compose-twoshot-audio` | `:715` | **job_metadata** (`dialog_turns`-Kanonisierung) | — | keine | `twoshot-audio:persist-turns` | — | unverändert |
| 20 | `compose-twoshot-audio` | `:1424/:1464` | **output + job_metadata** (`character_audio_url`, `audio_plan`, ggf. `duration_seconds`) | — | keine | `twoshot-audio:audio-ready` | nach Spend | unverändert (kein State) |
| 21 | `useSceneGenerate:conditional-audio_prep-or-plate_rendering` | `src/hooks/useSceneGenerate.ts:136` | state + substate (Client-Pre-Mark) | kein Run — läuft **vor** dem Invoke | — | siehe 2. | vor Spend | siehe 2. |

## 2. Server-Paritätsnachweis für `useSceneGenerate` — **nicht belegbar**

`beginSceneRun()` (`supabase/functions/_shared/scene-run-begin.ts:128–152`) schreibt
`active_run_id`, `plate_generation`, `clip_status: "generating"`, Output-Clear und die
Lip-Sync-Feld-Resets — **aber kein `pipeline_state` und kein `pipeline_substate`**.
Der Client-Pre-Mark setzt genau diese beiden Felder (`audio_prep` | `plate_rendering`,
`pipeline_substate: 'audio'`).

Damit ist die geforderte Parität heute **nicht** gegeben. Nach der Freigaberegel:
`useSceneGenerate` in G2 **nicht anfassen**, Verschiebung nach **G5**. Alternativ könnte
G2 `beginSceneRun()` um den State-Anteil erweitern — das ist aber eine Erweiterung des
G0-Vertrags und gehört als eigener Punkt entschieden, nicht nebenbei.

## 3. Ergebnis der Rollen-Schärfung

- Echte State-/Substate-Writer in G2: **#2, #3, #4, #5, #6, #7, #11, #12, #16, #17(B), #18** (11).
- Keine State-Migration: #1 (insert-default), #8 (Helper-Definition), #9, #10, #19, #20 (job_metadata/output),
  #14, #15 (reset), #17(A) (diagnostic).
- Nach G3 verschoben: **#13** (Fatal-Catch-all ohne jede Identität).
- Nach G5 verschoben: **#21** (`useSceneGenerate`, Parität nicht belegt).
- Neue Runless-Regeln: **0**. Neues Grandfathering: **0**.

## 4. Benötigte Schnittstellenänderungen (Zusammenfassung)

1. `generate-talking-head`: `runId` + `plateGeneration` im Body; bei gesetzter `sceneId`
   verpflichtend, sonst **kein** `composer_scenes`-Write (Standalone/QA bleibt funktionsfähig).
   Beide Werte in `jobOpts` einfrieren, damit Poller und Refund denselben Run sehen.
2. `report-lipsync-motion-probe`: `compose-dialog-segments` friert beim Pass-Dispatch
   `run_id` + `plate_generation` im Pass-Slot ein (heute nicht vorhanden) und reicht sie
   zusätzlich in die Probe-Payload. Der Slot wird nur bei Erstellung geschrieben,
   `update_dialog_pass_slot` patcht diese Keys nie — erst damit gilt er als immutable.
3. `compose-twoshot-audio`: `run_id` + `plate_generation` als Pflichtfelder vom Dispatcher.
4. `hybrid-extend-scene`: `beginSceneRun()` für die neu eingefügte Szene vor dem
   `compose-video-clips`-Dispatch; Fehlerpfade danach `run_bound`.
5. `compose-video-clips`: Upload- und Pika-Zweig in den bestehenden `sceneRunStamps`-Snapshot
   aufnehmen (keine neue Mechanik).

## 5. Vorschlag für die Freigabestufen G2.1–G2.4

- **G2.1** Payload-/Snapshot-Erweiterungen (1–3, 5), abwärtskompatibel, noch keine Writer-Umstellung.
- **G2.2** Migration `generate-talking-head` (#3–#6) + `report-lipsync-motion-probe` (#7).
- **G2.3** Migration Audio-/Dispatch (#16, #17B, #18) und `compose-video-clips` (#11, #12).
- **G2.4** `hybrid-extend-scene` (#1 Rollenkorrektur im Inventar, #2 `run_bound`).
- Danach: Inventar-Diff, Frozen-Suite + `tsgo`, `docs/v431-g2-report.md`, STOP.

## 6. STOP

G2.0 abgeschlossen. Keine Migration, keine Codeänderung. Offen zur Entscheidung:
ob `beginSceneRun()` in G2 zusätzlich `pipeline_state`/`pipeline_substate` setzen soll
(würde #21 statt nach G5 in G2 lösen).
