

## Problem

Die Edge-Function-Logs zeigen klar:
1. TikTok Access Token ist abgelaufen (`token_expires_at: 2026-04-05 21:12:00`)
2. Der automatische Token-Refresh schlägt fehl: `refreshAccessToken()` gibt `Token refresh failed` zurück
3. Das bedeutet: **auch der Refresh Token ist abgelaufen oder ungültig** (TikTok Sandbox-Tokens haben kurze Lebenszeiten)

Zusätzliches Problem im Code: `refreshAccessToken()` in `_shared/tiktok-api.ts` hat eine Inkonsistenz — `exchangeCodeForTokens()` gibt `data` direkt zurück (Zeile 58-59), aber `refreshAccessToken()` gibt `data.data` zurück (Zeile 92). Falls TikTok die Antwort auf Top-Level zurückgibt (ohne `.data`-Wrapper), schlägt die Prüfung `!data.data` fehl und wirft "Token refresh failed".

## Lösung

### 1. Fix `refreshAccessToken()` Response-Parsing (`supabase/functions/_shared/tiktok-api.ts`)

- Besseres Logging der TikTok-Antwort hinzufügen, um den genauen Response-Body zu sehen
- Response-Parsing anpassen: prüfen ob Token auf Top-Level (`data.access_token`) oder verschachtelt (`data.data.access_token`) liegt — wie bei `exchangeCodeForTokens` bereits gemacht
- Falls Response-Fehlerfeld `error_code` statt `error` heißt (TikTok v2 Format), das ebenfalls abfangen

### 2. Graceful Reconnect bei abgelaufenem Refresh Token (`supabase/functions/tiktok-sync/index.ts`)

- Wenn `refreshAccessToken()` fehlschlägt, statt 500-Crash eine strukturierte Antwort mit `reconnect_required: true` zurückgeben
- Damit zeigt das Frontend dem User "Bitte TikTok neu verbinden" statt einer kryptischen Fehlermeldung

### 3. Frontend-Fehlerbehandlung verbessern

- In der TikTok-Karte (`LinkedAccountsCard` oder ähnlich): wenn Sync `reconnect_required` zurückgibt, den User auffordern, TikTok neu zu verbinden, statt nur "Edge Function returned a non-2xx status code" anzuzeigen

### Betroffene Dateien
- `supabase/functions/_shared/tiktok-api.ts` — Response-Parsing fix + Logging
- `supabase/functions/tiktok-sync/index.ts` — Graceful error handling bei Refresh-Fehler
- Frontend-Komponente für TikTok-Verbindung — Reconnect-Hinweis statt generischem Fehler

### Ergebnis
- Token-Refresh funktioniert korrekt wenn der Refresh Token noch gültig ist
- Bei abgelaufenem Refresh Token: klare Meldung "Bitte TikTok neu verbinden" statt 500-Fehler

