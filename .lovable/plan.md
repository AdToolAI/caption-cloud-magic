## Was wirklich kaputt ist (belegt, Szene `9eded574-…`)

Pass 1/4 ist sauber fertig (`verdict=moved`, `output_url` gesetzt). Pässe 2–4 stehen auf `pending` **ohne** `job_id` — nie an Sync.so geschickt. Slots 0/3, also kein Provider-Stau.

```
19:15:43  Pass 1 dispatcht        (Szene noch lipsync_dispatched)
19:15:47  Szene -> lipsync_running
19:15:49  fanout self_invoke pass=2,3,4 -> 3x HTTP 409
          v378_terminal_guard ... state=lipsync_running
19:16–19:21 Watchdog alle 60 s -> jedes Mal derselbe 409
```

`canDispatchLipsync()` erlaubt nur `audio_ready` und `lipsync_dispatched`. Sobald Pass 1 die Szene auf `lipsync_running` hebt, hält der v378-Guard **jede weitere Pass-Invocation** für eine terminale Szene. Der Fan-out feuert 2 Sekunden nach dem Zustandswechsel — daher reproduzierbar Stillstand bei 1/4 bzw. 2/4.

## Die saubere Lösung: zwei Verträge trennen, nicht den Guard aufweichen

Der Denkfehler ist eine Ebenenverwechslung: der **Szenen-Zustand** beschreibt die Phase (läuft Lip-Sync?), der **Pass-Slot** beschreibt die Arbeitseinheit (ist dieser Pass offen?). Heute prüft der Pass-Dispatch den Szenen-Zustand, als wäre er ein Pass-Zustand.

Deshalb *nicht*: `lipsync_running` einfach in `canDispatchLipsync` aufnehmen (verwischt Start und Fortsetzung), und *nicht*: den Zustandswechsel nach hinten schieben (Race bleibt, nur mit anderem Zeitfenster).

Stattdessen ein expliziter zweiter Vertrag:

1. **`_shared/scene-state.ts`**
   - `canDispatchLipsync` bleibt exakt wie heute — Start-Gate (`audio_ready`, `lipsync_dispatched`).
   - Neu `canContinueLipsync(row)` — Fortsetzungs-Gate: `lipsync_dispatched` **oder** `lipsync_running`, weiterhin nur mit `isRealizedScene` (Plate der aktuellen Generation). `failed`, `canceled`, `complete`, `lipsync_muxing` bleiben ausgeschlossen.
   - Der Frontend-Zwilling `src/lib/composer/sceneState.ts` bekommt dieselbe Funktion, damit beide Seiten semantisch identisch bleiben.

2. **`compose-dialog-segments/index.ts`** — der v378-Guard bekommt einen expliziten Modus statt einer impliziten Annahme:
   - `mode = (advance === true || pass_idx != null) ? "continue" : "start"`.
   - `start` prüft gegen `canDispatchLipsync`, `continue` gegen `canContinueLipsync`.
   - Unverändert scharf bleiben: `active_run_id`-Fence, Generations-Fence (`plate_ready_generation === plate_generation`) und Abbruch bei `dialog_shots.status ∈ {failed, canceled}` — eine fehlgeschlagene Szene startet und setzt weiterhin nichts fort.
   - Zusätzliche Pass-Ebenen-Prüfung im `continue`-Pfad: der adressierte Pass muss existieren und nicht-terminal sein (kein `output_url`, Status nicht `done`/`failed`/`canceled`) — sonst 409 mit `pass_already_terminal`. Damit kann ein verspäteter Retry keinen fertigen Pass mehr anfassen (v141-Invariante).
   - Logzeile um `mode=` und `pass=` erweitert; ein 409 ist danach ohne Ratespiel zuzuordnen.

3. **Kein Zombie-Lock**: bricht der Guard einen Fortsetzungs-Aufruf ab, wird der vorher belegte `v168_per_pass_lock` im `finally` freigegeben. Heute bleibt er bis zum TTL liegen und blockiert den nächsten Watchdog-Versuch zusätzlich.

4. **`lipsync-watchdog/index.ts`**: der Rettungspfad ruft `advance` immer mit explizitem `pass_idx` des ältesten `pending`-Passes ohne `job_id` auf — damit läuft die Recovery über denselben, jetzt korrekten Fortsetzungsvertrag statt über einen impliziten Neustart.

5. **Regressionstest** `_shared/scene-state.test.ts`: `lipsync_running` darf nicht starten, aber fortsetzen; `failed`/`canceled`/veraltete Generation dürfen weder noch. Dazu ein Dispatcher-Test, der den Fan-out-Selbstaufruf im Zustand `lipsync_running` simuliert und 2xx erwartet.

6. **Deploy & Recovery**: `compose-dialog-segments`, `lipsync-watchdog`, `sync-so-webhook` deployen, danach die hängende Szene `9eded574…` über den Watchdog-Pfad nachlaufen lassen — ohne dass der Kunde erneut auf „Clip generieren" klickt und ohne neue Plate-Kosten.

## Technische Hinweise

- Keine Änderung an `composer_scene_transition()` und an der Übergangstabelle. Die Szene bleibt während aller Pässe korrekt `lipsync_running`; erst der letzte Pass führt nach `lipsync_muxing`.
- Der Fix ist strukturell, nicht zeitabhängig: er greift für N=2…4, für die Retry-Leiter und für den Watchdog, weil alle drei denselben `advance`-Pfad benutzen.
- Nach dem Deploy prüfbar an einem einzigen Signal: im Log erscheinen für dieselbe Szene vier `v193_fanout_self_invoke … status=200` statt `409`.
