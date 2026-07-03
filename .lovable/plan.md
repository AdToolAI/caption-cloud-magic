## Ziel
Der Registrierungslink aus der E-Mail soll zuverlässig funktionieren. Aktuell zeigt die App „Kein Verifizierungstoken gefunden“, obwohl der Link aus der Auth-Mail kommt.

## Ursache
Es gibt zwei konkurrierende Verifizierungswege:

1. Die normale Auth-Verifizierung erzeugt Links mit Parametern wie `token_hash` und `type=signup` bzw. Fehlerparametern in der URL.
2. Die App-Seite `/verify-email` erwartet aber nur einen eigenen Parameter `?token=...` und ruft dafür eine eigene `verify-email` Funktion auf.

Wenn ein Nutzer den normalen Auth-Mail-Link klickt, kommt er auf `/verify-email` ohne `token`. Deshalb erscheint fälschlich „Kein Verifizierungstoken gefunden“.

## Umsetzung
1. `/verify-email` so erweitern, dass sie beide Link-Typen unterstützt:
   - eigener App-Link: `?token=...` bleibt unverändert funktionsfähig
   - normaler Auth-Link: `?token_hash=...&type=signup` wird direkt über die Auth-Verifizierung verarbeitet
   - Hash-/Fragment-Parameter werden ebenfalls berücksichtigt, falls der Anbieter sie so übergibt

2. Fehlerfälle professionell behandeln:
   - `otp_expired`, `access_denied`, ungültiger/abgelaufener Link werden mit einer klaren deutschen Meldung angezeigt
   - Button „Neue E-Mail senden“ bleibt verfügbar
   - keine irreführende Meldung „Kein Token“, wenn tatsächlich ein abgelaufener Auth-Link vorliegt

3. Registrierung robuster machen:
   - `signUp()` soll nicht zusätzlich einen zweiten, eigenen Verifizierungslink senden, wenn die normale Auth-Mail bereits aktiv ist
   - falls der eigene Versand beibehalten wird, wird sichergestellt, dass nur ein Link-Typ beim Nutzer landet oder beide korrekt verarbeitet werden

4. Optional Backend prüfen/anpassen:
   - Auth-E-Mail-Template `signup` muss auf den vom Auth-System gelieferten `confirmationUrl` zeigen
   - eigene `send-verification-email` Funktion nur noch als Resend-/Fallback-Pfad nutzen, nicht als konkurrierender Erstversand

5. Verifikation
   - E-Mail-Link-URL mit `token_hash/type` lokal gegen `/verify-email` testen
   - bestehenden `?token=` Fallback prüfen
   - sicherstellen, dass Nutzer nach erfolgreicher Verifizierung zur App weiterkommen und nicht in der Fehlermeldung hängen