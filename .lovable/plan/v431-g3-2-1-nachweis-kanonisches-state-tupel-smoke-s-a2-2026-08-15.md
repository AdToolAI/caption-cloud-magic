# v431 G3.2.1 — Nachweis kanonisches State-Tupel (Smoke S-A2)

Kein Redeploy, kein Code-Change an Functions oder Frontend, kein G3.2.2.

## Befund zur Frage

Der vorhandene 19/19-Smoke **belegt deine vier Felder noch nicht vollständig**. Die
Zusicherung für die erlaubten Fälle prüft nur:

- `pipeline_state` (nach Apply gleich dem Ausgangs-State)
- `pipeline_substate` (vorher/nachher identisch)

`pipeline_state_at` und `pipeline_state_run_id` wurden **nicht** verglichen. Der vollständige
Row-Diff existiert nur für die Duplicate- und die Rejected-Fälle, nicht für den Apply-Fall.
Die Bestätigung, die du willst, kann ich daher aus den vorliegenden Daten nicht geben.

Zwei stützende Beobachtungen aus dem Code, die die Erwartung untermauern, aber den Nachweis
nicht ersetzen:

- Die Bridge (`composer_scene_state_bridge`) schreibt `pipeline_state_run_id` an keiner Stelle —
  weder im Legacy-Ableitungszweig noch im State-Change-Zweig. Sie berührt nur `pipeline_state`,
  `pipeline_state_at`, `pipeline_substate`, `pipeline_substate_at` und die Legacy-Spiegel.
- Der Compatibility-Pfad in RPC A schreibt `pipeline_state_run_id` ebenfalls nicht.

Ein Restrisiko bleibt trotzdem messbar: Die Restore-Anweisung im Compatibility-Pfad ist selbst
ein State-Write und läuft damit erneut durch den `state_changed`-Zweig der Bridge. Ob dabei ein
weiterer Trigger auf der Tabelle das Run-Feld anfasst, ist nur empirisch zu klären.

## Was gemacht wird

Ein additiver DB-Smoke **S-A2**, gleiche Bauart wie der bestehende: eigenes Fixture-Projekt,
Ausführung, danach vollständige Löschung aller Fixture-Zeilen. Kein Produktionsdatensatz wird
angefasst, keine bestehende Funktion neu definiert.

Geprüft werden alle vier erlaubten From-States in beiden Spiegel-Varianten
(`mirrors_consistent`, `mirrors_stale`), also 8 Fälle:

1. Vollständiger Vorher/Nachher-Vergleich des kanonischen Tupels:
   `pipeline_state`, `pipeline_substate`, `pipeline_state_at`, `pipeline_state_run_id`.
   - Für `plate_ready`, `audio_prep`, `audio_ready`: alle vier Felder **exakt identisch**.
   - Für `plate_rendering`: echte Transition, dokumentiert statt eingefroren
     (`state → plate_ready`, `state_at` neu gestempelt, `state_run_id` = aktiver Run).
2. `pipeline_state_run_id` ist im Fixture explizit auf den aktiven Run gesetzt und muss nach dem
   Apply weiterhin genau darauf zeigen — kein `NULL`, kein Fremdwert.
3. Zusätzliche Absicherung gegen einen zwischenzeitlich runless Legacy-Bridge-Write: Vor dem
   RPC-Aufruf wird im selben Fixture ein reiner Legacy-Write ausgelöst, damit die Bridge
   nachweislich einmal ableitet, bevor A gerufen wird. Danach dieselbe Tupel-Prüfung.
4. Ausgabe pro Fall als Vorher/Nachher-Paar je Feld, damit der Beweis lesbar ist und nicht nur
   als Boolean.

Erwartetes Ergebnis: keine Änderung an RPC A nötig. Sollte `pipeline_state_run_id` in einem Fall
doch driften, wird das als Befund berichtet und der Fix (Aufnahme des Feldes in die
Restore-Anweisung) **separat zur Freigabe gestellt** — nicht eigenmächtig eingebaut.

## Bericht

`docs/v431-g3-2-1-report.md` bekommt den S-A2-Abschnitt mit der Feld-Matrix, und der Status
wechselt von `PATCHED / AWAITING REDEPLOY-GO` auf **`PATCHED / AWAITING PRODUCTION RESMOKE`**,
mit dem expliziten Vermerk: Redeploy ist nicht erforderlich, da A per RPC gerufen wird und
`compose-clip-webhook` die unveränderte Signatur nutzt.

## Danach

STOP. Der echte Plate-Produktionssmoke wird erst nach deiner Freigabe gestartet und dann gegen
die von dir genannte Kette geprüft: `applied = true` → Job `succeeded` → Outputs materialisiert →
State bei vorgezogenem `audio_prep`/`audio_ready` unverändert → Observe `bound`.

## Technisch

- Eine Migration mit reinem `DO`-Block (Smoke + Cleanup) plus temporärer Ergebnistabelle, die am
  Ende wieder entfernt wird. Keine `CREATE OR REPLACE FUNCTION` auf Pipeline-Funktionen.
- Fixture setzt `active_run_id`, `pipeline_state_run_id` und `plate_generation` konsistent, damit
  die Guard-Kette regulär passiert und nicht an `stale_run` scheitert.
- Verifikation danach: eingefrorener Suite-Command
  `npx vitest run src/lib/composer src/lib/video-composer --testTimeout=60000` (Erwartung 540) und
  `npx tsgo --noEmit`. Der vorbestehende `deno check`-Fehler in `_shared/ambient-audio.ts:83`
  bleibt unangetastet und wird weiter als offene Schuld geführt.
