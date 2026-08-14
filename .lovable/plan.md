# v431 G2.2 — Vorvertrag: Stale-Sicherheit für Output & Job-Slot-Bindung

G2.1 ist abgenommen (Provenienz-Transport). Bevor G2.2 die eigentlichen Writes
umstellt, werden die zwei geforderten Vertragsnachweise verbindlich festgelegt.
Dieser Plan ändert noch keinen Code.

## Befund (verifiziert am aktuellen Stand)

`generate-talking-head`
- Der Completion-Pfad schreibt State **und** Output in **einem** unbedingten
  Statement: `materializeCompatibilityOutput('base', { baseUrl: finalUrl })` +
  `pipeline_state: 'plate_ready'` + `clip_status: 'ready'`, gefiltert nur nach
  `.eq('id', sceneId)`. Kein Run-/Generation-Guard.
- Der Dispatch-Pfad schreibt ebenfalls Output-relevant:
  `materializeCompatibilityOutput('clear')` + `plate_rendering` — ebenfalls
  ungeguardet.
- Fail-Pfade (`refundCredits`, Early-Fail) schreiben `failed` ohne Guard.
- `runId` + `plateGeneration` liegen seit G2.1 eingefroren in `jobOpts` vor.

`report-lipsync-motion-probe`
- Der Request bringt `pass_idx` + optional `job_id` mit; der Slot wird heute
  **allein über `pass_idx`** aufgelöst (`passes[body.pass_idx]`).
- Der Slot trägt eine `job_id` (gesetzt von `compose-dialog-segments` beim
  Dispatch) — sie kann bei Retry/Reset auf `null` zurückgesetzt werden.
- Aus genau diesem Slot werden seit G2.1 `run_id` + `plate_generation` gelesen.
- Der Hard-Fail-Zweig schreibt heute ungeguardet Scene-State
  (`lip_sync_status: 'failed'`, `twoshot_stage: 'needs_clip_rerender'`,
  `clip_error`).

## Vertragsnachweis 1 — Talking-Head: Output ist genauso stale-sicher wie State

Verbindlich für G2.2:

1. **Kein unbedingter Scene-Output-Write mehr.** Jeder Write auf
   `composer_scenes`, der Output-Felder berührt (`clip_url`, `base_video_url`,
   `processed_video_url` bzw. alles aus `materializeCompatibilityOutput`),
   wird mit dem eingefrorenen Dispatch-Snapshot **und** dem erwarteten
   aktuellen Zustand geguardet:
   `.eq('id', sceneId).eq('active_run_id', runId).eq('plate_generation', generation).in('pipeline_state', <erlaubte From-States>)`.
2. **Cancel-Race geschlossen (From-State-Guard).** Run + Generation allein
   reichen nicht: ein User-Cancel behält `active_run_id` und
   `plate_generation` und setzt nur `pipeline_state = 'canceled'`. Der
   Completion-Write darf deshalb ausschließlich aus dem laufenden
   Talking-Head-Zustand (`plate_rendering`) greifen, nie aus `canceled`,
   `failed` oder `complete`. Bevorzugte Umsetzung: eine kleine atomare
   DB-Finalisierung, die unter Row Lock Run + Generation + From-State prüft
   und Output + State gemeinsam materialisiert. Bleiben es zwei Statements,
   trägt der Output-Write zwingend alle drei Bedingungen (Run, Generation,
   erwarteter `pipeline_state`) und läuft **vor** dem State-Übergang über
   `transitionSceneV2()` (`run_bound`, `expected_generation`).
3. **0 aktualisierte Zeilen = stale/canceled → No-op.** Liefert der
   Output-Update keine Zeile zurück, wird der State-Übergang **nicht**
   ausgeführt; die Funktion loggt `write=plate-ready result=stale` und beendet
   den Job-Zweig ohne weitere Mutation. Kein Retry, kein ungeguardeter
   Ersatz-Write.
