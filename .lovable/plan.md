# v431 — G2.4 Analyse & Scope (hybrid-extend-scene)

Reiner Scope-Bericht. Keine Migration, keine Code-Änderung in diesem Schritt.

## Befund 1 — `hybrid-extend-scene:idle` ist eine Falschklassifikation

`supabase/functions/hybrid-extend-scene/index.ts:194` schreibt `pipeline_state: "idle"` **nicht** als Transition, sondern als Feldwert im `INSERT` der neuen Szene (Zeilen 183–204). Es gibt keine Vorgängerzeile, keinen From-State, keinen Run.

Konsequenz für das Inventar:
- Eintrag `hybrid-extend-scene:idle` in `docs/v431-prep-inventory.md` (Zeile 89) und in `src/lib/composer/__tests__/fixtures/v431LegacyWriteInventory.ts` (Zeile ~947) wird als `insert-default` reklassifiziert bzw. aus dem State-Writer-Inventar entfernt.
- Ebenso zu korrigieren: die Einstufung „3 — Recovery-Override / kein legaler Übergang“ (Inventar Zeile 161). Sie beschreibt einen Reset auf beliebige Bestandszeilen — das passiert hier nachweislich nicht.
- Damit sinkt der Writer-Count um 1; keine Runless-Ausnahme, kein Grandfathering nötig.

## Befund 2 — Run-Akquise ist heute nicht fail-closed

Nach dem INSERT holt die Funktion den kanonischen Run über `composer-start-scene-generation { prepare_only: true }` (Zeilen 216–246). Der `catch` ist bewusst weich (G2.1): bei Fehlschlag läuft der Pfad ohne `run_context` weiter, `compose-video-clips` erzeugt dann seinen Legacy-Run.

Für G2.4 ist das der eigentliche Blocker: die Failure-Pfade können nur dann run-gebunden schreiben, wenn der Run vor der Frame-Extraktion garantiert existiert.

## Befund 3 — die drei echten Failure-Pfade

Alle drei laufen heute über `markSceneFailed()` → `transitionScene(admin, sceneId, "failed", …)` (Zeile 414), also id-only, ohne Run/Generation, ohne atomaren Legacy-Spiegel.

| writeId | Ort | Auslöser | Erlaubter From-State | Ziel | Provenienz heute | Spiegel |
|---|---|---|---|---|---|---|
| `hybrid:frame-extract-failed` | Z. 294–296 | `extractFrame()` wirft | `plate_queued` | `failed` | keine | nein |
| `hybrid:no-anchor` | Z. 298–301 | kein `startAnchor` produziert | `plate_queued` | `failed` | keine | nein |
| `hybrid:dispatch-failed` | Z. 350–353 | `compose-video-clips` antwortet non-2xx | nur `plate_queued` — sonst No-op | `failed` | keine | nein |

Nicht im Scope, aber benannt: der äußere `catch` (Zeile 367–369) markiert die Szene gar nicht als `failed` — er loggt nur. Das ist eine getrennte Lücke (Szene bleibt hängen) und gehört fachlich zu G4/Recovery, nicht zu G2.4; ich führe sie im Bericht als bekannte Restschuld.

## Befund 4 — `prepare_only` erzeugt keine Credit-Reservation (geprüft)

`composer-start-scene-generation` mit `prepare_only: true` durchläuft nur Ownership-Check, `startSceneRun()`, `hardResetScene()` und den Eintritt nach `plate_queued`. Es gibt in dieser Funktion keinen Aufruf von `reserveRunCredits()`/`composer_reserve_run_credits`; der einzige Aufrufer im gesamten Functions-Baum ist `compose-video-clips` (`_shared/v427-credit-contract.ts` wird nur dort importiert).

Folge: ein fehlgeschlagener Run-Erwerb und die drei Hybrid-Failure-Pfade vor dem Dispatch können keine hängende Reservation hinterlassen — es gibt keine. Die einzige Credit-Bewegung im Prepare-Pfad ist die `refundDecision` des `hardResetScene()` für den **vorherigen** Lauf, die unverändert nach bestehendem Vertrag läuft. `hybrid:dispatch-failed` betrifft nur den Fall, in dem `compose-video-clips` nicht mit 2xx antwortet; die dortige Reservation wird weiterhin durch die bestehende Settle/Release-Logik in `compose-video-clips` selbst behandelt — G2.4 fasst sie nicht an.

