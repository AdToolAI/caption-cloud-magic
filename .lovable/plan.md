# Selektiver Restore auf den Stand vom 27.07.2026

**Bestätigte Referenz:** Commit `58060cffe2a6506da8485e599439950a9d219c25` vom **27.07.2026, 23:45 UTC**. Es wird **kein kompletter Projekt-Revert** und kein History-Rollback durchgeführt.

## 1. Lip-Sync-Pipeline exakt zurücksetzen

- Die serverseitige Dialog-/Lip-Sync-Kette wird dateibezogen auf den bestätigten Referenzstand zurückgeführt:
  - Dialogsegment-Aufbau und Preclip-Rendering
  - Sync.so Face-Gate und Dispatch
  - Provider- und Clip-Webhooks
  - Watchdog und Motion-Probe-Reporting
- Seit dem 27.07. neu hinzugefügte v317–v341-Komponenten werden aus dem aktiven Pfad entfernt, insbesondere Face-Motion-Tracking, globale Mouth-Probe-Koordination und die neue Differential-Probe.
- Neue Dateien, die am Referenzstand nicht existierten und ausschließlich diese spätere Pipeline implementieren, werden entfernt.
- Bei gemeinsam genutzten Frontend-Dateien werden **nur Lip-Sync-bezogene Änderungen** zurückgenommen; spätere Arbeiten an Branding, Credits, Stimmen, Cast & World, Autopilot und anderen Studio-Funktionen bleiben erhalten.

## 2. Motion Studio selektiv zurücksetzen

Die Prüfung zeigt nur vier nach dem Referenzstand veränderte Motion-Studio-Kerndateien:

- `VoicePicker`
- `syncCastFromPrompt`
- Motion-Studio `Hub`
- Motion-Studio-Typen

Diese werden auf den Stand vom 27.07. zurückgeführt. Andere spätere Änderungen außerhalb dieses klaren Motion-Studio-Scopes bleiben unangetastet.

## 3. Kompatibilität statt blindem Datei-Revert

- Imports und Typen werden an den heutigen Rest des Projekts angepasst, falls spätere unabhängige Änderungen sonst den Build brechen würden.
- Keine Datenbanktabellen, Auth-, Stripe-, Credit-, Landingpage-, UCC-, Autopilot- oder Cast-&-World-Arbeiten werden zurückgesetzt.
- Es werden keine Git-History-Aktionen ausgeführt; der Restore erfolgt als gezielte Codeänderung auf dem aktuellen Stand.

## 4. Backend ausrollen und Altzustände bereinigen

- Alle tatsächlich zurückgesetzten Lip-Sync-Funktionen werden gemeinsam deployed, damit Frontend und Backend nicht verschiedene Pipeline-Versionen verwenden.
- Bereits hängende v339–v341-Jobs werden nicht weiterverarbeitet. Sie werden über den bestehenden idempotenten Fehler-/Refund-Pfad beendet, damit keine Credits verloren gehen und keine alten Motion-Probe-Zustände die restaurierte Pipeline blockieren.
- Keine neuen Tabellen oder Migrationen sind vorgesehen.

## 5. Verifikation vor Abschluss

- Relevante Unit-Tests und Typechecks für den restaurierten Pfad ausführen.
- Einen Einzelsprecher- und einen Mehrsprecher-Fall gegen die restaurierte Pipeline prüfen.
- Kontrollieren, dass kein `motion_probe_pending`, `preclip_face_share_too_low` oder v341-Differential-Gate mehr im aktiven Ablauf hängt.
- Motion Studio öffnen und Voice-Auswahl, Prompt/Cast-Synchronisierung sowie Generierungsstart prüfen.
- Erst nach erfolgreicher End-to-End-Prüfung den Restore als abgeschlossen melden.