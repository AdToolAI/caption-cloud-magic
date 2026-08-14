# v431 — G2 Analyse- und Umsetzungsplan (Audio-/Dispatch-Zwischenzustände + zurückgestellte Writer)

Status: G0 DONE/FROZEN, G1 DONE/FROZEN. G2 wird hier nur **spezifiziert**, nicht migriert.
Erst Writer-Set, Run-Provenienz und Schnittstellenänderungen — danach Freigabe, dann Umsetzung.

## 1. Scope von G2

Zwei Blöcke, bewusst getrennt, weil ihre Provenienz-Lage unterschiedlich ist:

- **G2-A — Writer ohne heutige Run-Identität** (aus G1 zurückgestellt):
  `hybrid-extend-scene`, `generate-talking-head`, `report-lipsync-motion-probe`,
  die ungestempelten `compose-video-clips`-Branches.
- **G2-B — Audio-/Dispatch-Zwischenzustände** (Originalplan G2):
  `compose-twoshot-audio`, `compose-dialog-segments` Dispatch-/Start-Pfade,
  `useSceneGenerate`.

Ausdrücklich **nicht** in G2: Webhooks/Fan-in (G3), Watchdog/Recovery (G4),
Client-Compatibility (G5), Bridge-Abschaltung (G6), `compose-video-assemble` (Track T1).

## 2. Writer-Set (Kandidaten, Inventar-IDs)

### G2-A
| ID | Ziel-State heute | Rolle |
| --- | --- | --- |
| `hybrid-extend-scene:idle` | `idle` (Recovery-Override, kein legaler Übergang) | state |
| `generate-talking-head:plate-rendering` | `plate_rendering` | state |
| `generate-talking-head:plate-ready` | `plate_ready` | state |
| `generate-talking-head:failed` / `:failed-2` | `failed` | state |
| `report-lipsync-motion-probe:failed` | `failed` + `twoshot_stage=needs_clip_rerender` | state |
| `compose-video-clips:clear`, `:clear-2`, `:clear-4` | Feld-Reset, kein State-Wechsel | state |
| `compose-video-clips:pending`, `:pending-2`, `:pending-3` | kein direkter State | state |

(`compose-video-clips:failed` ist in G1 migriert, `:clear-3` ist bereits guarded.)

### G2-B
| ID | Ziel-State heute | Rolle |
| --- | --- | --- |
| `compose-dialog-segments:pending`, `:pending-2`, `:pending-3` | Vorzustand bleibt | state |
| `compose-dialog-segments:conditional-running-or-pending` | konditional | state |
| `compose-twoshot-audio`-Zwischenschreiber (`audio_prep` / `twoshot_stage`) | substate | substate |
| `useSceneGenerate:conditional-audio_prep-or-plate_rendering` | `audio_prep` \| `plate_rendering` | state |

## 3. Run-Provenienz — Ist-Befund je Writer

Regel aus G1 unverändert: akzeptabel sind nur **immutable Dispatch-Snapshots** oder eine
vom Aufrufer atomar mitgereichte Identität. Nicht akzeptabel: „Szene direkt vor dem Write lesen“.

| Writer | Heutige Identität | Bewertung |
| --- | --- | --- |
| `generate-talking-head` (4 Writes) | Request-Body kennt nur `sceneId`/`projectId`; kein `run_id`, kein `plate_generation`. Aufrufer sind UI (`useTalkingHead`), QA-Sweeps, Superuser-Smoke | **keine Provenienz** — Schnittstelle muss erweitert werden |
| `report-lipsync-motion-probe` | Body trägt `scene_id`, `pass_idx`, `job_id`. `job_id` ist an einen Pass-Slot in `dialog_shots` gebunden | **Job-Provenienz vorhanden, Run-Provenienz nicht** — Run muss aus dem Pass-Slot abgeleitet oder mitgereicht werden |
| `hybrid-extend-scene:idle` | Nutzer-initiierter Extend, bewusster Override aus beliebigem Zustand | **kein Run** — braucht `runless` + eigene Recovery-Semantik, nicht `run_bound` |
| `compose-video-clips` ungestempelte Branches | Laufen vor bzw. außerhalb von `sceneRunStamps` | teils nachstempelbar, teils Pre-Run — **pro Branch entscheiden** |
| `compose-dialog-segments` Dispatch-Pfade | Dispatch kennt den Run, reicht ihn aber nicht in jeden Write | **nachstempelbar** über bestehenden Dispatch-Snapshot |
| `compose-twoshot-audio` | keinerlei `run_id` im Modul | **keine Provenienz** — Aufrufer muss ihn übergeben |
| `useSceneGenerate` | Client, Run entsteht erst serverseitig in `scene-run-begin` | **kein Run vor dem Write** — Kandidat für Wegfall statt Migration |