## Zielvertrag G2.4

1. Run-Akquise wird **fail-closed**: schlägt `prepare_only` fehl, startet weder Frame-Extraktion noch Provider-Dispatch.
2. **Kein Zombie bei Run-Akquise-Failure.** Vor dem Abbruch löscht die Funktion die soeben angelegte Szene über ein streng geguardetes Compensating-Delete: `id = <die eben zurückgegebene newSceneId>` **und** `pipeline_state = 'idle'` **und** `active_run_id IS NULL` **und** `clip_status = 'pending'`. Trifft der Guard nicht (Zeile bereits fortgeschritten oder fremd berührt), wird nichts gelöscht und der Fall geloggt (`hybrid_cleanup_skipped`), damit kein fremder Zustand zerstört wird. Kein neues DB-Primitive, kein atomarer Insert+Run-Erwerb in G2.4 (bleibt notierte Verbesserung für später). Antwort in beiden Fällen: definierter Fehler `hybrid_run_acquire_failed` mit `cleaned: true|false`.
3. Die drei Failure-Pfade schreiben über das bestehende Primitive `composer_fail_scene_with_mirrors` mit `_run_id` / `_generation` aus der Akquise und eigener `_write_id` (`hybrid:frame-extract-failed`, `hybrid:no-anchor`, `hybrid:dispatch-failed`). Kein neues Primitive, keine neue Signatur — S1-Signatur bleibt eindeutig, `_clear_lip_sync_fields` wird **nicht** verwendet (Allowlist bleibt auf `cvc:failed/pika`).
4. **From-State-Semantik.** `frame-extract-failed` und `no-anchor` laufen aus dem unmittelbar nach Run-Start erwarteten `plate_queued`. `hybrid:dispatch-failed` setzt `failed` nur, wenn Run + Generation noch stimmen **und** die Szene weiterhin in `plate_queued` steht. Ist sie durch den Downstream bereits weiter (`plate_rendering`, `failed`, `canceled`, …), erfolgt kein erzwungenes Überschreiben: No-op mit Grund `unexpected_state`, bestehender Zustand bleibt erhalten, HTTP-Fehler an den Client bleibt.
5. Stale/falsche Generation → keine Mutation an Output- und Legacy-Feldern; `markSceneFailed()` ohne Run entfällt ersatzlos.
6. Kein Sonder-Run-Pfad, kein `beginSceneRun()` in Hybrid; die Weitergabe als `run_context` an `compose-video-clips` bleibt unverändert.


## Verifikation, die zu G2.4 gehört

- Unit/Fixture: Inventar-Fixture ohne `hybrid-extend-scene:idle`, Count-Assertion angepasst.
- Transaktionaler DB-Smoke pro writeId: `applied`, `stale run`, `falsche Generation`, `falsche write_id`, zusätzlich für `dispatch-failed` der Fall „Szene steht bereits auf `plate_rendering`/`failed`" → No-op — inkl. Nachweis, dass bei allen Ablehnungen weder Output- noch Legacy-Spiegel mutiert werden (Muster wie S3).
- Cleanup-Nachweis: Run-Akquise-Failure → Szenenzeile existiert danach nicht mehr; Gegenprobe mit fortgeschrittener Zeile → kein Delete, `hybrid_cleanup_skipped` geloggt.
- Frozen-Suite mit demselben exakten Command wie die G2.3-Baseline (527 Tests) plus `tsgo`.
- Danach: G2 komplett DONE / FROZEN.

## Offene Punkte, die G2.4 bewusst nicht anfasst

- `compose-dialog-segments` Deferred-Refund (kein Transaction-Key, keine Idempotenz, Wallet read-modify-write) — bleibt eigener Credit-Gate-Track vor G3/G4.
- Äußerer Catch-all in `hybrid-extend-scene` ohne Fail-Write — Kandidat für G4.

## Reihenfolge danach

G2.4 → G3 (Webhooks/Fan-in) → G4 + Credit-Gate → G5 → T1 → G6 → CW1.

Freigabe hier bedeutet: Umsetzung von G2.4 nach genau diesem Vertrag, dann Bericht und STOP.
