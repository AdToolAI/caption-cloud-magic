## Befund

Der aktuell deployte Backend-Code ist noch alt: Die Logs zeigen eindeutig `At least 3 voice samples required` in `clone-voice`, obwohl die Datei im Projekt bereits auf mindestens 1 Sample geändert wurde. Der Fehler ist also kein UI-Problem, sondern ein nicht aktualisierter Deployment-Stand der Function.

## Plan

1. **Kleinen No-op/Versionsmarker in `clone-voice` setzen**
   - Damit Lovable Cloud die Function sicher als geändert erkennt.
   - Die Mindestanforderung bleibt: 1 Sample, mindestens 30 Sekunden Gesamtaufnahme über die UI.

2. **Fehlerantworten sauberer machen**
   - Statt pauschal `500` bei Validierungsfehlern gibt die Function klare Statuscodes und lesbare JSON-Fehler zurück.
   - Die UI kann dann statt „Edge Function returned a non-2xx status code“ die echte Ursache anzeigen.

3. **Function direkt deployen und testen**
   - `clone-voice` nach der Änderung gezielt neu deployen.
   - Danach Logs prüfen, ob die alte `At least 3 voice samples required`-Version verschwunden ist.

4. **Falls danach ein neuer Fehler erscheint**
   - Den echten Provider-Fehler sichtbar machen, z. B. fehlender ElevenLabs-Connector/API-Key, Datei nicht erreichbar, Formatproblem oder Provider-Limit.

## Technische Details

- Betroffene Function: `clone-voice`
- Aktueller Log-Beweis: deployte Runtime wirft noch `At least 3 voice samples required`
- Ziel: Deployment-Synchronisation erzwingen + echte Fehlerdetails an die Voice-Studio-UI weitergeben