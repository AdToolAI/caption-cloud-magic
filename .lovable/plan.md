# V455 — HappyHorse-Filter transparent machen und Retry-Watchdog reparieren

## Bestätigter Live-Stand

- Szene `be60d106…` ist nicht beim Anchor hängen geblieben: Der neue Anchor wurde um 23:27:59 mit vier erkannten Personen freigegeben.
- Der erste HappyHorse-Videoversuch scheiterte um 23:28:15 am Provider-Sicherheitsfilter (`DataInspectionFailed`).
- Die vorhandene Auto-Recovery startete um 23:28:17 korrekt Versuch 2 mit Job `qg87…`.
- Dieser zweite Job steht auch um 23:39:57 noch unverändert auf `dispatched`; die Szene ist deshalb weiterhin `clip_status=generating`, `twoshot_stage=master_clip`, `lip_sync_status=pending` und hat keinen terminalen Fehler.
- Der Provider meldete für Versuch 1 ausschließlich `Green net check failed for text (input): Input data may contain inappropriate content`. Er lieferte kein beanstandetes Wort und keinen konkreten Satz. Eine genauere inhaltliche Ursache ist aus der Providerantwort nicht belegbar.
- Der effektive Prompt enthält keine offensichtlich unzulässigen Inhalte. Auffällig sind jedoch zahlreiche harte Negativformulierungen wie `no cuts`, `no lip-flap`, `no chewing`, `no humans` und `no rendered text`; welche davon den externen Klassifikator ausgelöst hat, bleibt ohne Providerdetail unbestimmt.
- Die 10-Minuten-Recovery ist fehleranfällig: `qa-watchdog` misst das Alter anhand von `composer_scenes.updated_at`, nicht anhand des aktiven Pipeline-Jobs. Obwohl Retry 2 seit 23:28:17 unverändert ist, wurde die Szene zuletzt um 23:36:22 aktualisiert. Dadurch wird die Recovery-Uhr zurückgesetzt und der festhängende Job nicht rechtzeitig ausgewählt.

## Vorgehen

1. **Aktiven Versuch ohne Doppel-Render auflösen**
   - Der aktuelle Run bleibt die einzige autoritative Generation.
   - Den aktuellen Providerstatus des gespeicherten Prediction-IDs serverseitig abfragen und je nach echtem Status den vorhandenen Callback wiedergeben, weiterlaufen lassen oder terminal mit idempotentem Refund beenden.
   - Keinen Parallel-Run und keine weitere Abbuchung erzeugen.

2. **Watchdog-Alter an die autoritative Job-Zeit binden**
   - Stale-Erkennung für Base-Video-Retries aus `composer_pipeline_jobs.created_at/updated_at` des aktiven `dispatched`-Jobs ableiten.
   - Beliebige Szenen-Updates dürfen die Recovery-Frist nicht mehr zurücksetzen.
   - Run-ID, Pipeline-Job-ID und Prediction-ID vor jeder Recovery erneut abgleichen, damit ein alter Watchdog keinen neuen Run überschreibt.

3. **Provider-Filter korrekt behandeln**
   - `DataInspectionFailed`/Green-Net als terminalen Input-Filterfehler für genau diesen Prompt behandeln, statt denselben Payload automatisch erneut einzureichen.
   - Die bestehende Sanitization auf klar strukturierte, kurze positive Bewegungs- und Framing-Anweisungen begrenzen; keine semantisch unnötigen Negativlisten an HappyHorse senden.
   - Da der Provider keinen Trigger nennt, in UI und Logs ehrlich den vollständigen verfügbaren Filtergrund anzeigen, ohne ein angeblich schuldiges Wort zu erfinden.

4. **Recovery und Regression verifizieren**
   - Erfolg: `base_video` wird `succeeded`, danach beginnt erst der Lip-Sync.
   - Terminaler Provider-Fehler: Szene wird sauber beendet und der idempotente Refund-Pfad geprüft.
   - Mit Zeitversatz-Test belegen: Szenen-Metadaten ändern sich, aber ein seit >10 Minuten unveränderter aktiver Job wird trotzdem gefunden.
   - Testen, dass Green-Net keinen identischen Auto-Retry auslöst und ausschließlich der aktuelle Run `8254bf8b…` den Szenenstatus verändern darf.

## Akzeptanz

- Kein Doppel-Render und keine zusätzliche Belastung durch vorschnelles manuelles Neustarten.
- Der aktive Versuch wird anhand seines echten Providerstatus genau einmal kontrolliert aufgelöst.
- Die UI bleibt nicht unbegrenzt auf „Scene is being built…“ stehen.
- Bei einem Provider-Sicherheitsfilter sieht der Nutzer den tatsächlich verfügbaren Grund; derselbe abgelehnte Payload wird nicht automatisch erneut gesendet.
