# Ein einziger Test entscheidet: Meta oder unser OAuth

## Deine Analyse ist richtig

Das alte Konto liegt ebenfalls in einem Business-Portfolio, hat Full Access — und liefert Seiten über `/me/accounts`. Damit ist die Portfolio-These als Erklärung für den Unterschied zwischen Alt und Neu widerlegt. `business_management` mag später für Kunden nötig sein, es erklärt diesen Fall aber nicht.

Ausgeschlossen sind damit: falscher Benutzer, fehlender Seitenzugriff, fehlendes Portfolio, fehlender Full Access.

## Der eine Test

Ein Token erzeugen, das **nichts** mit unserer App-Speicherung und unserem OAuth-Start zu tun hat, und damit direkt `/me/accounts` abfragen.

**Graph API Explorer:** https://developers.facebook.com/tools/explorer/

1. Oben rechts als Meta-App **AdTool AI Integration** wählen.
2. „User Token" wählen, Berechtigung `pages_show_list` hinzufügen.
3. **Generate Access Token** — im Dialog mit dem *neuen* Profil zustimmen und die Seite anhaken.
4. Anfrage `me/accounts` senden.

Zwei mögliche Ergebnisse, und beide sind eindeutig:

- **`"data": []`** → Meta bindet dem neuen Profil keine Seite an Tokens dieser App. Unser Code ist raus. Der Fix liegt dann bei Meta (Support-Fall / Seiten-Konfiguration), nicht bei uns.
- **Die Seite erscheint** → Meta ist raus. Dann liegt der Fehler in unserem OAuth-Start oder in der Speicherung, und wir haben eine funktionierende Referenz, gegen die wir unseren Flow Zeile für Zeile vergleichen können.

Kontrollversuch, falls Ergebnis 1 eintritt: denselben Explorer-Test mit dem **alten** Profil. Liefert der Explorer dort Seiten, ist der Unterschied profil- bzw. seitengebunden und nicht app-gebunden — das grenzt den Meta-Support-Fall präzise ein.

## Was ich parallel prüfen will, ohne zu spekulieren

Ein Unterschied, den wir bisher nie angesehen haben und der zum Zeitpunkt der Seitenerstellung passt: die neue Seite ist zwei Wochen alt und läuft mit hoher Wahrscheinlichkeit im **New Pages Experience**. Ich prüfe das direkt an der API statt es anzunehmen — über die gespeicherten Verbindungsdaten des alten Kontos, das noch funktioniert:

- `/{page_id}?fields=has_transitioned_to_new_page_experience,is_published,verification_status` für beide Seiten im Vergleich.
- Ob die neue Seite überhaupt **veröffentlicht** ist. Eine unveröffentlichte Seite taucht in `/me/accounts` je nach Zustand nicht auf — das wäre eine Ein-Klick-Lösung und wurde bisher nie geprüft.

Diese Abfragen kosten nichts und laufen, während du den Explorer-Test machst.

## Erst danach Code

Ich ändere jetzt bewusst **nichts** am OAuth-Flow. Solange nicht feststeht, auf welcher Seite der Grenze das Problem liegt, wäre jede Änderung geraten. Nach dem Testergebnis greift genau einer dieser beiden Wege:

- **Meta-Seite:** Wir bauen keinen Workaround, sondern zeigen den Zustand ehrlich an und eröffnen den Support-Fall mit den Explorer-Rohdaten als Beweis.
- **Unsere Seite:** Wir vergleichen den Explorer-Request Parameter für Parameter mit unserem `instagram-oauth-start` / `facebook-oauth-start` — Scopes, `config_id`, `auth_type`, Redirect — und korrigieren die Abweichung, die den Unterschied macht.

## Technische Details

- Kein Code-Change in diesem Schritt.
- Vergleichsabfragen laufen lesend über den gespeicherten Token des funktionierenden Kontos.
- `business_management` bleibt vorerst im Scope-Satz, wird aber nicht mehr als Ursache behandelt. Über den Review entscheiden wir nach dem Testergebnis.
