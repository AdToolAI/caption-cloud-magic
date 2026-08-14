# v431 — G1: Nachweise + reduzierter Scope

Zwei geforderte Nachweise sind erbracht (reine Lesearbeit, kein Code geändert). Ergebnis:
Der G1-Scope aus dem Vorschlag war zu breit — drei Writer haben keine belastbare
Run-Provenienz und ein Shared Helper würde ausgeschlossene G3/G4-Pfade indirekt mitziehen.

## Nachweis 1 — Run-Provenienz je geplantem run_bound-Writer

| Writer | Quelle der Run-Identität | Bewertung |
| --- | --- | --- |
| `compose-video-clips:failed` | `sceneRunStamps` (Map sceneId → {runId, generation}), gebildet **vor** dem Dispatch aus dem Run-Ledger und gegen die Live-Zeile verifiziert; dieselben Werte werden in die Webhook-URL (`run_id`, `generation`) eingebrannt und an anderer Stelle bereits als `.eq("active_run_id", …).eq("plate_generation", …)`-Filter genutzt | **Akzeptabel** — immutable Dispatch-Snapshot, kein frischer Read |
| `generate-talking-head:failed` / `:failed-2` | Keine. Die Funktion kennt weder `active_run_id` noch `plate_generation`; der Client (`src/hooks/useTalkingHead.ts`) übergibt keinen Run-Kontext. Ein `run_bound`-Write wäre nur über einen frischen Scene-Read möglich | **Nicht akzeptabel** → raus aus G1 |
| `report-lipsync-motion-probe:failed` | Keine. Payload enthält nur `scene_id` (+ Probe-Daten) aus `src/hooks/useMouthYavgProbe.ts`; kein Run-/Job-Bezug | **Nicht akzeptabel** → raus aus G1 |
| `cancel-dialog-lipsync:canceled` | Keine. Payload = `scene_id` (+ `reset`); die Funktion liest die Szene und kennt nur den *jetzt* aktiven Run | **Nicht akzeptabel als run_bound**; runless wäre nur mit einer **neuen** Regelzeile möglich → laut Vertrag STOP statt Ausnahme |

Konsequenz: `generate-talking-head` und `report-lipsync-motion-probe` brauchen zuerst eine
durchgereichte Run-Identität (Dispatch-Payload bzw. Probe-Payload) — das ist eine
Schnittstellenänderung und gehört nach G2. `cancel-dialog-lipsync` wird nur dann migriert,
wenn es seinen State-Write an den bereits in G0 migrierten Cancel-Pfad
(`composer-cancel-scene`, write_id `composer-cancel-scene:cancel-no-active-run`) delegiert,
also **ohne** neue Runless-Regel; ist das fachlich nicht deckungsgleich, bleibt es liegen.

## Nachweis 2 — Call-Graph `_shared/lipsync-fail.ts`

`failLipSync()` hat vier produktive Caller:

| Caller | Gruppe |
| --- | --- |
| `compose-dialog-segments/index.ts` (5 Callsites) | **G3** — ausgeschlossen |
| `lipsync-watchdog/index.ts` | **G4** — ausgeschlossen |
| `_shared/scene-hard-reset.ts` | Reset/Recovery — ausgeschlossen |
| `reset-lipsync-scene/index.ts` | Reset-Pfad, nicht terminal-failure — nicht G1 |

Es gibt **keinen** ausschließlichen G1-Caller. Ein Umbau des Helpers würde G3/G4 indirekt
migrieren. Deshalb: `lipsync-fail:failed` wird in G1 **nicht angefasst** — weder Helper noch
Callsites. Die Migration erfolgt in G3, dann helper-intern mit optionalem Run-Kontext, damit
die späteren Caller unverändert bleiben können.

## Reduzierter G1-Scope (Umsetzung nach Freigabe)

1. `compose-video-clips:failed` (Zeile ~1633, `markSceneContractFailure`) → `transitionSceneV2()`
   mit `guardMode: "run_bound"`, `runId`/`generation` aus dem vorhandenen `sceneRunStamps`-Snapshot,
   `_error_text` = Fehlermeldung (Zustand + `clip_error` atomar). Failure-Zweige, die **vor**
   dem Stempeln auftreten, bleiben unverändert und bleiben Debt für G2.
2. `SceneCard:canceled` → kein direkter Client-State-Write mehr; Aufruf der bestehenden
   Cancel-Edge-Function. Sichtbare Cancel-Semantik unverändert.
3. Optional, nur bei fachlicher Deckungsgleichheit: `cancel-dialog-lipsync:canceled`
   delegiert an den bestehenden migrierten Cancel-Pfad. Sonst STOP und Rückmeldung.

Nicht in G1 (unverändert): sync-so-webhook, remotion-webhook, compose-clip-webhook,
compose-dialog-segments, render-sync-segments-audio-mux, lipsync-watchdog, qa-watchdog,
recover-stuck-composer-clip, qa-weekly-deep-sweep, continuity-chain, autopilotComposerBridge,
useTwoShotAutoTrigger, hybrid-extend-scene (Debt → G2 `run_bound`), Lip-Sync-Frozen-Contracts,
Cast & World, Reverse-Bridge.

## Regeln während G1

- Keine neue Runless-Regel, keine neue `system_migration`-Signatur, kein neuer
  Grandfather-Eintrag. Bedarf = STOP.
- `composer_transition_grandfather` schrumpft monoton: nur die Kanten der tatsächlich
  migrierten Writes werden am Ende von G1 per Migration entfernt.
- G0-State-Core bleibt eingefroren; die drei Smoke-Fixes liegen bereits als versionierte
  Migrationen im Repo (verifiziert), vor Umsetzungsbeginn wird nur noch der Diff
  DB-Funktion ↔ Migrationsdatei bestätigt.

## G1-Abnahme

- Writer-Inventar vorher/nachher.
- Liste entfernter semantischer Write-IDs aus Grandfathering.
- Contract-Scanner grün; Allowlist entsprechend verkleinert.
- State-/Error-Atomizität nachgewiesen (ein Core-Aufruf, ein Audit-Eintrag).
- Keine neuen Runless-Ausnahmen.
- Composer-Tests + `tsgo` grün; Lip-Sync-Frozen-Contract-Tests unverändert grün.
- Kleiner Smoke je migriertem Writer-Typ (Failure-Terminal run_bound, UI-Cancel).

Danach STOP und G1-Bericht. Kein G2 ohne neue Freigabe.
