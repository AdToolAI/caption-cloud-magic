# v431 — Antworten auf die drei G0-Vorfragen + G0-Auftrag

Alle Aussagen unten sind an Code und Datenbank nachgeprüft (Stand heute). Es wurde nichts geändert.

## Antwort 1 — Wo findet die Run-Identitätsprüfung heute wirklich statt?

Kurzfassung: **atomar nur dort, wo `transitionScene()` mit `runId`/`generation` aufgerufen wird — das sind 2 von 11 Aufrufstellen.** Alle anderen state-tragenden Pfade prüfen entweder vorher in JavaScript (TOCTOU) oder gar nicht.

| Pfad | Guard vor dem Write | Guard in der RPC | nur `.eq("id", sceneId)` | Bewertung |
| --- | --- | --- | --- | --- |
| `transitionScene()` mit `runId`/`generation` (nur `composer-start-scene-generation:200/255`) | — | **ja**, `FOR UPDATE` + `active_run_id` + `plate_generation` | nein | einzig sauberer Pfad heute |
| `transitionScene()` ohne `runId` (9 Stellen, u. a. `generate-composer-image-scene` 5×, `composer-cancel-*`, `hybrid-extend-scene`) | — | Übergangstabelle + Zeilensperre, **aber kein Run-Abgleich** (Parameter ist optional und wird nicht übergeben) | effektiv ja | Run-blind, aber wenigstens transitionsgeprüft |
| `failSceneState()` | — | nein (ruft `transitionScene` ohne `runId`, ohne `from`, ohne `generation`) | effektiv ja | Run-blind |
| `sync-so-webhook` | **ja, in JS**: liest `dialog_shots`, bildet `knownJobIds` aus `shots[].sync_job_id`, `passes[].job_id`, `ds.sync_job_id` und verwirft unbekannte Jobs (`run_guard_discarded`, Zeile 386–397) | nein | ja | **TOCTOU**: Prüfung auf einem separat gelesenen Snapshot, Write danach ohne Bedingung. Der v5-Block liegt in `withDialogLock()`, aber der Kommentar bei Zeile 487 hält ausdrücklich fest: „on contention we proceed without it" — der Lock ist Best-Effort, kein Vertrag |
| `remotion-webhook` | **nein** — `render_job_id` aus `customData` wird nur für die Render-Tabelle (`.eq('render_id', pendingRenderId)`) benutzt; der Szenen-Write bei 237/278 läuft über `.eq('id', composerSceneId)` | nein | ja | **kein Run-Guard überhaupt**; höchstes Risiko, weil hier der Complete-Übergang hängt |
| `compose-dialog-segments` | **teilweise, in JS**: `try_acquire_dialog_lock` (TTL 120 s, Fehlschlag wird toleriert) plus Pass-Claim mit Re-Read von `passes[].status`/`job_id` (4450–4494) | nein | ja | optimistisch, nicht atomar; der Lock schützt `dialog_shots`, **nicht** `pipeline_state` |
| `lipsync-watchdog` | **ja, in JS**: Staleness-Auswertung über `passes[].job_id`/`status` vor dem Write | nein | ja (`.eq("id", d.id)`) | TOCTOU; besonders kritisch, weil der Watchdog genau in Race-Fenster hineinläuft |

Konsequenz für das Dossier: der Satz „kein Writer prüft atomar" bleibt richtig, ist aber zu grob. Er wird in drei Klassen aufgeteilt und im Inventar als Feld `guardKind` geführt:

- `rpc-atomic` — Prüfung in derselben Transaktion wie der Write (heute: 2 Stellen)
- `pre-write-js` — Prüfung vorhanden, aber TOCTOU-Fenster (sync-so-webhook, lipsync-watchdog, compose-dialog-segments)
- `none` — kein Run-Bezug (remotion-webhook und die Mehrzahl der Failure-Pfade)

## Antwort 2 — Was garantieren `transitionScene()` / `failSceneState()` heute atomar?

Vertrag von `public.composer_scene_transition()` (nachgelesen aus der DB):

1. `SELECT … FOR UPDATE` auf die Szene → Zeilensperre, alle folgenden Prüfungen und der Write laufen in einer Transaktion.
2. Berechtigung: `can_edit_composer_project()` **nur wenn `auth.uid()` nicht NULL ist** — Service-Role-Aufrufe (alle Edge-Funktionen) überspringen die Prüfung.
3. `_run_id` → `stale_run`, wenn `active_run_id` abweicht. **Optional**: bei NULL findet keine Prüfung statt.
4. `_generation` → `stale_generation` gegen `plate_generation`. Ebenfalls optional.
5. `_from` → `unexpected_state`. Optional.
6. Übergangstabelle `composer_scene_transitions` (73 Zeilen) → `transition_not_allowed`. **Nicht optional**, das ist die einzige immer wirksame Prüfung.
7. Write: `pipeline_state`, `pipeline_detail`, `pipeline_state_run_id`, `pipeline_substate`, `updated_at`.

Was der Vertrag **nicht** garantiert:

