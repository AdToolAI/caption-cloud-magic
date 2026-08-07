# Meta-Konten sauber trennen und Diff-401 beheben

## Gemessener Befund

- `bestofproducts4u@gmail.com` wurde zuletzt mit Meta-User-ID `122337042788329815` verbunden und Meta lieferte 2 Seiten.
- Die beiden neuesten Verbindungen von `info@useadtool.ai` wurden ebenfalls mit genau dieser Meta-User-ID verbunden und Meta lieferte ebenfalls 2 Seiten.
- Ein älterer Versuch von `info@useadtool.ai` kam dagegen mit der anderen Meta-User-ID `122116259151337304` zurück; der Token war gültig, aber `/me/accounts` und `/me/businesses` lieferten jeweils 0 Einträge.
- Alle gemessenen Tokens gehören zur selben Meta-App und sind gültig. Damit scheiden ein allgemeiner Fehler der Meta-Developer-Einstellungen und ein AdTool-Webcache als Ursache aus.
- Der Button „Vergleich laden“ erreicht die Funktion inzwischen, scheitert aber aktuell separat mit HTTP 401. Die Funktion startet also wieder; nun fehlt ihr beim Aufruf eine serverseitig gültige AdTool-Session.

## Umsetzung

1. **Diff-Aufruf gegen abgelaufene Sessions absichern**
   - Vor `meta-oauth-diff` die Session serverseitig validieren beziehungsweise aktualisieren.
   - Den danach bestätigten Access-Token explizit im `Authorization`-Header mitsenden.
   - Bei wirklich abgelaufener Anmeldung eine klare „Bitte neu anmelden“-Meldung statt des generischen Function-Fehlers anzeigen.

2. **Meta-Profil vor dem Verbinden unübersehbar machen**
   - In der Verbindungskarte die tatsächlich zurückgegebene Meta-Identität (Name und maskierte Meta-User-ID) anzeigen.
   - Nach dem Callback deutlich bestätigen, welches Meta-Profil verbunden wurde und wie viele Seiten Meta für genau diesen Token geliefert hat.
   - Dadurch ist sofort sichtbar, wenn `info@useadtool.ai` erneut versehentlich das Meta-Profil von `bestofproducts4u` übernimmt.

3. **Kontowechsel ehrlich und zuverlässig führen**
   - „Mit anderem Facebook-Konto verbinden“ weiterhin über den erzwungenen Facebook-Login starten.
   - Vor dem Redirect klar darauf hinweisen, dass das gewünschte Facebook-Profil im Meta-Fenster gewählt beziehungsweise das aktuell gemerkte Profil dort abgemeldet werden muss. Ein privates Fenster bleibt der zuverlässige Gegencheck gegen Meta-Cookies.
   - Keine automatische Löschung oder Manipulation fremder Facebook-Cookies versuchen; die Profilauswahl liegt auf der Meta-Domain.

4. **Beweisgeführte Abnahme**
   - Zuerst den Diff-Aufruf mit einer gültigen Sitzung testen und 200 statt 401 bestätigen.
   - Danach je einen frischen Connect durchführen: `bestofproducts4u@gmail.com` mit dem gewünschten Meta-Profil und `info@useadtool.ai` mit dem anderen Meta-Profil.
   - Im Diff müssen zwei unterschiedliche Meta-User-IDs erscheinen. Für das zweite Profil wird dann direkt sichtbar, ob Meta wirklich 0 Seiten an den Token bindet.

## Entscheidende Einordnung

Die Tatsache, dass ein Profil Seiten liefert, beweist nur, dass die App und ihre freigegebenen Scopes grundsätzlich funktionieren. Ob ein bestimmtes Facebook-Profil Seiten erhält, entscheidet Meta pro ausgestelltem User-Token und dessen Asset-Zuordnung. Zwei „identisch eingerichtete“ Business-Portfolios müssen deshalb nicht dasselbe Ergebnis in `/me/accounts` liefern. Der ältere Messwert mit gültigem Token, aber 0 Seiten belegt genau diesen profilspezifischen Unterschied.