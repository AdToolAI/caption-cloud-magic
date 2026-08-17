# FA-4/P0 — Sync Fan-out: Invariante festschreiben, Tests, STOP vor Deploy

Der Fix-Contract ist gelockt. Der Kern (`segment_id = dialog_turn.id`, kein Schema-Change, kein Ledger-RPC-Redesign) ist im Code bereits umgesetzt. Dieser Schritt schreibt die neue Implementierungsinvariante hart fest, härtet den fail-closed-Pfad, räumt das Dokument auf und führt die Tests aus. Kein Deploy.

## 1. Pass↔Turn-Bindung als Invariante erzwingen

Heute entsteht die Bindung bereits am kanonischen Iterationsschritt (`passSpeakers.map` → `turns.map` in `compose-dialog-segments`), und der Split erbt exakt die `segment_id` seines eigenen Turns. Was fehlt, ist die harte Absicherung:

- Der Guard gilt ausschließlich für **turn-backed** Passes (siehe Abschnitt 2). Für diese muss vor dem ersten turn-backed Ledger-Acquire gelten: Anzahl turn-backed Passes = Anzahl `dialog_turns`; jede `dialog_turn.id` genau einmal; keine fremde ID; keine doppelte ID; keine NULL-ID.
- Verletzung → fail-closed mit eigenem Grund (`fa4_p0_turn_pass_mismatch`), bevor irgendein Provider-Dispatch oder Acquire passiert.
- Kein Fallback über `speaker_idx`, `character_id`, Name oder Text — auch nicht als Notlösung. Wiederholte Sprecher (Sarah Turn 1 / Turn 5) ergeben zwei getrennte Jobs mit unterschiedlicher `segment_id` und identischer Geometrie.

## 2. v194-Stabilizer — geklärt (read-only belegt)

Nachweis aus dem heutigen Dispatcher: Stabilizer-Passes tragen bereits zwei explizite Flags, die beim Erzeugen gesetzt und an mehreren Stellen als Erkennungsmerkmal verwendet werden — `stabilizer_pass === true` **und** `is_silent_stabilizer === true` (`compose-dialog-segments/index.ts`: gesetzt bei der Stabilizer-Injektion, geprüft im Tight-WAV-Pfad und im Silent-Gate-Bypass). Sie laufen im selben Dispatch-Pfad und erzeugen damit ebenfalls `stage='sync_segment'`-Ledger-Rows.

Damit gilt festgezogen:

- **Turn-backed Sync-Jobs**: jeder kanonische Dialog-Turn erzeugt genau einen turn-backed `sync_segment`-Job mit `segment_id = dialog_turn.id`.
- **Stabilizer-Jobs**: bleiben unverändert separate, nicht-turn-backed `sync_segment`-Jobs mit ihrer bestehenden deterministischen Segmentidentität. Sie dürfen nie eine `dialog_turn.id` verwenden oder die Turn-ID-Menge schneiden.
- Kardinalitätsinvariante: `set(turn_backed_sync_segment.segment_id) == set(dialog_turns.id)` — **nicht** über alle `sync_segment`-Rows.
- Die Klassifikation turn-backed vs. stabilizer erfolgt ausschließlich über die bestehenden Pass-Flags, nie über „ID liegt nicht in `dialog_turns`" — sonst würden fehlerhafte Turn-Jobs als Stabilizer durchgewunken.
- Stabilizer werden separat validiert (deterministische ID vorhanden, keine Kollision mit Turn-IDs) und beeinflussen den Gleichheitscheck nicht.
- Keine Änderung der Stabilizer-Semantik.

## 3. Dokument-Cleanup

`docs/v433-motion-studio-final-acceptance.md` (FA-4/P0-Abschnitt) wird bereinigt: alte/überlagerte Formulierungen raus, doppelte Abschnitte 5/6 zusammenführen, nur die gelockte Fassung bleibt stehen, ergänzt um die Pass↔Turn-Iterationsinvariante, die turn-backed-Kardinalität und die Stabilizer-Abgrenzung (inkl. Hinweis für spätere Audits: gezählt werden 6 turn-backed Dialog-Jobs plus ggf. separate Stabilizer-Rows, nicht „insgesamt 6 sync_segment-Rows").

## 4. Tests (read-only, kein Render, kein Deploy)

- Unit/Logik: N Turns → N turn-backed Passes, `segment_id` je Pass = Turn-ID desselben Iterationsschritts.
- Wiederholter Sprecher: Sarah Turn 1 und Turn 5 ergeben zwei verschiedene `segment_id`, gleiche `speaker_idx`.
- `segment_id = NULL` auf turn-backed `sync_segment` → Dispatch blockiert (`fa4_p0_preflight_blocked`), kein Provider-Call.
- Adoption: falsche `segment_id` → `preacquired_segment_mismatch`; gleiche Turn-ID beim Retry → Adoption derselben Zeile.
- `audio_mux` bleibt genau ein Job mit `segment_id = NULL`.
- Mismatch-Fall (turn-backed Passes ≠ `dialog_turns`) → fail-closed vor Acquire.
- **Stabilizer-Regression (verpflichtend)**: 6 Dialog-Turns + vorhandene v194-Stabilizer → exakt 6 turn-backed `sync_segment`-Jobs mit `segment_id == dialog_turn.id`; Stabilizer behalten ihre deterministische Identität; keine Stabilizer-ID schneidet die Turn-ID-Menge; kein Turn wird wegen eines Stabilizers als `already_completed`/`already_in_flight` geskippt; Stabilizer-Semantik unverändert.


Danach: STOP mit Testbericht, kein Deploy, kein Render.

## Technische Details

- Betroffen: `supabase/functions/compose-dialog-segments/index.ts` (Preflight + Mismatch-Guard), ggf. `supabase/functions/_shared/v431-ledger.ts` (Adoptionsprüfung bereits vorhanden), `docs/v433-motion-studio-final-acceptance.md`.
- Kein Schema-Change, keine neue Spalte, keine Änderung an `composer_pipeline_jobs`-Unique-Key oder Callback-Pfad (bleibt `pipeline_job_id`-geführt).
- `plate_generation` bleibt Fence/Provenance.
