## Diagnose

Du sagst die Meta-App ist Live & Approved — die Facebook-Fehlermeldung „Feature nicht verfügbar — wir aktualisieren zusätzliche Details für diese App" kommt also nicht von einem App-Review-Block, sondern von einer **veralteten Graph-API-Version** im OAuth-Dialog.

**Root Cause** in `src/components/performance/ConnectionsTab.tsx`, Zeile 477:

```
https://www.facebook.com/v18.0/dialog/oauth?...
```

- **v18.0 ist von Meta deprecated.** Wenn eine deprecated API-Version eine Permission-Kombination anfordert, die nur in neueren Versionen sauber existiert (`pages_manage_posts`, `pages_manage_engagement`, `pages_read_user_content` etc.), zeigt Meta exakt diese „Feature nicht verfügbar"-Wartungsseite — Login wird einfach verweigert.
- Unsere Memory sagt explizit: **Meta = Graph API v24**.
- Instagram macht es bereits richtig: `instagram-oauth-start` Edge Function verwendet `facebook.com/v24.0/dialog/oauth`.
- Facebook ist als einziger Provider noch hardcoded auf v18 im Frontend.

Außerdem: Die Facebook-OAuth-URL wird komplett client-side gebaut — bei Instagram läuft das über eine Edge Function (sicherer, server-side `META_APP_ID`, einheitlicher Hard-Reset des Grants, einheitliches Logging). Wir gleichen Facebook an diesen Stil an.

## Scope

Nur Facebook-Connect reparieren. Instagram, TikTok, LinkedIn, X, YouTube unangetastet.

## Änderungen

### 1. Neue Edge Function `supabase/functions/facebook-oauth-start/index.ts`

1:1 das Pattern von `instagram-oauth-start`:
- Auth-Check via JWT.
- `META_APP_ID` aus `Deno.env`.
- Optionaler Best-Effort Grant-Reset (gleicher Block wie Instagram, damit Meta nicht den „Du warst zuletzt eingeloggt"-Shortcut zeigt).
- Baut die OAuth-URL mit **`v24.0`** und denselben Page-Scopes wie aktuell:
  `pages_read_engagement, pages_manage_metadata, pages_show_list, pages_read_user_content, pages_manage_posts, pages_manage_engagement, business_management`
- `redirect_uri = {SUPABASE_URL}/functions/v1/oauth-callback?provider=facebook`
- Persistiert `oauth_states` Row (csrf, user_id, provider='facebook', timestamp) — Schema von Instagram übernehmen.
- Gibt `{ url }` zurück.
- `verify_jwt = false` ist Default; JWT-Validierung erfolgt in-code.

### 2. `src/components/performance/ConnectionsTab.tsx`

- Den Facebook-Eintrag aus dem `oauthUrls`-Map (Zeile 477) **entfernen**.
- Im Handler analog zum TikTok/LinkedIn-Branch (ab Zeile 493) einen neuen Branch:
  ```
  if (providerId === 'facebook') {
    const { data, error } = await supabase.functions.invoke('facebook-oauth-start', {
      body: { returnTo: window.location.href }
    });
    if (error || !data?.url) { toast(...); return; }
    window.location.href = data.url;
    return;
  }
  ```
- Trial-Bypass (`hasFullAccess`) und PKCE-Setup oben bleiben unverändert.

### 3. `supabase/functions/oauth-callback/index.ts`

Verifizieren, dass der `?provider=facebook` Branch noch da ist und Tokens gegen Graph **v24** tauscht (`https://graph.facebook.com/v24.0/oauth/access_token`). Falls noch auf v18 → auf v24 heben. Sonst keine Änderung.

### 4. Memory-Update

`mem://architecture/social-integrations/unified-connection-and-publishing-engine` ergänzen: „Facebook OAuth läuft seit Mai 2026 über `facebook-oauth-start` Edge Function (v24), nicht mehr client-side."

## Was NICHT angefasst wird

- Meta App im Developer-Portal (du sagst Live & Approved, also korrekt konfiguriert).
- Redirect-URI-Whitelist (gleicher Callback wie vorher).
- App-Review / Permissions (keine neuen Scopes).
- Instagram-Flow.
- Trial-Bypass-Logik (bereits umgesetzt).

## Verifikation nach Build

1. Edge Function deployen.
2. Im Preview „Facebook verbinden" klicken → URL muss jetzt `facebook.com/v24.0/dialog/oauth?…` lauten statt v18.
3. Meta-Consent-Dialog muss erscheinen (keine Wartungsseite mehr).
4. Nach Bestätigung Redirect zurück nach `/integrations?connected=facebook&status=success`.
5. Edge-Function-Logs prüfen: `facebook-oauth-start` invoked + `oauth-callback?provider=facebook` Token-Exchange erfolgreich.
