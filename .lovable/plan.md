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

1. **Atomare Finalisierung statt zwei Statements (verpflichtend).** Output und
   State werden für die gekoppelten Talking-Head-Übergänge
   (`plate_rendering`-Einstieg mit Output-Clear und `plate_ready`-Completion)
   in **einem** Commit materialisiert — über ein eng geschnittenes RPC-Primitive
   `composer_finalize_talking_head(...)`:
   `SELECT ... FOR UPDATE` → `active_run_id` prüfen → `plate_generation` prüfen
   → erwarteten `from_state` prüfen → Output materialisieren →
   `pipeline_state` + `pipeline_substate` + `clip_status`-Spiegel schreiben →
   Commit. Kein generischer neuer State-Bypass: das Primitive kennt nur die
   Talking-Head-Übergänge und ruft intern denselben Kernvertrag wie
   `transitionSceneV2()` (`run_bound`) auf.
2. **Cancel-Race und Doppel-Callback geschlossen.** Run + Generation allein
   reichen nicht: ein User-Cancel behält `active_run_id` und
   `plate_generation` und setzt nur `pipeline_state = 'canceled'`. Da Prüfung,
   Output und State unter demselben Row Lock laufen, kann weder ein Cancel
   zwischen Output und State schlüpfen noch ein zweiter Completion-Callback
   desselben Runs ein zweites Mal materialisieren. Zulässiger `from_state` für
   die Completion ist ausschließlich `plate_rendering`; `canceled`, `failed`
   und `complete` sind ausgeschlossen.
3. **Guard-Verletzung = No-op mit Grund.** Das Primitive gibt bei
   Run-/Generations-/From-State-Abweichung `applied = false` mit Grund
   (`stale_run`, `stale_generation`, `unexpected_state`) zurück; es wird nichts
   geschrieben, die Funktion loggt `write=plate-ready result=<grund>` und
   beendet den Job-Zweig. Kein Retry, kein ungeguardeter Ersatz-Write.
4. **Fehlerpfade ebenfalls atomar (kein zweites Legacy-Update).** Der
   Talking-Head-Fehlerfall ändert kanonischen State **und** Legacy-Spiegel und
   ist damit ebenfalls ein gekoppelter Write: `pipeline_state = 'failed'` +
   `clip_status = 'failed'` + `clip_error` werden in **einer** Transaktion unter
   demselben Row Lock mit Run-/Generations-/From-State-Guard materialisiert —
   über denselben eng geschnittenen Finalizer (Modus `fail`) bzw. ein schmales
   Schwester-Primitive. `transitionSceneV2()` bleibt ausschließlich für Writes
   reserviert, die **keine** Legacy-Spiegel und keinen Output berühren. Ein
   ungeguardetes `.update()` nach einem Transition-Write ist in G2.2 verboten.
   Der generische G0-Core wird dafür **nicht** erweitert.


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
3. **Match = geguardeter Write, sonst fail-closed.** Nur bei Übereinstimmung
   wird der Run-Snapshot verwendet; der Hard-Fail-Zweig schreibt den
   Scene-State dann über `transitionSceneV2()` (`run_bound`,
   `expected_generation` aus dem Slot). Fehlt dem Slot der vollständige
   Run-Snapshot (Alt-Zeilen), gibt es **keinen** `composer_scenes`-Write:
   Diagnose-Log und Pass-/Slot-Verarbeitung laufen weiter, der Scene-State
   bleibt unangetastet. **Kein Legacy-State-Fallback.**
4. **Immutability bleibt.** `update_dialog_pass_slot` schützt `run_id` /
   `plate_generation` bereits; G2.2 erweitert den Schutz auf `job_id`, sobald
   sie gesetzt ist — mit der bestehenden Reset-Semantik als einzigem Weg, sie
   wieder freizugeben (expliziter Nullsetz-Pfad in `compose-dialog-segments`).
5. **Reset-Nachweis (Contract-Test).** Ein `job_id = NULL`-Reset darf niemals
   dazu führen, dass ein Job aus einer **neuen** Generation den alten
   `run_id` / `plate_generation`-Snapshot erbt. Der Test belegt genau eine der
   beiden gültigen Bedingungen: Reset/Retry passiert garantiert innerhalb
   desselben Runs und derselben Generation, **oder** der Slot wird bei neuem
   Run vollständig neu erstellt. Trifft keine zu, ist der Reset-Pfad
   entsprechend zu härten, bevor G2.2 abgenommen wird.

## Vertragsnachweis 3 — Legacy-Spiegel bleiben bis G6 erhalten

G6 ist nicht erreicht: `clip_status`, `lip_sync_status` und `twoshot_stage`
haben nachweislich noch aktive Leser (u. a. `usePipelineProgress`,
`useTwoShotAutoTrigger`, `useRenderQueueLive`, `ClipsTab`,
`sceneCardPresentation`, `resolveSceneOutput`, `sceneErrorPresenter` sowie
Webhooks im Backend). G2.2 entfernt daher **keinen** Spiegel; jeder Spiegel
wird im selben geguardeten Write mitgeschrieben.

