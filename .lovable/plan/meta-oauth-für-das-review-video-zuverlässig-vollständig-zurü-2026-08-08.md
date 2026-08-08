# Meta-OAuth für das Review-Video zuverlässig vollständig zurücksetzen

## Gesicherter Befund

- Der aktuelle Versuch um **10:05 Uhr** startete laut Live-Log mit `force_account_chooser: false`. Deshalb wurde der normale Meta-Dialog direkt geöffnet und das vorhandene Profil wiederverwendet.
- `auth_type=rerequest` erzwingt keinen vollständigen Erstzustimmungsdialog, solange Meta die App-Zustimmung für dieses Facebook-Profil noch kennt.
- Inkognito entfernt nur lokale Browserdaten. Die Zustimmung „Samuel hat AdTool AI Integration bereits verwendet“ liegt bei Meta und bleibt davon unberührt.
- Der vorhandene Reset kann nur zuverlässig widerrufen, solange lokal ein gültiger Facebook-**User-Token** vorhanden ist. Fehlt dieser, gibt es keinen Token, mit dem die App `DELETE /me/permissions` ausführen kann.

## Was diesmal anders ist – und was nicht garantiert werden kann

- Die beiden bisherigen Änderungen haben den entscheidenden Zustand nicht beseitigt: Der Live-Aufruf lief weiterhin mit `force_account_chooser: false`, und es gab keinen bestätigten Nachweis `authorization_cleared=true` von Meta.
- Der neue Ablauf behebt genau diese beiden messbaren Punkte: Er beschafft zuerst einen frischen User-Token, widerruft damit die Meta-Zustimmung und blockiert jeden weiteren Connect, solange die Nachprüfung nicht erfolgreich ist.
- Eine bestimmte Darstellung der externen Meta-Oberfläche kann nicht zu 100 % garantiert werden. Garantiert wird deshalb nicht „wir hoffen auf den richtigen Dialog“, sondern ein **Stop-or-Go-Gate anhand von Metas eigener Antwort**.
- Falls Meta trotz eines technisch bestätigten Widerrufs den alten Dialog zeigt, wird nicht ein dritter Code-Patch versucht. Dann ist der verbindliche Aufnahmeweg die manuelle Entfernung unter Facebook **Einstellungen → Apps und Websites → AdTool AI Integration → Entfernen**, anschließend erneute Verifikation in der App.

## Umsetzung

1. **Eigenen zweistufigen Review-Reset einführen**
   - Der Reset startet zunächst eine klar getrennte Meta-Autorisierung mit erzwungener Kontowahl für das Admin-Profil.
   - Dieser erste kurze Dialog dient ausschließlich dazu, einen aktuellen User-Token zu erhalten; er speichert noch keine produktive Facebook-Verbindung.
   - Der Callback widerruft mit genau diesem frischen User-Token sofort `DELETE /me/permissions`.

2. **Meta-seitige Löschung verifizieren**
   - Nach dem Widerruf wird der frische Token über `debug_token` erneut geprüft.
   - Nur `is_valid=false` beziehungsweise keine verbleibenden Scopes gilt als erfolgreicher Reset.
   - Erst dann zeigt die App „Bereit für die Aufnahme“ und gibt den eigentlichen Verbindungsbutton frei.
   - Die Reset-Antwort und der folgende OAuth-Start werden mit Zeitstempel protokolliert, damit vor der Aufnahme eindeutig sichtbar ist: `authorization_cleared=true` und `force_account_chooser=true`.

3. **Eigentlichen Review-Connect strikt trennen**
   - Der zweite Start verwendet immer die Kontowahl und einen neuen OAuth-State.
   - Er fordert unverändert `pages_show_list`, `pages_read_engagement`, `pages_manage_posts` und `business_management` an.
   - Die bestehende Inline-„Best-effort“-Löschung im normalen Facebook-Start wird entfernt, damit sie nicht unbemerkt Tokens oder lokale Verbindungen löscht und keinen falschen Reset vortäuscht.

4. **UI unmissverständlich machen**
   - Zwei klar nummerierte Aktionen: **1. Meta-Zustimmung löschen** und danach **2. Review-Verbindung starten**.
   - Schritt 2 bleibt gesperrt, bis die Meta-Nachprüfung erfolgreich ist.
   - Bei einem Meta-Fehler werden Status und verbleibende Scopes angezeigt; als letzter Fallback bleibt der manuelle Weg über Facebook „Apps und Websites“ sichtbar.
   - Texte werden in DE, EN und ES ergänzt.

## Technische Änderungen

- `facebook-oauth-start`: eigener Reset-Modus mit separatem Provider/State; Kontowahl im Review-Pfad zwingend aktivieren; keine unbestätigte Inline-Löschung mehr.
- `oauth-callback`: Reset-Callback tauscht den Code gegen einen User-Token, widerruft die App-Zustimmung, verifiziert sie und speichert keine produktive Verbindung.
- `MetaOAuthResetPanel`: zweistufiger Statusablauf und hartes Gate vor dem Review-Connect.
- `translations`: eindeutige Status-, Fehler- und Handlungstexte in DE, EN und ES.
- Keine Änderung an Meta-App-ID, genehmigten Scopes, Datenbankschema oder normalen Publishing-Funktionen.

## Abnahme

1. Schritt 1 mit dem Admin-Profil **Samuel / bestofproducts4u@gmail.com** ausführen.
2. Nach Rückkehr muss die App den Reset als Meta-seitig verifiziert anzeigen.
3. Schritt 2 starten; der Live-Log muss `force_account_chooser: true` zeigen.
4. Meta darf nicht mehr „You previously logged into AdTool AI Integration“ anzeigen, sondern muss den vollständigen Berechtigungsablauf öffnen.
5. `business_management` sowie die Seiten **Mystische aber wahre Geschichten** und **Bestofproducts4u** müssen im Review-Ablauf sichtbar beziehungsweise anschließend auswählbar sein.
6. Scheitert bereits die Meta-Verifikation in Schritt 2, wird der eigentliche Connect nicht gestartet und stattdessen sofort der manuelle Meta-Weg verwendet; es gibt keinen weiteren unbewiesenen Wiederholungsversuch.