## 4. Vorgeschlagene Schnittstellenänderungen

1. **`generate-talking-head`**: optionale Felder `runId` + `plateGeneration` im Request-Body.
   Gesetzt → `run_bound`; nicht gesetzt (QA/Standalone-Portrait ohne Composer-Szene) → Legacy bleibt,
   Write nur wenn `sceneId` fehlt oder Szene keinen aktiven Run hat.
2. **`report-lipsync-motion-probe`**: Run aus dem Pass-Slot (`dialog_shots[pass_idx].run_id`)
   lesen, falls dort vorhanden; sonst Dispatch um `run_id` erweitern. Ziel: `run_bound` mit
   Branch-ID `noop-ladder-exhausted`.
3. **`compose-twoshot-audio`**: `runId`/`plateGeneration` als Pflichtfelder vom Dispatcher,
   analog zu `sceneRunStamps` in `compose-video-clips`.
4. **`hybrid-extend-scene`**: kein Run-Binding. Stattdessen expliziter Recovery-Aufruf
   (`composer_scene_transition_v2` mit `_guard_mode='runless'`, Branch `hybrid-extend-reset`),
   dokumentiert als bewusste Grandfather-Ausnahme mit Audit-Zeile.
5. **`useSceneGenerate`**: Client-Write ersatzlos streichen, sobald `scene-run-begin` denselben
   Zustand serverseitig setzt (Verifikation nötig); nur optimistische UI bleibt.

## 5. Ablauf der Umsetzung (nach Freigabe)

1. **G2.0 Nachweisrunde** — pro Writer Provenienz belegen (Code-Zitat + Dispatch-Kette),
   Writer ohne belegbare Identität sofort nach G3/G4 verschieben statt „vermutlich passt es“.
2. **G2.1 Dispatch-Erweiterungen** — Body-Felder ergänzen, Aufrufer nachziehen, abwärtskompatibel.
3. **G2.2 Migration G2-A** (Writer mit dann belegter Identität) auf `transitionSceneV2`.
4. **G2.3 Migration G2-B** (Audio-/Dispatch-Zwischenzustände).
5. **G2.4 `hybrid-extend-scene`** als eigener Recovery-Vertrag.
6. **Tests/Smokes** — Fixture-Parität, DB-Smoke je Branch, Frozen-Suite + `tsgo`.
7. **Inventar-Diff + Grandfather-Trim**, Bericht `docs/v431-g2-report.md`, dann STOP.

## 6. Abbruchkriterien

- Dispatch erzeugt exakt dieselben Zustände wie heute — kein Doppel-Run, keine Doppelkosten
  (Run-/Kosten-Paritätsnachweis wie in v430.1).
- Verspäteter Callback eines alten Runs verändert nach dem Write nichts.
- Lip-Sync-Pipeline unverändert: Provider-Vertrag v425 und Anchor-Kohärenz v400 bleiben unberührt.
- Credits/Reservations werden in G2 nicht angefasst.

## 7. Offene Entscheidungen für die Durchsicht

- Darf `generate-talking-head` bei fehlendem `runId` weiterhin Legacy schreiben, oder soll der
  Szenen-Write dann komplett unterbleiben?
- Soll `useSceneGenerate` in G2 entfallen oder erst in G5 mit den übrigen Client-Writern?
- Ist eine dokumentierte `runless`-Ausnahme für `hybrid-extend-scene` akzeptabel?
