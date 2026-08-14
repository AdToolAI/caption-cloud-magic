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

## Antwort 4 — Wie wird `not-applicable` daran gehindert, ein Bypass zu werden?

Durch eine **geschlossene Grundmenge plus namentliche Allowlist**, nicht durch ein Flag. Typvertrag wie von dir vorgeschlagen:

```ts
export type RunlessTransitionReason =
  | 'user_cancel'          // Nutzer bricht Szene/Projekt ab, unabhängig vom laufenden Run
  | 'project_teardown'     // Projektabbruch, Szene wird kollektiv terminal
  | 'pre_run_dispatch'     // Übergang VOR Vergabe einer Run-ID (idle → plate_queued)
  | 'runless_generator';   // Generator ohne Run-Ledger (heute nur generate-composer-image-scene)

export type RunGuard =
  | { kind: 'run'; runId: string; generation: number }
  | { kind: 'not-applicable'; reason: RunlessTransitionReason; writeId: string };
```

Harte Regeln:

- `writeId` muss eine ID aus dem v431-Inventar sein; der Contract-Test prüft das gegen `V431_RUNLESS_ALLOWLIST`. Jeder neue `not-applicable`-Aufruf ohne Allowlist-Eintrag macht den Test rot.
- **Callback-, Webhook-, Render- und Watchdog-Pfade dürfen `not-applicable` nie verwenden.** Der Scanner-Test verbietet die Konstante in `*webhook*`, `*watchdog*`, `sync-so-*`, `remotion-*`, `render-*` und `recover-*` grundsätzlich — dort gibt es immer einen Run, dessen Identität nachweisbar ist.
- Jede Ausnahme braucht im Dossier einen Satz, warum dieser Übergang nachweislich zu keinem Run gehört.

Kandidatenliste heute (11 `transitionScene`-Aufrufe, geprüft):

| Write-ID | Grund | Begründung |
| --- | --- | --- |
| `composer-cancel-scene:canceled` | `user_cancel` | Nutzeraktion; soll gerade unabhängig vom laufenden Run greifen |
| `composer-cancel-project:canceled` | `project_teardown` | Kollektiver Abbruch über alle Szenen |
| `composer-start-scene-generation:plate-queued` / `:dispatch-failed` | **kein Runless** — hat bereits `runId` + `generation` | bleibt `kind: 'run'` |
| `generate-composer-image-scene` (5×) | `runless_generator` | Bild-Szenengenerator läuft heute ohne Run-Ledger-Eintrag; Debt-Eintrag mit Ziel, ihn in G2 an `composer_start_scene_run()` anzuschließen |
| `hybrid-extend-scene:failed` | **kein Runless** | gehört zum Extend-Lauf; wird in G4 auf `kind: 'run'` gehoben, bis dahin bleibt es ein offen markierter Befund, kein Allowlist-Eintrag |

Damit ist die Ausnahmemenge klein, benannt, begründet und schrumpfend — kein beschriftetes Loch.

## Antwort 5 — Kann die 6-Argument-Überladung sicher gelöscht werden?

**Nein, nicht mit dem heutigen Beweisstand.** Gemessen:

- Beide Überladungen haben `EXECUTE` für `anon`, `authenticated` und `service_role` — die 6er ist über die Data API **von außen aufrufbar**, PostgREST wählt sie anhand der übergebenen Argumentnamen. Repo-Freiheit von Aufrufern beweist also nichts über echte Clients.
- `pg_stat_statements` (Schema `extensions`) enthält **keinen** Eintrag für die Funktion — weder für die 6er noch für die 7er. Das Fenster ist damit nicht aussagekräftig, nicht „bewiesen ungenutzt".

Konsequenz — dein Vorschlag wird übernommen: **in G0 kein Drop.** Stattdessen:

1. 6er-Überladung als deprecated markieren (Kommentar + `RAISE LOG 'v431_legacy_overload_call scene=% caller=%'`).
2. Sie intern auf die neue geguardete Implementierung delegieren, damit sie kein zweiter, ungeprüfter Pfad bleibt — mit `guard_mode = 'runless'` und Grund `legacy_overload`, der seinerseits nur die heute schon erlaubten Übergangsklassen zulässt.
3. `EXECUTE` für `anon` entziehen (kein legitimer Browser-Client ruft Zustandsübergänge direkt auf) — das ist reversibel und verkleinert die Angriffsfläche sofort.
4. Beobachtungsfenster bis G6; Drop nur, wenn das Log über die Zeit leer bleibt.

## Antwort 6 — Guard-Modus in `composer_scene_transition()` selbst

Übernommen, das ist die eigentliche Reparatur. Neue Signatur mit **Pflichtparameter** `_guard_mode`:

```sql
composer_scene_transition(
  _scene_id    uuid,
  _to          composer_scene_state,
  _guard_mode  composer_transition_guard_mode,   -- 'run_bound' | 'runless'  (PFLICHT)
  _run_id      uuid    default null,
  _generation  integer default null,
  _runless_reason composer_runless_reason default null,
  _from        composer_scene_state[] default null,
  _detail      text default null,
  _substate    text default null,
  _clear_detail   boolean default false,
  _clear_substate boolean default false,
  _error_text  text default null
)
```

