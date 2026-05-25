## Befund

Die App ist laut Screenshot live und approved, aber der aktuelle Facebook-OAuth-Start fordert mehr Berechtigungen an, als im Screenshot genehmigt/erneuert sind.

Approved/Renewed im Screenshot:
- `instagram_content_publish`
- `instagram_basic`
- `pages_manage_posts`
- `pages_show_list`
- `pages_read_engagement`

Aktuell im Facebook-Flow zusätzlich angefordert:
- `pages_manage_metadata`
- `pages_read_user_content`
- `pages_manage_engagement`
- `business_management`

Diese Zusatz-Scopes können genau die gleiche Meta-Meldung auslösen, obwohl die App grundsätzlich live/approved ist. Zusätzlich cached Meta App-Grants pro Facebook-Konto sehr aggressiv; ein Reset/Reauth muss sauberer angestoßen werden.

## Plan

1. **Facebook-OAuth auf minimale genehmigte Scopes reduzieren**
   - In `facebook-oauth-start` nur die wirklich benötigten und laut Screenshot genehmigten Facebook-Scopes verwenden:
     - `pages_show_list`
     - `pages_read_engagement`
     - `pages_manage_posts`
   - Die riskanten Zusatz-Scopes entfernen:
     - `pages_manage_metadata`
     - `pages_read_user_content`
     - `pages_manage_engagement`
     - `business_management`

2. **Facebook-Reconnect mit sauberem Reset erzwingen**
   - Beim Facebook-Start zusätzlich `auth_type=rerequest` beibehalten.
   - Optional `forceReconsent` aus dem Frontend an die Function durchreichen, damit bei erneuten Verbindungsversuchen explizit ein frischer Consent-Pfad genutzt wird.
   - Bestehende alte Facebook-Verbindungszeile vor dem Start weiterhin löschen, damit kein lokaler stale state übrig bleibt.

3. **Callback-URLs/Versionen konsistent halten**
   - `oauth-callback` bleibt auf Graph API `v24.0`.
   - Keine Rückkehr zu `v18.0` im Login-Flow.

4. **Veröffentlichungs-/Deploy-Schritt**
   - Die geänderte `facebook-oauth-start` Function neu deployen.
   - Danach im Browser testen: Der Facebook-Redirect muss `facebook.com/v24.0/dialog/oauth` enthalten und nur die minimalen Facebook-Scopes anfordern.

## Wichtig außerhalb des Codes

Falls Meta trotz reduzierter Scopes weiter die gleiche Meldung zeigt, muss der App-Grant zusätzlich auf Facebook-Seite zurückgesetzt werden:

- Facebook öffnen mit dem betroffenen Konto
- Einstellungen → Apps und Websites
- AdTool AI Integration entfernen
- Danach in einem Inkognito-Fenster erneut verbinden

Der Code kann alte Grants best-effort per API löschen, aber Meta blockiert das manchmal, wenn der alte Token bereits ungültig ist.