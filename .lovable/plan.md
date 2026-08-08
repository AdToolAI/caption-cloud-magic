# OAuth-Flow zurücksetzen für das Review-Screenrecording

Ziel: Der Meta-Dialog muss im Video wieder **vollständig** erscheinen — inklusive „Dein Unternehmen verwalten" (`business_management`) und der Seitenauswahl. Aktuell überspringt Meta den Dialog und zeigt nur „Du hast dich zuvor bereits angemeldet — Als Samuel fortfahren", weil die App-Zustimmung noch gespeichert ist.

## Wichtig vorab: mit welchem Facebook-Profil aufgenommen wird

Gemessen und belegt:

- Profil `…329815` (bestofproducts4u@gmail.com): erhält `business_management`, liefert 2 Seiten — **Mystische aber wahre Geschichten** und **Bestofproducts4u**.
- Profil `…337304` (info@useadtool.ai): Meta bietet `business_management` gar nicht erst an, 0 Seiten. Der frische Test von 11:18 (nach entzogener Zustimmung) gab nur noch `public_profile` zurück.

Das Video muss deshalb zwingend mit **`…329815`** aufgenommen werden. Mit dem neuen Profil ist die geforderte Szene technisch nicht darstellbar.

## Was ich baue: sauberer Reset-Weg in der App

1. **Aktion „OAuth-Zustimmung zurücksetzen"** in den Verbindungen (Meta-Bereich, als Diagnose-/Review-Aktion gekennzeichnet):
   - ruft die bestehende Revoke-Funktion auf: `DELETE /{meta-user-id}/permissions` mit dem **User**-Token (nicht dem Page-Token) → Meta entzieht der App die komplette Autorisierung,
   - löscht die gespeicherten Facebook-/Instagram-Verbindungen des Kontos,
   - prüft anschließend per `debug_token`, dass keine Zustimmung mehr existiert, und zeigt „Zustimmung entfernt — der nächste Verbindungsversuch zeigt den vollständigen Dialog".
2. **Zustands-Anzeige vor der Aufnahme**: eine kleine Statuszeile „Nächster Connect zeigt vollständigen Dialog: ja/nein", abgeleitet aus den aktuell erteilten Scopes. Damit siehst du **vor** dem Start der Aufnahme, ob der Reset gegriffen hat, statt es erst im Video zu merken.
3. **Verbinden-Button mit Kontowahl** für die Aufnahme: der bestehende Weg „Mit anderem Facebook-Konto verbinden" wird im Reset-Bereich direkt angeboten, damit im Video sicher `…329815` verwendet wird.
4. **Seitenauswahl garantiert sichtbar**: die automatische Ein-Seiten-Auflösung wird für Facebook nicht angewandt (bei 2 Seiten erscheint der Dialog ohnehin) — ich prüfe zusätzlich, dass der Auswahl-Dialog auch dann angezeigt wird, wenn nur eine Seite zurückkommt, damit die Bestätigungs-Szene im Video nicht wegfällt.

Falls Meta trotz Revoke weiter den Kurz-Dialog zeigt, gibt es einen zweiten, manuellen Weg, den ich als Hinweis direkt in der Karte einblende: auf facebook.com mit diesem Profil → Einstellungen → Apps und Websites → „AdTool AI Integration" entfernen. Damit ist die Zustimmung garantiert weg.

## Ablauf der Aufnahme (60–90 s)

| Zeit | Szene |
| --- | --- |
| 0–8 s | AdTool AI, angemeldet, Bereich Social-Media-Integrationen — URL und Oberfläche klar erkennbar |
| 8–14 s | Bei Facebook auf „Verbinden" klicken |
| 14–25 s | Meta-Login/Authentifizierung |
| 25–35 s | **Berechtigungsbildschirm mit „Dein Unternehmen verwalten" — 3 Sekunden ruhig stehen lassen** |
| 35–48 s | Seiten-Berechtigungen: beide Seiten anhaken und bestätigen |
| 48–55 s | Rückleitung zu AdTool AI |
| 55–68 s | Seitenauswahl in AdTool AI mit „Mystische aber wahre Geschichten" und „Bestofproducts4u"; eine Seite wählen und bestätigen |
| 68–78 s | Verbindungskarte: Facebook → Verbunden, gewählte Seite sichtbar |
| 78–90 s | Kurz in den Publishing-Bereich: die verbundene Seite ist als Ziel auswählbar (ohne zu posten) |

Aufnahme in einem privaten Fenster, deutsche oder englische UI durchgehend gleich, keine Sprünge/Schnitte innerhalb des OAuth-Teils.

## Technische Details

- `supabase/functions/instagram-oauth-revoke/index.ts`: bleibt die Revoke-Grundlage; Rückgabe um ein `authorization_cleared`-Flag aus einer `debug_token`-Nachprüfung erweitern.
- `src/components/performance/ConnectionsTab.tsx`: Abschnitt „OAuth-Zustimmung zurücksetzen (für Review-Aufnahme)" mit Aktion, Ergebnis-Status und Hinweis auf den manuellen Weg; Statuszeile „Nächster Connect zeigt vollständigen Dialog".
- `supabase/functions/oauth-callback/index.ts`: Facebook-Zweig zeigt den Seitenauswahl-Dialog auch bei genau einer Seite.
- `src/lib/translations.ts`: neue Schlüssel in DE/EN/ES.
- Keine Änderung an den angefragten Scopes, keine Datenbank-Migration.