Vertrag in der Funktion, alles unter demselben `FOR UPDATE`:

- `guard_mode = 'run_bound'`: `_run_id` **und** `_generation` müssen beide gesetzt sein — fehlt eines, `reason = 'guard_incomplete'`, kein Write. Beide werden gegen `active_run_id` und `plate_generation` geprüft (`stale_run` / `stale_generation`). Kein halber Guard mehr.
- `guard_mode = 'runless'`: `_runless_reason` ist Pflicht und muss im Enum liegen; zusätzlich muss der Übergang in einer eigenen Tabelle `composer_runless_transitions (reason, from_state, to_state)` erlaubt sein. `_run_id`/`_generation` müssen NULL sein — sonst `reason = 'guard_conflict'`.
- **Kein stilles NULL mehr**: ein Aufruf ohne `_guard_mode` schlägt schon an der Signatur fehl.
- Bleibt bestehen: Übergangstabelle, Zeilensperre, `can_edit_composer_project()` bei nicht-NULL `auth.uid()`.
- Neu atomar im selben Statement: `pipeline_state`, `pipeline_substate`, `pipeline_detail`, `pipeline_state_run_id`, **`clip_error`** (`_error_text`) sowie das explizite Löschen von Detail/Substate über die beiden `_clear_*`-Flags.

Damit kann kein Aufrufer — auch kein direkter RPC-Aufruf an der TypeScript-Fassade vorbei — mehr einen run-blinden Übergang ausführen.

## G0 — Auftrag (nach Freigabe)

**G0.1 — DB-Kernvertrag (`composer_scene_transition`)**
- Enums `composer_transition_guard_mode`, `composer_runless_reason`; Tabelle `composer_runless_transitions` mit den heute legitimen runlosen Klassen.
- Neue Funktionsversion gemäß Antwort 6, inklusive `clip_error`-Atomizität und löschbarem Detail/Substate.
- 6er-Überladung: deprecaten, instrumentieren, auf `runless/legacy_overload` delegieren, `anon`-EXECUTE entziehen. **Kein Drop.**

**G0.2 — TypeScript-Fassade**
- `RunGuard`-Union aus Antwort 4; `transitionScene()`/`failSceneState()` verlangen ihn als Pflichtargument.
- `failSceneState()` reicht Run und Fehlertext durch; keine getrennten `clip_error`-Updates mehr aus dem Helfer.
- Contract-Test mit `V431_RUNLESS_ALLOWLIST`; Scanner-Test verbietet `not-applicable` in Webhook-/Watchdog-/Render-/Recover-Dateien.
- Die 11 Bestandsaufrufe werden gemäß Tabelle in Antwort 4 zugeordnet — 2 bleiben `run`, 7 werden allowlisted, `hybrid-extend-scene` bleibt offener Befund für G4.

**G0.3 — `composer_recover_scene()`**
- Signatur: `(_scene_id, _expected_run_id, _expected_generation, _target ∈ {failed, canceled}, _reason composer_recovery_reason, _actor text)`; `_expected_*` sind Pflicht, `orphaned_run` ist der ausdrückliche Grund für „erwartet: kein aktiver Lauf".
- Ablauf in einer Transaktion: `FOR UPDATE` → Run-/Generationsabgleich → Ziel-Whitelist → Write → Auditzeile.
- Auditzeile mit `from_state`, `to_state`, `run_id`, `generation`, `reason`, `actor`, `outcome ∈ {applied, stale, rejected}`.
- Stale = No-op mit `applied=false`, protokolliert, kein Szenenfehler.
- `hybrid-extend-scene` (Ziel `idle`) und `qa-weekly-deep-sweep` (Ziel `plate_ready`) bekommen den Primitive **nicht**; sie gehen auf legalen Übergang bzw. `scene-hard-reset.ts`.

**G0.4 — Nachweise**
- DB-Test: `run_bound` ohne Generation → `guard_incomplete`, kein Write. `runless` mit Run-ID → `guard_conflict`. `runless` mit nicht gelisteter Klasse → abgelehnt.
- Fixture-Test: verspäteter Callback eines alten Runs verändert nichts (je einmal über `transitionScene`, `failSceneState`, `composer_recover_scene`).
- Fixture-Test: Recovery mit passendem Run setzt terminal und erzeugt genau eine Auditzeile.
- Regressionstest: bestehende Übergänge der 11 Aufrufstellen verhalten sich unverändert (Vorher/Nachher-Matrix über die Übergangstabelle).
- Dossier-Update: Spalte `guardKind` (`rpc-atomic` / `pre-write-js` / `none`) im Inventar und in der TS-Fixture; TOCTOU-Fenster bei `sync-so-webhook`, `lipsync-watchdog` und `compose-dialog-segments` markiert; `remotion-webhook` als „kein Run-Bezug" hervorgehoben; Allowlist-Begründungen je Ausnahme.

Keine Migration von Writern in G0. G1 startet erst, wenn G0.4 grün ist.