- **Der Run-Guard ist Opt-in, nicht Pflicht.** Genau die Eigenschaft, die du nicht mehr willst — „hoffentlich hat der Caller den richtigen Guard gesetzt" — steckt heute schon im Primitive selbst.
- **`failSceneState()` hat gar keinen Run-Guard**: es ruft `transitionScene()` nur mit `detail` auf. Ein verspäteter Failure-Callback eines alten Laufs kann eine frische Szene terminal setzen, solange die Übergangstabelle den Sprung erlaubt.
- **Zustand und Fehlertext sind nicht atomar.** `clip_error` und die Legacy-Spiegel werden in einem eigenen `.update()` geschrieben; die Kommentare im Modul sagen das ausdrücklich.
- **`pipeline_detail` und `pipeline_substate` sind per `COALESCE` nur setzbar, nie löschbar.** Ein Substate aus einem alten Pass bleibt stehen, bis ihn jemand überschreibt.
- **Der v391-Lückenfüller ist nicht atomar.** Ein Sprung über mehrere Kettenschritte wird als Folge einzelner RPC-Aufrufe nachgeholt; jeder Schritt ist für sich atomar, die Kette nicht. Bricht sie mittendrin ab, bleibt die Szene in einem Zwischenzustand.
- **Zwei Überladungen existieren** (`composer_scene_transition/6` ohne, `/7` mit `_substate`). Heute gewinnt die 7er, weil alle Aufrufe `_substate` mitgeben; die 6er ist toter, aber aufrufbarer Code — und sie besitzt zusätzlich das `set_config('composer.transition_scene', …)`-Verhalten, das die 7er nicht hat.

Damit ist dein Einwand bestätigt: **G0 darf nicht nur direkte Writes durch Wrapper ersetzen.** Zuerst muss das Primitive selbst run-sicher werden, sonst migrieren wir 83 Writes auf eine Fassade mit demselben Loch.

## Antwort 3 — Recovery-Primitive: welcher Run darf recovern?

Deine sechs Forderungen werden vollständig übernommen und sind so umsetzbar. Präzisierung an zwei Punkten:

- **`expected_run_id` / `expected_plate_generation` sind Pflichtparameter**, nicht optional. Für nachweislich verwaiste Läufe (`active_run_id IS NULL`) gibt es einen eigenen expliziten Grund (`orphaned_run`), der nicht bedeutet „Prüfung aus", sondern „erwarteter Zustand ist: kein aktiver Lauf". Ein Aufruf mit NULL-Run und einer Szene, die einen aktiven Lauf hat, ist damit ein Stale-Fall.
- **Stale-Recovery ist ein No-op mit Rückgabewert**, keine Exception und keine Zustandsänderung: `applied=false, reason='stale_run' | 'stale_generation'`, Auditzeile mit `outcome='stale'`. Die Szene bleibt unangetastet — der Watchdog darf nicht in der Lage sein, durch eigene Verspätung Schaden anzurichten.

## G0 — Auftrag (nach Freigabe)

**G0.1 — Run-Guard im Kernprimitive verpflichtend machen**
- `transitionScene()` bekommt eine Pflichtangabe zur Run-Bindung: entweder `runId`/`generation` oder ein ausdrückliches `runGuard: 'not-applicable'` mit Begründung. Kein stilles NULL mehr.
- `failSceneState()` erhält dieselbe Pflicht und reicht `runId` durch.
- Ein Contract-Test verbietet neue Aufrufe ohne Run-Bindung.
- Bestandsaufrufe werden in G0 noch nicht inhaltlich umgestellt: sie bekommen die explizite `not-applicable`-Markierung, damit die Schuld sichtbar und zählbar ist statt unsichtbar.

**G0.2 — `composer_scene_transition` bereinigen**
- Die 6-Argument-Überladung entfernen (nachweislich kein Aufrufer).
- `_detail`/`_substate` löschbar machen (explizites Sentinel statt reinem `COALESCE`), damit Reste alter Pässe verschwinden.
- Zustand und Fehlertext in derselben Transaktion schreiben (`_error_text`-Parameter), damit „failed ohne Grund" nicht mehr entstehen kann.
- Rückgabegrund um `stale_run`/`stale_generation` erweitert protokollieren.

**G0.3 — `composer_recover_scene()`**
- Signatur: `(_scene_id, _expected_run_id, _expected_generation, _target ∈ {failed, canceled}, _reason composer_recovery_reason, _actor text)`.
- Ablauf in einer Transaktion: `FOR UPDATE` → Run-/Generationsabgleich → Ziel-Whitelist → Write → Auditzeile.
- Auditzeile mit `from_state`, `to_state`, `run_id`, `generation`, `reason`, `actor`, `outcome ∈ {applied, stale, rejected}`.
- Stale = No-op, protokolliert, kein Szenenfehler.
- `hybrid-extend-scene` (Ziel `idle`) und `qa-weekly-deep-sweep` (Ziel `plate_ready`) bekommen den Primitive **nicht**; sie gehen auf legalen Übergang bzw. `scene-hard-reset.ts`.

**G0.4 — Nachweise**
- Fixture-Test: verspäteter Callback eines alten Runs verändert nichts (je einmal über `transitionScene`, `failSceneState`, `composer_recover_scene`).
- Fixture-Test: Recovery mit passendem Run setzt terminal und erzeugt genau eine Auditzeile.
- Dossier-Update: neue Spalte `guardKind` (`rpc-atomic` / `pre-write-js` / `none`) im Inventar und in der TS-Fixture; TOCTOU-Fenster bei `sync-so-webhook`, `lipsync-watchdog` und `compose-dialog-segments` ausdrücklich markiert; `remotion-webhook` als „kein Run-Bezug" hervorgehoben.

Keine Migration von Writern in G0. G1 startet erst, wenn G0.4 grün ist.
