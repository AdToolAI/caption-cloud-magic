# V455 — Aktiven HappyHorse-Retry überwachen und begrenzt recovern

## Bestätigter Live-Stand

- Szene `be60d106…` ist nicht beim Anchor hängen geblieben: Der neue Anchor wurde um 23:27:59 mit vier erkannten Personen freigegeben.
- Der erste HappyHorse-Videoversuch scheiterte um 23:28:15 am Provider-Sicherheitsfilter (`DataInspectionFailed`).
- Die vorhandene Auto-Recovery startete um 23:28:17 korrekt Versuch 2 mit Job `qg87…`.
- Dieser zweite Job steht aktuell noch auf `dispatched`; die Szene ist deshalb weiterhin `clip_status=generating`, `twoshot_stage=master_clip`, `lip_sync_status=pending` und hat keinen terminalen Fehler.
- Die sichtbaren sieben Minuten enthalten Anchor-Erstellung und den bereits ersetzten ersten Versuch; Versuch 2 läuft erst seit etwa fünf Minuten.

## Vorgehen

1. **Keinen weiteren manuellen Rerender starten**
   - Der aktuelle Run bleibt die einzige autoritative Generation.
   - Damit werden weder ein Parallel-Run noch eine weitere Abbuchung erzeugt.

2. **Bis zur bestehenden 10-Minuten-Recovery-Grenze prüfen**
   - Status des aktiven Pipeline-Jobs und neue Provider-Callbacks erneut lesen.
   - Erwartetes Zeitfenster für den Recovery-Check: ungefähr 23:38 UTC, gerechnet ab Versuch 2.

3. **Nur bei echtem Stillstand recovern**
   - Falls Versuch 2 bis dahin weiterhin `dispatched` ohne Callback ist, den bestehenden `recover-stuck-composer-clip`-Pfad genau einmal für diese Szene auslösen.
   - Falls der Provider bereits Erfolg oder Fehler gemeldet hat, stattdessen diesen Callback-Zustand verarbeiten und keinen zusätzlichen Job erzeugen.

4. **Ergebnis verifizieren**
   - Erfolg: `base_video` wird `succeeded`, danach beginnt erst der Lip-Sync.
   - Terminaler Provider-Fehler: Szene wird sauber beendet und der idempotente Refund-Pfad geprüft.
   - Zusätzlich bestätigen, dass ausschließlich der aktuelle Run `8254bf8b…` den Szenenstatus verändern darf.

## Akzeptanz

- Kein Doppel-Render und keine zusätzliche Belastung durch vorschnelles manuelles Neustarten.
- Der aktive Versuch wird entweder fortgesetzt oder nach der Recovery-Grenze genau einmal kontrolliert wiederaufgenommen.
- Die UI bleibt nicht unbegrenzt auf „Scene is being built…“ stehen.
