

## Plan: TikTok OAuth — Dynamische Rückleitung zur Ausgangsseite

### Problem
1. Nach dem TikTok-Verbinden landet der User auf `/performance?tab=connections` statt dort, wo er den Flow gestartet hat (z.B. `/integrations`)
2. TikTok überspringt den Consent-Dialog, weil die App bereits autorisiert wurde — das ist **normales Verhalten** und kein Bug

### Lösung
Das gleiche Pattern wie beim X-OAuth-Flow verwenden: Die Ausgangs-URL wird im `oauth_states`-Eintrag gespeichert und im Callback ausgelesen.

### Änderungen

**1. Frontend: `ConnectionsTab.tsx`** — Aktuelle URL als `returnTo` mitschicken:
```typescript
// TikTok OAuth start
const { data, error } = await supabase.functions.invoke('tiktok-oauth-start', {
  headers: { Authorization: `Bearer ${session.session?.access_token}` },
  body: { returnTo: window.location.href }
});
```

**2. Edge Function: `tiktok-oauth-start/index.ts`** — `redirect_url` in `oauth_states` speichern:
- Request-Body parsen → `returnTo` extrahieren
- `redirect_url: returnTo` zum Insert hinzufügen

**3. Edge Function: `tiktok-oauth-callback/index.ts`** — Gespeicherte URL für Redirect verwenden:
- `oauthState.redirect_url` auslesen
- Statt hartcodiertem `/performance?tab=connections` die gespeicherte URL verwenden (mit Fallback)
- Callback-Parameter (`connected=tiktok&status=success`) anhängen

### Zum Consent-Dialog
TikTok zeigt den Autorisierungsdialog nur beim **ersten Mal**. Danach wird automatisch weitergeleitet. Um ihn erneut zu sehen, muss die App-Berechtigung im TikTok-Konto widerrufen werden. Das ist Standard-OAuth-Verhalten.

