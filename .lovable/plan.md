## Diagnose

Der Provider ist nicht mehr aktiv: Für Szene `69d56a49-8f59-42ab-ab06-8868f0b42db1` sind alle vier Lip-Sync-Ausgaben seit 21:15 UTC fertig. Sie hängen ausschließlich im neuen Qualitätsstatus `motion_probe_pending`.

Der Grund ist bestätigt:
- Die Qualitätsprüfung startet aktuell nur im Frontend-Hook `useMouthYavgProbe`.
- Dieser Hook ist nur in `SceneClipProgress` eingebaut, die aktuelle Editor-/Szenenansicht rendert jedoch `SceneInlinePlayer`.
- Deshalb wurde `report-lipsync-motion-probe` kein einziges Mal aufgerufen.
- Der Watchdog überwacht Provider- und Mux-Hänger, besitzt aber keinen Timeout-/Recovery-Pfad für `motion_probe_pending`.

Darum zeigt die UI weiter „Pass 1/4“, obwohl Sync.so bereits alle vier Passes geliefert hat.

## Umsetzung

1. **Probe unabhängig von der geöffneten Ansicht starten**
   - `useMouthYavgProbe` an der zentralen Szenenebene des Video Composers einhängen, sodass jeder laufende Lip-Sync geprüft wird – unabhängig davon, ob Clips-Tab, Editor oder Inline-Player sichtbar ist.
   - Die bestehende Job-ID-basierte Idempotenz beibehalten, damit kein Pass doppelt freigegeben wird.

2. **Frontend-State vollständig aktualisieren**
   - Sicherstellen, dass `dialog_shots.passes[]`, `output_url`, `job_id`, `motion_probe_status` und `yavg_probed_at` DB-first in den lokalen Scene-State übernommen werden.
   - Die Anzeige aus dem tatsächlichen Passstatus ableiten, damit vier fertige Provider-Passes nicht mehr als „Pass 1/4“ erscheinen.

3. **Serverseitigen Motion-Probe-Watchdog ergänzen**
   - `lipsync-watchdog` erkennt Passes, die mit fertiger `output_url` zu lange in `motion_probe_pending` stehen.
   - Er stößt eine serverseitige Probe/Recovery an, statt auf einen geöffneten Browser zu vertrauen.
   - Wenn eine Probe technisch nicht möglich ist, wird der Lauf kontrolliert beendet und einmalig erstattet – kein endloser 95%-Status.

4. **Aktuell hängende Szene retten**
   - Nach Deployment die vier vorhandenen Outputs der Szene erneut durch den Probe-Pfad schicken.
   - Bei bestandenen Probes direkt den Audio-Mux auslösen; bei statischem Output die bestehende NOOP-Retry-Leiter verwenden.
   - Keine neue Video- oder Lip-Sync-Berechnung starten, solange die vorhandenen Ergebnisse verwertbar sind.

5. **Regression absichern**
   - Test: Editoransicht ohne Clips-Tab startet die Probe trotzdem.
   - Test: geschlossener/aktualisierter Browser kann keinen dauerhaften `motion_probe_pending`-Hänger verursachen.
   - Test: vier bestandene Passes lösen den Mux genau einmal aus.
   - Test: Probe-Timeout führt zu Retry oder idempotenter Erstattung statt Endlosschleife.