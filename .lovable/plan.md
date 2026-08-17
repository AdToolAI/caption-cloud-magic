# FA-4/P0 — Sync Fan-out: Invariante festschreiben, Tests, STOP vor Deploy

Der Fix-Contract ist gelockt. Der Kern (`segment_id = dialog_turn.id`, kein Schema-Change, kein Ledger-RPC-Redesign) ist im Code bereits umgesetzt. Dieser Schritt schreibt die neue Implementierungsinvariante hart fest, härtet den fail-closed-Pfad, räumt das Dokument auf und führt die Tests aus. Kein Deploy.

## 1. Pass↔Turn-Bindung als Invariante erzwingen

Heute entsteht die Bindung bereits am kanonischen Iterationsschritt (`passSpeakers.map` → `turns.map` in `compose-dialog-segments`), und der Split erbt exakt die `segment_id` seines eigenen Turns. Was fehlt, ist die harte Absicherung:

- Vor jedem Ledger-Acquire: Prüfung, dass die Menge der `segment_id` der aktiven Sync-Passes eindeutig ist (keine Duplikate) und ausschließlich aus `dialog_turns.id` der Szene stammt.
- Stimmen Anzahl oder Zuordnung nicht eindeutig überein → fail-closed mit eigenem Grund (`fa4_p0_turn_pass_mismatch`), bevor irgendein Provider-Dispatch passiert.
- Kein Fallback über `speaker_idx`, `character_id`, Name oder Text — auch nicht als Notlösung. Wiederholte Sprecher (Sarah Turn 1 / Turn 5) ergeben zwei getrennte Jobs mit unterschiedlicher `segment_id` und identischer Geometrie.

## 2. Offener Punkt: v194-Stabilizer

Der Contract sagt „keine synthetischen UUIDs" und `set(sync_segment.segment_id) == set(dialog_turns.id)`. Die stillen v194-Stabilizer-Passes sind aber ebenfalls `sync_segment`-Jobs und haben per Definition keinen eigenen `dialog_turn`. Aktuell bekommen sie eine deterministische UUID aus `(scene, listenerIdx)`.

Vorschlag (Standard, wenn nichts anderes gesagt wird): Stabilizer behalten ihre deterministische Identität, und die Kardinalitätsinvariante wird präzisiert auf die aktiven Dialog-Passes:
`set(sync_segment.segment_id WHERE pass ist aktiv) == set(dialog_turns.id)`, Stabilizer zählen separat und dürfen die Turn-Menge nicht schneiden. Alternative wäre, Stabilizer aus dem Ledger herauszuhalten — das wäre ein Eingriff in die Lip-Sync-Kette und ist hier nicht Scope.

## 3. Dokument-Cleanup

`docs/v433-motion-studio-final-acceptance.md` (FA-4/P0-Abschnitt) wird bereinigt: alte/überlagerte Formulierungen raus, doppelte Abschnitte 5/6 zusammenführen, nur die gelockte Fassung bleibt stehen, ergänzt um die Pass↔Turn-Iterationsinvariante und die Stabilizer-Präzisierung.

## 4. Tests (read-only, kein Render, kein Deploy)

- Unit/Logik: N Turns → N Passes, `segment_id` je Pass = Turn-ID desselben Iterationsschritts.
- Wiederholter Sprecher: Sarah Turn 1 und Turn 5 ergeben zwei verschiedene `segment_id`, gleiche `speaker_idx`.
- `segment_id = NULL` auf `sync_segment` → Dispatch blockiert (`fa4_p0_preflight_blocked`), kein Provider-Call.
- Adoption: falsche `segment_id` → `preacquired_segment_mismatch`; gleiche Turn-ID beim Retry → Adoption derselben Zeile.
- `audio_mux` bleibt genau ein Job mit `segment_id = NULL`.
- Mismatch-Fall (Turns ≠ Passes) → fail-closed vor Acquire.

Danach: STOP mit Testbericht, kein Deploy, kein Render.

## Technische Details

- Betroffen: `supabase/functions/compose-dialog-segments/index.ts` (Preflight + Mismatch-Guard), ggf. `supabase/functions/_shared/v431-ledger.ts` (Adoptionsprüfung bereits vorhanden), `docs/v433-motion-studio-final-acceptance.md`.
- Kein Schema-Change, keine neue Spalte, keine Änderung an `composer_pipeline_jobs`-Unique-Key oder Callback-Pfad (bleibt `pipeline_job_id`-geführt).
- `plate_generation` bleibt Fence/Provenance.
