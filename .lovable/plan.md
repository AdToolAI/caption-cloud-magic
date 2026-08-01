## Bestätigte Ursache

Der letzte Run für Szene `6bf4e815…` hängt **vor dem Sync.so-Aufruf**:

- `lip_sync_status = pending`
- Pass 0 steht seit 21:29 UTC auf `rendering_preflight`
- Es existiert weder eine Sync.so-Job-ID noch ein Eintrag in `syncso_inflight_jobs`
- Die Sync.so-Auslastung ist daher korrekt `0/3`
- `compose-dialog-segments` meldet wiederholt `BUSY — another dispatcher holds the (scene,pass) lock`
- Der Watchdog erkennt den Zustand nicht, weil der erste Preclip-Lauf abbrach, bevor der vollständige v5-Fanout-Zustand gespeichert wurde

Damit ist nicht Sync.so blockiert, sondern ein **verwaister Preclip-Dispatch-Lock mit einem halbfertigen `rendering_preflight`-Status**.

## Umsetzung

1. **Stale-Preflight-Recovery im Lip-Sync-Watchdog**
   - Auch Szenen mit vorhandenem Quellclip und `pending`/`dialog_shots` scannen.
   - Einen Pass als verwaist erkennen, wenn er länger als 3 Minuten auf `rendering_preflight` steht, keine `job_id` besitzt und somit Sync.so nie erreicht hat.
   - Nur den betroffenen Pass atomar auf `pending` zurücksetzen; fertige oder parallele Geschwister bleiben unangetastet.

2. **Verwaisten Dispatch-Lock sicher entfernen**
   - Nur den Lock derselben `(scene_id, pass_idx)`-Kombination löschen.
   - Frische Locks niemals übernehmen; Bereinigung ausschließlich nach derselben Stale-Schwelle.
   - Anschließend `compose-dialog-segments` idempotent erneut anstoßen.

3. **Diagnostik und Schutz vor Endlosschleifen**
   - Recovery-Zeitpunkt und Pipeline-Version `v362` am Pass protokollieren.
   - Watchdog-Log `v362_stale_preflight_recovered` mit Pass, Alter und Invoke-Status ergänzen.
   - Bestehende terminale Pass- und Szenen-Guards beibehalten.

4. **Aktuellen festhängenden Run retten**
   - Nach Deployment den verwaisten Pass/Lock der bestätigten Szene über denselben Recovery-Pfad bereinigen.
   - Watchdog bzw. Dispatcher einmal auslösen.
   - Prüfen, dass entweder eine echte Sync.so-Job-ID entsteht oder ein konkreter terminaler Preclip-Fehler statt „Lip-Sync wird gestartet…“ angezeigt wird.

5. **Validierung**
   - Datenbankstatus, Dispatch-Log und `syncso_inflight_jobs` kontrollieren.
   - Sicherstellen, dass bei `0/3` freien Slots kein alter Lock weitere Aufrufe blockiert.
   - Den Fall „Edge-Lauf stirbt nach Preflight-Claim, aber vor Provider-Dispatch“ als Regressionstest abdecken.