Do I know what the issue is? Teilweise: Die App erreicht bereits Meta, aber Meta blockiert den Login-Dialog selbst, bevor unser Callback ausgeführt wird. Die Logs zeigen, dass `facebook-oauth-start` und `instagram-oauth-start` Auth-URLs für App-ID `1769514810345813` erzeugen; `oauth-callback` wird nicht erreicht. Das ist daher kein Plan-/Trial-Gate mehr und kein Fehler beim Speichern der Verbindung.

Was wahrscheinlich passiert:
- Der Fehler kommt auf `facebook.com/v24.0/dialog/oauth` direkt.
- Wenn Facebook und Instagram beide mit derselben Meldung scheitern, ist es sehr wahrscheinlich ein Meta-App-/Facebook-Login-Konfigurationsproblem oder ein blockierender OAuth-Parameter/Scope, nicht ein einzelner Account-Reset.
- Ein reines Löschen alter Verbindungen in unserer Datenbank reicht hier nicht, weil Meta die Anfrage schon vor dem Token-Callback blockiert.

Plan:

1. OAuth-Start-URLs vereinheitlichen und entschärfen
- In `facebook-oauth-start` und `instagram-oauth-start` die Meta-Dialog-Parameter auf den dokumentierten Kern reduzieren.
- Entfernen/abschaltbar machen von aggressiven Reconsent-Parametern wie `auth_nonce` und `display=page`, damit Meta nicht durch Sonderparameter in einen blockierten Zustand läuft.
- `auth_type=rerequest` nur noch gezielt verwenden, wenn wirklich fehlende Berechtigungen erneut angefordert werden müssen.

2. Instagram-Scope-Set an die genehmigten Permissions anpassen
- `instagram-oauth-start` fordert aktuell zusätzlich `business_management` an.
- Ich werde das Scope-Set auf die tatsächlich benötigten und genehmigten Instagram/Page-Permissions reduzieren.
- Falls `business_management` nicht explizit approved ist, darf es nicht im Standard-Login-Dialog angefordert werden.

3. Optionalen Meta Login Configuration ID Support einbauen
- Falls deine Meta-App inzwischen „Facebook Login for Business“ / Business Login Configuration nutzt, braucht der Dialog oft eine `config_id` statt reinem Scope-Flow.
- Ich baue Unterstützung für ein Secret wie `META_LOGIN_CONFIG_ID` ein: Wenn vorhanden, wird es in Facebook- und Instagram-OAuth-Starts an Meta gesendet.
- Ohne Secret bleibt der normale Scope-Flow aktiv.

4. Diagnose-Ausgabe verbessern
- Die OAuth-Start-Funktionen loggen künftig explizit:
  - verwendete Redirect URI
  - Provider
  - Scope-Liste
  - ob `config_id` verwendet wird
  - ob `auth_type=rerequest` aktiv ist
- Dadurch sehen wir nach dem nächsten Klick sofort, welche exakte Meta-Variante ausgeliefert wurde.

5. Danach Edge Functions deployen und erneut testen
- Ich deploye `facebook-oauth-start` und `instagram-oauth-start`.
- Wenn Meta danach weiterhin dieselbe Seite zeigt, ist es sehr wahrscheinlich kein Codeproblem mehr, sondern Meta-seitig zu prüfen:
  - App Mode wirklich Live
  - Facebook Login / Facebook Login for Business Produkt aktiv
  - gültige OAuth Redirect URI exakt eingetragen: `https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/oauth-callback`
  - Privacy Policy, Data Deletion URL und App-Kategorie vollständig
  - keine offene Data Use Checkup / App Review / Business Verification Aktion

Technische Details:
- Betroffene Dateien: `supabase/functions/facebook-oauth-start/index.ts`, `supabase/functions/instagram-oauth-start/index.ts`
- `src/components/performance/ConnectionsTab.tsx` muss voraussichtlich nicht geändert werden, weil der Klick bereits korrekt die Backend-OAuth-Starts aufruft.
- `oauth-callback` ist aktuell nicht der Hauptfehler, weil Meta nie bis zum Callback weiterleitet.