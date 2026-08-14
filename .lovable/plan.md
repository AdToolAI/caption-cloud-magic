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
4. **Ungekoppelte Nebenpfade.** Reine State-Writes ohne Output (Refund-Fail,
   Early-Fail) laufen über `transitionSceneV2()` (`run_bound`,
   `expected_generation`); ein stale oder gecancelter Run darf weder Output
   löschen noch die Szene auf `failed` ziehen.

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

## Umsetzungsreihenfolge nach GO

1. Migration: `job_id`-Immutability-Erweiterung in `update_dialog_pass_slot`
   (inkl. explizit erlaubtem Reset-Pfad) und — falls für die atomare Variante
   gewählt — das Talking-Head-Finalisierungs-Primitive mit Row Lock.
2. `generate-talking-head`: geguardete Output-Updates (Run + Generation +
   From-State) + `transitionSceneV2()` für `plate_rendering` / `plate_ready` /
   `failed`; fail-closed bei fehlender Provenienz.
3. `report-lipsync-motion-probe`: Job-Slot-Match-Gate + geguardeter Hard-Fail,
   fail-closed ohne Slot-Run-Snapshot.
4. Smokes auf echter DB:
   - alter Run schreibt `plate_ready` → 0 Zeilen, Output unverändert, kein State
   - **Cancel-Race (verpflichtend):** Run A aktiv → User-Cancel → verspätetes
     Talking-Head-Completion für Run A → weder Output noch State ändern sich
   - aktueller Run → Output + State wie heute
   - `sceneId` ohne vollständigen Run-Snapshot → gar kein Scene-Write
   - Probe mit falscher/NULL `job_id` → No-op, Slot & Szene unverändert
   - Probe mit korrekter `job_id` → Eskalation/Hard-Fail wie heute
   - Probe mit korrektem Job, aber ohne Slot-Run-Snapshot → kein State-Write
5. Contract-Tests (Slot-Immutability inkl. `job_id`-Reset-Nachweis) + `tsgo`,
   Bericht in `docs/v431-g2-report.md`.
6. **STOP vor G2.3.**


## Baseline für den Bericht

- Relevante Composer-/Lip-Sync-Suite: 445 Tests grün, `tsgo` grün.
- 39 rote Tests in 37 unberührten UI-Test-Dateien sind dokumentierte
  Vorher-Baseline, kein G2-Regressionsbefund.