`generate-talking-head` (kanonisch + Spiegel, gekoppelt):
- Einstieg: `pipeline_state = 'plate_rendering'` + `clip_status = 'generating'`
  + Output-Clear.
- Completion: `pipeline_state = 'plate_ready'` + `clip_status = 'ready'`
  + Output-Materialisierung.
- Fehler/Refund: `pipeline_state = 'failed'` + `clip_status = 'failed'`
  + `clip_error`.

`report-lipsync-motion-probe` (Hard-Fail, kanonisch + Spiegel):
- kanonisch: `pipeline_state = 'failed'`,
  `pipeline_substate = 'needs_clip_rerender'`, `clip_error = <User-Text>`.
- Spiegel bleiben bis G6 erhalten: `lip_sync_status = 'failed'` und
  `twoshot_stage = 'needs_clip_rerender'` werden weiterhin gesetzt. Ein
  Entfernen ist erst nach einem dokumentierten Reader-Audit (eigener Schritt in
  G6) zulässig.
- **Atomizität:** Alle fünf Felder werden in **einer** Transaktion unter Row
  Lock mit Run-/Generations-Guard geschrieben — über ein schmales
  `composer_fail_scene_with_mirrors(...)`-Primitive (nicht über den generischen
  G0-Core, nicht über ein Folge-`.update()` nach `transitionSceneV2()`).
- Der Eskalations-Zweig bleibt unverändert; er berührt nur Slot-Daten.

## Regel: kanonisch + Spiegel = ein Primitive

Für G2.2 gilt ausnahmslos: sobald ein Pfad kanonischen State **und** einen
Legacy-Spiegel (oder Output) ändert, geschieht das in genau einem
DB-Primitive mit `FOR UPDATE`, Run-, Generations- und From-State-Guard.
`transitionSceneV2()` bleibt nur für reine kanonische State-Writes ohne
Spiegel und ohne Output zulässig. Damit kann die bis G6 aktive Reverse-Bridge
keinen Zwischenzustand spiegeln.

## Umsetzungsreihenfolge nach GO

1. Migration:
   - `job_id`-Immutability-Erweiterung in `update_dialog_pass_slot` (inkl.
     explizit erlaubtem Reset-Pfad),
   - `composer_finalize_talking_head(...)` mit Modi `start` / `complete` /
     `fail` (Row Lock, Run + Generation + `from_state`, Output + kanonischer
     State + `clip_status`/`clip_error` in einem Commit),
   - `composer_fail_scene_with_mirrors(...)` für den Probe-Hard-Fail
     (`pipeline_state`, `pipeline_substate`, `clip_error`, `lip_sync_status`,
     `twoshot_stage` in einem Commit).
2. `generate-talking-head`: alle gekoppelten Übergänge inkl. Fehler-/Refund-Pfad
   über das Primitive; `transitionSceneV2()` nur für reine State-Writes ohne
   Spiegel; fail-closed bei fehlender Provenienz.

3. `report-lipsync-motion-probe`: Job-Slot-Match-Gate + geguardeter Hard-Fail
   mit kanonischem State/Substate **und** Spiegeln, fail-closed ohne
   Slot-Run-Snapshot.
4. Smokes auf echter DB:
   - stale Run schreibt `plate_ready` → `applied=false`, Output und State
     unverändert
   - **Cancel-Race (verpflichtend):** `plate_rendering` → Completion beginnt →
     konkurrierender Cancel → nur eine konsistente Reihenfolge sichtbar;
     niemals `canceled` mit nachträglich materialisiertem Completion-Output
   - zweiter Completion-Callback desselben Runs → No-op
   - aktueller Run → Output + State + Spiegel wie heute
   - `sceneId` ohne vollständigen Run-Snapshot → gar kein Scene-Write
   - Probe mit falscher/NULL `job_id` → No-op, Slot & Szene unverändert
   - Probe mit korrekter `job_id` → Hard-Fail mit `failed` +
     `needs_clip_rerender` + Spiegeln
   - Probe mit korrektem Job, aber ohne Slot-Run-Snapshot → kein State-Write
5. Contract-Tests (Slot-Immutability inkl. `job_id`-Reset-Nachweis,
   Spiegel-Parität) + `tsgo`, Bericht in `docs/v431-g2-report.md`.
6. **STOP vor G2.3.**



## Baseline für den Bericht

- Relevante Composer-/Lip-Sync-Suite: 445 Tests grün, `tsgo` grün.
- 39 rote Tests in 37 unberührten UI-Test-Dateien sind dokumentierte
  Vorher-Baseline, kein G2-Regressionsbefund.