4. **Gleiche Regel für die Nebenpfade.** `plate_rendering` (inkl.
   `materializeCompatibilityOutput('clear')`), Refund-Fail und Early-Fail
   laufen über denselben Guard; ein stale oder gecancelter Run darf weder
   Output löschen noch die Szene auf `failed` ziehen.
5. **Fehlender Run = fail-closed (G2.0-Regel).** Ist `sceneId` gesetzt, aber
   der Run-Snapshot unvollständig (`runId` oder `plateGeneration` fehlt), gibt
   es **keinen** `composer_scenes`-Write — weder State noch Output, weder im
   Erfolgs- noch im Fehlerpfad. Log-Marker
   `write=<id> result=missing_run_provenance`, klare Fehlerantwort.
   **Kein Legacy-Fallback.** Standalone-Aufrufe ohne `sceneId` laufen
   unverändert weiter, da sie ohnehin keine Szene schreiben.
6. **Credits.** Der Refund-Pfad bleibt inhaltlich unverändert; nur sein
   Scene-Write wird geguardet bzw. bei fehlender Provenienz ausgelassen. Ein
   stale Run refundet weiterhin seinen eigenen Spend, mutiert aber keine Szene.


## Vertragsnachweis 2 — Probe: Job-ID muss zum Slot passen

Verbindlich für G2.2:

1. **Slot-Bindung vor Run-Nutzung.** Bevor `run_id` / `plate_generation` aus
   `passes[pass_idx]` verwendet werden, gilt zwingend
   `payload.job_id === slot.job_id`.
2. **Mismatch = No-op.** Bei Abweichung (auch bei `slot.job_id === null` oder
   fehlendem `payload.job_id`): kein Scene-State-Write, kein Slot-Patch, keine
   Eskalation, kein Hard-Fail. Rückgabe `{ ok: true, ignored: 'job_slot_mismatch' }`
   plus Diagnose-Log mit erwarteter/erhaltener Job-ID; die Dispatch-Log-Zeile
   (rein diagnostisch) darf weiterhin geschrieben werden.
3. **Match = geguardeter Write.** Nur bei Übereinstimmung wird der
   Run-Snapshot verwendet; der Hard-Fail-Zweig schreibt den Scene-State dann
   über `transitionSceneV2()` (`run_bound`, `expected_generation` aus dem
   Slot). Bleibt der Slot ohne Run-Snapshot (Alt-Zeilen), bleibt der heutige
   Legacy-Write mit Log-Marker `run=none` — keine neue Ausnahme.
4. **Immutability bleibt.** `update_dialog_pass_slot` schützt `run_id` /
   `plate_generation` bereits; G2.2 erweitert den Schutz auf `job_id`, sobald
   sie gesetzt ist — mit der bestehenden Reset-Semantik als einzigem Weg, sie
   wieder freizugeben (expliziter Nullsetz-Pfad in `compose-dialog-segments`).

## Umsetzungsreihenfolge nach GO

1. Migration: `job_id`-Immutability-Erweiterung in `update_dialog_pass_slot`
   (inkl. explizit erlaubtem Reset-Pfad).
2. `generate-talking-head`: geguardete Output-Updates + `transitionSceneV2()`
   für `plate_rendering` / `plate_ready` / `failed`.
3. `report-lipsync-motion-probe`: Job-Slot-Match-Gate + geguardeter Hard-Fail.
4. Stale-Run-Smokes auf echter DB:
   - alter Run schreibt `plate_ready` → 0 Zeilen, Output unverändert, kein State
   - aktueller Run → Output + State wie heute
   - Probe mit falscher `job_id` → No-op, Slot & Szene unverändert
   - Probe mit korrekter `job_id` → Eskalation/Hard-Fail wie heute
5. Tests + `tsgo`, Bericht in `docs/v431-g2-report.md`.
6. **STOP vor G2.3.**

## Baseline für den Bericht

- Relevante Composer-/Lip-Sync-Suite: 445 Tests grün, `tsgo` grün.
- 39 rote Tests in 37 unberührten UI-Test-Dateien sind dokumentierte
  Vorher-Baseline, kein G2-Regressionsbefund.
