

## Instagram OAuth: Echten Login-Flow für Reviewer & Endnutzer einbauen

### Das Kernproblem (vom Kunden korrekt erkannt)

Aktuell macht „Instagram verbinden" **keinen** OAuth-Login. Stattdessen ruft die App `connect-instagram-performance` auf, die deinen **eigenen Master-Token** aus `app_secrets` kopiert und in die `social_connections` des klickenden Users schreibt. Folge:

- Im Screencast sieht Meta keinen Permission-Dialog → **`instagram_basic` abgelehnt**
- Auch keine Veröffentlichung mit User-Tokens → **`instagram_content_publish` abgelehnt**
- Jeder User würde technisch denselben (deinen) Account verbinden — Meta-Policy-Verstoß

Der Facebook-Button macht es richtig: echter Meta-OAuth-Dialog mit Scopes. Instagram muss **denselben Flow** zeigen — Instagram Business Login via Facebook OAuth.

### Was sich ändert

#### 1. Frontend: Instagram-Button zeigt echten Meta-OAuth-Dialog
Datei: `src/components/performance/ConnectionsTab.tsx`
- Den Sonderfall-Block (Zeile 250–283), der `connect-instagram-performance` aufruft, **entfernen**
- Stattdessen: Instagram-Button startet `instagram-oauth-start` (neue Edge Function), die eine echte Meta-OAuth-URL liefert und den Browser dorthin weiterleitet
- Der OAuth-Dialog zeigt dann sichtbar: „AdTool AI möchte auf dein Instagram-Konto zugreifen" mit Scopes `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`, `business_management`

#### 2. Neue Edge Function: `instagram-oauth-start`
- Generiert State + CSRF, speichert in `oauth_states`
- Baut Meta-OAuth-URL mit Instagram-Scopes
- Redirect-URI: `…/functions/v1/oauth-callback?provider=instagram`

#### 3. Edge Function: `oauth-callback` erweitern für Instagram-Branch
- Token-Tausch: Code → Short-Lived Token → Long-Lived Token (60 Tage)
- `GET /me/accounts` → Facebook-Pages des Users abrufen
- Pro Page: `?fields=instagram_business_account{id,username,profile_picture_url,followers_count}` → IG-Account-Info
- Falls mehrere IG-Accounts: erstmal den ersten nehmen (Account-Picker später nachrüstbar)
- Speichern in `social_connections`: `provider='instagram'`, **echte User-Tokens** (verschlüsselt), `account_id` = IG Business Account ID, `account_name` = IG-Username, `account_metadata` = `{profile_picture_url, followers_count, page_id, page_access_token_encrypted}`

#### 4. Profil-Daten sichtbar in der UI
Datei: `src/components/performance/ConnectionsTab.tsx` (Zeilen 780+)
- Connection-Card erweitern: zeigt Instagram-Profilbild, `@username`, Follower-Count, Account-Typ-Badge
- Beweist Meta im Screencast: `instagram_basic` wird aktiv konsumiert

#### 5. Englisch-Toggle für Reviewer
Datei: `src/pages/Integrations.tsx`
- URL-Parameter `?lang=en` erkennen → i18n hart auf Englisch setzen
- Reviewer-URL: `useadtool.ai/integrations?lang=en`

#### 6. Backwards-Compatibility / Cleanup
- `connect-instagram-performance` bleibt deployed (legacy), wird aber nicht mehr aufgerufen
- Nicht löschen, falls Admin-Tools darauf basieren — nur aus dem Frontend-Flow rausnehmen

### Was Meta dann im Screencast sieht

```
1. User landet auf useadtool.ai/integrations?lang=en (English UI)
2. User klickt "Connect Instagram"
3. → Browser springt zu facebook.com/v24.0/dialog/oauth
4. → Permission-Dialog: "AdTool AI is requesting access to:
   - View your Instagram account profile (instagram_basic)
   - Publish content on your behalf (instagram_content_publish)
   - View your Facebook Pages (pages_show_list)"
5. User klickt "Allow"
6. → Redirect zurück zu useadtool.ai/integrations?connected=instagram
7. UI zeigt: Profilbild + @username + Follower-Count + "Connected" Badge
```

Genau dieser Flow ist das, was Meta für **`instagram_basic`** Approval verlangt.

### Migration für bestehende User

User, die aktuell mit dem Master-Token „verbunden" sind (wie auf deinem Screenshot `@captiongenie_socialmanager`), müssen **einmalig neu verbinden**:
- Beim Laden der ConnectionsTab: prüfen ob `account_metadata.account_type === 'business'` UND `account_name === '@captiongenie_socialmanager'` → Banner zeigen: „Bitte Instagram neu verbinden für die offizielle Anbindung"
- Nach echtem OAuth wird das Banner automatisch ausgeblendet

### Reihenfolge der Umsetzung (Dependencies)

```text
1. Edge Function: instagram-oauth-start  ──┐
2. oauth-callback erweitern (IG-Branch)   ─┼─→ Backend ready
3. Frontend-Button umbauen                 │
4. UI: Profil-Card mit Bild/Followers      ├─→ Frontend ready
5. ?lang=en Toggle                         │
6. Migration-Banner für Alt-Verbindungen   ┘
7. Reviewer-Drehbuch + Submission-Text     ─→ Du nimmst Screencast auf
```

### Was du nach dem Code-Deploy brauchst

Ich liefere dir nach Implementierung:
- **Screencast-Drehbuch** (English, ~75 Sek, exakte Klicks + Texteinblendungen)
- **Submission-Text auf Englisch** für Meta App Dashboard inkl. Server-to-Server-Hinweis
- **Test-Account-Info** für den Reviewer (bestehender `meta-reviewer@useadtool.ai` reicht, muss aber selbst eine IG-Verbindung machen können)

### Risiko & Aufwand
- **Risiko: mittel.** Echter OAuth-Flow ersetzt einen funktionierenden Hack — bestehende User müssen einmalig neu verbinden. Bestehende Veröffentlichungen über `IG_PAGE_ACCESS_TOKEN` (z.B. `instagram-publish` Edge Function) bleiben unberührt.
- **Aufwand:** ~25 Min Coding (1 neue Edge Function, 1 Edge Function erweitern, 2 Frontend-Dateien). Du brauchst danach ~10 Min für Screencast.
- **Keine Meta-App-Settings-Änderung nötig** — Redirect-URI `…/oauth-callback` ist bereits in deiner Meta-App registriert (Facebook nutzt sie schon).

