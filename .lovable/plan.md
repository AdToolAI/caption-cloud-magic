
## Meta/Instagram-Reconnect korrekt erzwingen

### Wahrscheinliche Hauptursache
Das Screenshot-Textbild ist entscheidend:

```text
You previously logged into AdTool AI Integration with Facebook.
```

Das ist kein Instagram-spezifischer Screen, sondern der gemeinsame Meta/Facebook-App-Grant. Deshalb bringt `reauthenticate` nur die Passwort-Abfrage zurück, aber nicht den eigentlichen Consent-Flow. Meta erkennt die App weiterhin als bereits autorisiert.

Zusätzlich ist der aktuelle Disconnect technisch zu weich:
- `instagram-oauth-revoke` löscht lokal weiter, auch wenn der Meta-Revoke fehlschlägt
- dadurch glaubt die UI an einen „sauberen“ Disconnect, obwohl Meta den App-Grant evtl. behalten hat
- bei Meta ist der Grant praktisch app-weit für Facebook/Instagram, nicht nur „eine Instagram-Row in der DB“

## Was ich ändern werde

### 1. Meta-Disconnect als echten App-Reset behandeln
**Datei:** `supabase/functions/instagram-oauth-revoke/index.ts`

Änderung:
- Revoke nicht mehr nur als Soft-Fallback behandeln
- zusätzlich alle Meta-bezogenen Verbindungen des Users konsistent bereinigen:
  - `instagram`
  - `facebook`
- Response erweitern um:
  - `revoked`
  - `revokeError`
  - `deletedProviders: ['instagram', 'facebook']`
  - `hardResetComplete`

Ziel:
Wenn Instagram „neu“ verbunden werden soll, darf kein alter Meta-App-Grant im System und keine alte Meta-Verbindung mehr übrig sein.

### 2. Frontend nur noch „clean reconnect“ zulassen
**Dateien:**
- `src/components/account/LinkedAccountsCard.tsx`
- `src/components/performance/ConnectionsTab.tsx`

Änderung:
- bei Instagram-Disconnect die Rückmeldung aus dem Revoke-Call strikt auswerten
- wenn `revoked !== true`, keine Erfolgsmeldung „voller Flow kommt jetzt“, sondern klare Warnung
- bei aktivem Facebook/Instagram-Meta-Altzustand vor neuem Connect Hinweis bzw. Block:
  - zuerst sauberer Meta-Reset
  - dann neuer Instagram-Connect

Ziel:
Kein falscher Erfolgszustand mehr, wenn Meta den alten Grant in Wahrheit behalten hat.

### 3. Prompt-Strategie von Login-Fokus auf Consent-Fokus umstellen
**Datei:** `supabase/functions/instagram-oauth-start/index.ts`

Aktuell:
- `auth_type=reauthenticate` erzwingt primär Passwort/Login

Neu:
- auf consent-orientierte Strategie umstellen:
  - `auth_type=rerequest`
  - `auth_nonce` behalten
  - `display=page` behalten

Ziel:
Nicht noch einmal nur die Identität bestätigen, sondern Meta möglichst in den Berechtigungs-/Consent-Pfad drücken.

### 4. Meta-Flow sauber instrumentieren
**Dateien:**
- `supabase/functions/instagram-oauth-start/index.ts`
- `supabase/functions/instagram-oauth-revoke/index.ts`
- optional `supabase/functions/oauth-callback/index.ts`

Änderung:
- klarere Logs/Statusfelder für:
  - Revoke erfolgreich ja/nein
  - welche Meta-Verbindungen gelöscht wurden
  - ob der Reconnect nach einem bestätigten Hard-Reset gestartet wurde
- optional Redirect/Toast-Hinweis nach Callback:
  - „Reconnect came from clean Meta reset“
  - oder „Meta reused prior app authorization“

Ziel:
Beim nächsten Test ist sofort sichtbar, ob wirklich ein frischer Ausgangszustand erreicht wurde.

## Wichtige Erwartung
Der kleine „Continue as …“-Screen kann bei Meta als erste Hürde trotzdem noch erscheinen. Entscheidend ist nicht dieser erste Screen allein, sondern ob danach:
- der echte Berechtigungsdialog kommt
- oder Meta sofort still zurück in die App springt

Der Fix zielt genau auf dieses Problem: den gemerkten Meta-App-Grant wirklich zu löschen statt nur lokal die Instagram-Verbindung zu entfernen.

## Technische Details
- Keine Änderung an Redirect-URIs oder Backend-Konfiguration
- Keine Änderung an der OAuth-Callback-URL nötig
- Betroffene Dateien:
  - `supabase/functions/instagram-oauth-revoke/index.ts`
  - `supabase/functions/instagram-oauth-start/index.ts`
  - `src/components/account/LinkedAccountsCard.tsx`
  - `src/components/performance/ConnectionsTab.tsx`
  - optional `supabase/functions/oauth-callback/index.ts`

## Test nach Umsetzung
1. Instagram trennen
2. prüfen, dass der Revoke explizit als erfolgreicher Meta-Reset gemeldet wird
3. sicherstellen, dass auch alte Facebook-Meta-Verbindungen bereinigt wurden
4. Instagram erneut verbinden
5. prüfen, dass nach dem Continue-/Login-Schritt nicht direkt still zurückgesprungen wird, sondern der Berechtigungsdialog folgt
6. falls der Flow nur in Preview anders ist: zusätzlich auf der veröffentlichten URL testen, ohne weitere Code-Änderungen an OAuth-Konfiguration

## Risiko
Gering bis mittel:
- gering für Frontend/Statushandling
- mittel beim Meta-Reset, weil Facebook- und Instagram-Verbindungen bewusst gemeinsam als gemeinsamer Meta-Grant behandelt werden
- genau das ist hier aber sehr wahrscheinlich notwendig, weil das Problem sichtbar auf der Facebook/Meta-App-Autorisierungsebene sitzt
