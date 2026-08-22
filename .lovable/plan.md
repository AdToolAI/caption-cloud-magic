# V443 — Szene starb an einer kaputten Messung, nicht an schlechtem Lip-Sync

## Was wirklich passierte (belegt aus Logs + DB, Lauf 16:00–16:06 UTC, S11, Plate-Generation 9)

Die Kette war fast fertig: Platte fertig (15:58), alle 6 Sync-Pässe rausgeschickt, **5 von 6 erfolgreich**. Gescheitert ist nur Pass 1 (Sarah) — und zwar nicht, weil der Lip-Sync schlecht war:

```text
16:00:03  Pass 0 (Sarah) an Sync.so dispatcht
16:01:32  Bewegungsmessung schlaegt fehl:
          status=unmeasurable verdict=indeterminate
          reason=motion_probe_indeterminate:provider_"Unexpected end of JSON input"
16:01:34  v403-Regel: INDETERMINATE -> ssw:noop_fail  (harter, endgueltiger Fehlschlag)
16:05:41  Szene terminal: lip_sync_status=failed, Refund 960 Credits
16:05:44  Re-Messung DERSELBEN gepinnten Ausgabe von Pass 0:
          delta_mean=130.7 > Schwelle 15.4  -> verdict=motion  (also GUT)
16:05:45  zu spaet: "conflicting_duplicate" / ignored_due_scene_failed
```

Kurz: Der Pass war in Ordnung. Nur die *Messung* ist an einem Transportfehler (leere/abgeschnittene Antwort der Frame-Extraktion) gestorben, und V441 wertet „nicht messbar" seit dem letzten Gate als „kaputt" — ohne Wiederholung. Vier Minuten später hat dieselbe Datei die Messung sauber bestanden.

Ein Infrastruktur-Fehler der Messung ist kein Beweis für einen schlechten Lip-Sync. Genau das ist der Defekt.

## Fix (V443)

1. **Messfehler von Messergebnis trennen.** `indeterminate` wird aufgeteilt:
   - `probe_infra_error` (leere Antwort, JSON-Abbruch, HTTP-/Extract-Fehler, Timeout) — kein Urteil über den Clip.
   - `measured_ambiguous` (Messung lief, Wert liegt im Graubereich) — bleibt wie heute.
2. **Bounded Re-Measure statt Sofort-Fail.** Bei `probe_infra_error` wird die Messung auf dem bereits unveränderlich gepinnten Provider-Output (v434-Pin, existiert nachweislich) bis zu 2-mal mit kurzem Backoff wiederholt. Kein neuer Provider-Call, keine zusätzlichen Kosten.
3. **Fail-open nach erschöpfter Messung.** Bleibt die Messung nach den Wiederholungen unmöglich, wird der Pass als `succeeded (motion_unverified)` durchgelassen statt die ganze Szene zu töten. Der Grund landet als Telemetrie in `syncso_dispatch_log`. Nur ein *gemessenes* Noop-Ergebnis darf noch terminalisieren.
4. **Watchdog-Nachmessung.** `lipsync-watchdog` misst Pässe mit `motion_unverified` einmal nach; ergibt die Messung dann echtes Noop, greift der bestehende Noop-Pfad — jetzt aber mit Beweis.
5. **Refund bleibt idempotent** — keine Änderung an Beträgen oder Buchungslogik.

## Warum das eine Freigabe braucht

`sync-so-webhook` und `lipsync-watchdog` stehen unter dem Lip-Sync-Feature-Freeze (v400). Diese Änderung fällt in die Kategorie „Datenverlust/P0": ein vollständiger, bezahlter 6-Pass-Lauf wird durch einen einzelnen Messfehler vernichtet. Ich brauche dafür deine ausdrückliche Freigabe für genau diesen Scope — die vier Invarianten (Anchor-Kohärenz, Run-Identität, Run-Guard, Assignment-Lock) und alle Schwellenwerte bleiben unangetastet.

## Verifikation

- Ein Lauf mit erzwungenem Probe-Fehler terminalisiert die Szene nicht mehr, sondern liefert `motion_unverified` mit Nachmessung.
- Ein Lauf mit echtem Noop (gemessen) failt weiterhin wie heute.
- S11 danach genau einmal neu rendern; erwartet: 6/6 Pässe, Mux, fertiger Clip.
