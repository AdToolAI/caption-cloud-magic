## Der neue Vertrag

„Clip generieren" bedeutet ab sofort: **Der alte Job wird vollständig beendet und gelöscht, bevor der neue überhaupt beginnt.** Kein Artefakt, kein Provider-Auftrag und kein Zustandsfeld aus dem vorherigen Lauf überlebt den Klick.

Damit ist der belegte Fehler vom 02.08. strukturell ausgeschlossen: Dort lief die Lip-Sync-Kette um 11:04:42 noch auf der Plate von gestern 21:28, während die Neuerzeugung ab 11:04:35 erst startete und ihr Ergebnis um 11:08:57 lieferte.

## Umsetzung v373

### 1. Abbruchphase vor jedem Neustart
Beim Klick läuft zuerst eine abgeschlossene Aufräumphase. Der neue Job startet erst, wenn diese vollständig durch ist:

- Laufende Provider-Aufträge der Szene bei Sync.so und beim Videomodell abbrechen.
- Belegte Provider-Slots und Dispatch-Sperren der Szene freigeben.
- Offene Credit-Reservierungen der Szene auflösen beziehungsweise erstatten.
- Alle Lip-Sync-Zustandsfelder, Passzähler, Zwischenstufen und Fehlermeldungen leeren.
- Alle Artefakte der Szene löschen: Plate, Preclips, Anchorbilder, Trackingdaten, Passvideos, Zwischen-Voiceover.
- Erst danach den neuen Lauf eröffnen.

### 2. Generationsnummer als Abgrenzung
- Jeder Neustart erhöht eine Generationsnummer der Szene.
- Alle Artefakte des Laufs liegen unter einem Pfad mit dieser Nummer, nichts wird mehr überschrieben.
- Jeder Provider-Auftrag trägt die Nummer mit sich.
- Ein verspäteter Webhook einer alten Generation wird verworfen und protokolliert, statt den neuen Lauf zu beeinflussen. Genau das hatte zuletzt die frische Szene fehlschlagen lassen.

### 3. Lip-Sync startet erst nach fertiger Plate
- Der Lip-Sync-Start wird serverseitig vom Render-Abschluss ausgelöst.
- Der Client-Poller startet nichts mehr, er zeigt nur noch an.
- Vor dem Provider-Dispatch wird geprüft, dass die verwendete Plate zur aktuellen Generation gehört.

### 4. Eindeutige Phasen im Zustand
Ein Statusfeld mit festen Übergängen ersetzt das heutige Nebeneinander mehrerer Felder:

```text
idle → cleanup → plate_rendering → plate_ready
     → lipsync_running → muxing → done
                       ↘ failed (terminal)
```

- Übergänge nur vorwärts und nur an den erwarteten Vorzustand gekoppelt.
- Terminalzustände bleiben bestehen, bis der Nutzer neu startet.
- Der aktuelle Widerspruch dieser Szene, Clipstatus „fertig" bei Lip-Sync „fehlgeschlagen", ist damit nicht mehr darstellbar.

### 5. Oberfläche
- Nach dem Klick zeigt die Szene zuerst kurz „Alter Job wird verworfen", dann „Video wird erzeugt", dann „Lip-Sync läuft (Pass x/y)", dann „Zusammenführen".
- Bei Fehlschlag bleibt es beim Fehlschlag, ohne Fortschrittsbalken und ohne Rücksprung auf „läuft".
- Kostet der Neustart Video-Credits, wird das vor der Bestätigung angezeigt.

### 6. Absicherung
- Watchdog bricht eine hängende Aufräumphase nach einer festen Frist ab und meldet sie klar, statt stillschweigend den alten Zustand weiterlaufen zu lassen.
- Tests: Klick während laufender Passes beendet diese nachweislich; kein Provider-Aufruf vor fertiger Plate; alter Webhook lässt neuen Lauf unberührt; nach Neustart existiert kein Artefakt der Vorgängergeneration mehr.
- Praxisnachweis: Der erste Preclip-Zeitstempel liegt nach dem Zeitstempel der fertigen Plate, und alle Passartefakte tragen dieselbe Generationsnummer.