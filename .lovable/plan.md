# Meta: Freigaben sind da — jetzt nur noch verifizieren

Der Screenshot zeigt es eindeutig: alle Berechtigungen, die die App tatsächlich anfordert, sind freigegeben.

| Scope | Status laut Meta | Wird im Code angefordert |
|---|---|---|
| `public_profile` | Renewed | Login |
| `pages_show_list` | Renewed | Facebook + Instagram |
| `pages_read_engagement` | Renewed | Facebook + Instagram |
| `pages_manage_posts` | Renewed | Facebook |
| `instagram_basic` | Approved | Instagram |
| `instagram_content_publish` | Approved | Instagram |

Damit deckt sich die Meta-Freigabe **exakt** mit den Scope-Listen in `facebook-oauth-start` und `instagram-oauth-start`. Es fehlt keine Berechtigung. Meine vorherige Einschätzung war überholt — der Punkt ist erledigt.

## Was jetzt noch zu tun ist: ein echter End-to-End-Test

Kein Code-Umbau, nur Verifikation im Live-Betrieb:

1. **Facebook verbinden** in AdTool unter Verbindungen. Erwartung: Meta-Dialog erscheint, Seite wird gefunden, Verbindung wird gespeichert.
2. **Instagram verbinden**. Voraussetzung auf Meta-Seite: Instagram-Konto ist **Business oder Creator** und mit der Facebook-Seite verknüpft. Sonst liefert Meta 0 Seiten — das ist dann kein App-Fehler.
3. **Testpost** über den Composer auf beiden Kanälen veröffentlichen.
4. **Redirect-URIs gegenprüfen**: Der Soll-Wert steht mit Kopier-Button im Diagnose-Panel unter Verbindungen; er muss zeichengenau in **Facebook Login → Einstellungen → Gültige OAuth-Redirect-URIs** stehen. Das ist die häufigste verbleibende Fehlerquelle nach erteilter Freigabe.

## Falls beim Test etwas hakt

Bitte die genaue Fehlermeldung schicken. Typische Fälle und ihre Ursache:

- „Feature nicht verfügbar" → Redirect-URI stimmt nicht oder App-Modus/Rollen-Problem.
- Leere Seitenliste → Instagram nicht auf Business umgestellt oder Seite nicht verknüpft.
- Fehler beim Posten → Seiten-Token statt Nutzer-Token nötig; das prüft `instagram-token-debug` bereits.

## Optionaler Ausbau

Ich kann das Diagnose-Panel so erweitern, dass es **je Scope** Standard vs. Advanced Access live aus der Graph API anzeigt — analog zur bestehenden `public_profile`-Prüfung. Dann siehst du den Freigabestatus direkt in AdTool statt im Meta-Dashboard. Sag Bescheid, ob ich das bauen soll.

## Noch offen bei den anderen Kanälen

- **YouTube**: Google-OAuth-Consent-Screen muss auf „In production" stehen, sonst nur 100 Testnutzer.
- **TikTok**: läuft laut Projektstand noch im Sandbox-Modus — für echte Kunden ist eine TikTok-App-Review nötig.
