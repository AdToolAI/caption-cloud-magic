

# Option B: Vercel-Rewrite für TikTok Callback

Du bekommst exakt die gleiche Geschwindigkeit und keine Einschränkungen. Hier warum:

## Performance-Frage geklärt

| Aspekt | Direkt zu Supabase | Über Vercel-Rewrite |
|---|---|---|
| TikTok → Callback-Request | 1 Hop | 1 Hop (Vercel proxied transparent) |
| Latenz-Aufschlag | 0 ms | ~20-40 ms (einmalig, nur beim OAuth-Callback) |
| Häufigkeit | 1× pro User-Verbindung | 1× pro User-Verbindung |
| Auswirkung auf normalen App-Betrieb | — | **Null** (Rewrite gilt nur für `/api/oauth/tiktok/callback`) |
| Funktionseinschränkung | keine | keine |

**Ergebnis:** Der User merkt davon nichts. Die +20-40 ms passieren einmalig beim Drücken von „Authorize" in TikTok — vor dem Redirect zurück zur App. Reine OAuth-Callback-Sache, keine Auswirkung auf Renders, Uploads, Posts oder UI.

## Was ich umsetze

### 1. `vercel.json` erweitern
Neuer Rewrite für `/api/oauth/tiktok/callback` → Supabase Edge Function. Der bestehende SPA-Catch-All `/(.*) → /index.html` bleibt unverändert; spezifischere Rewrites werden zuerst gematcht.

### 2. `TIKTOK_REDIRECT_URI` Secret aktualisieren
Neuer Wert (exakt was im TikTok Portal steht):
```
https://useadtool.ai/api/oauth/tiktok/callback
```
Du bestätigst den neuen Wert via Secret-Update-Dialog.

### 3. `tiktok-health` erweitern
Gibt jetzt den vollständigen `redirect_uri`-String zurück, damit du im Browser unter `https://useadtool.ai/api/oauth/tiktok/health` sofort sehen kannst, was wir an TikTok senden — 1:1 Vergleich mit dem Portal-Eintrag.

### 4. `tiktok-oauth-start/index.ts` Log-Fix
Zeile 78: `"Redirecting to TikTok OAuth (Sandbox):"` → `"Redirecting to TikTok OAuth (${env}):"` — irreführender „Sandbox"-Text raus, weil wir Production sind.

### 5. `Integrations.tsx` — User-freundliche Error-Toasts
Bei Rückkehr mit `?error=tiktok_oauth_failed` oder `?error=tiktok_oauth_denied`: klarer Toast statt stiller Fehler. Das macht künftige Debug-Cases mit Kunden viel einfacher.

## Verification nach Umsetzung

1. `tiktok-health` aufrufen → muss `redirect_uri: "https://useadtool.ai/api/oauth/tiktok/callback"` zurückgeben
2. `vercel.json` Rewrite live testen: `curl -I https://useadtool.ai/api/oauth/tiktok/callback?test=1` → muss zur Supabase-Function durchschlagen (302 oder 400, aber nicht 404)
3. Du klickst im UI: **Integrations → Connect TikTok** → echter Login → Authorize → Redirect zurück → grüner Toast „TikTok verbunden"
4. `tiktok-oauth-callback` Logs zeigen erfolgreichen Token-Exchange

## Geänderte Dateien

- `vercel.json` — neuer Rewrite-Eintrag (über dem SPA-Catch-All)
- `supabase/functions/tiktok-health/index.ts` — `redirect_uri` im Response
- `supabase/functions/tiktok-oauth-start/index.ts` — Log-Text dynamisch
- `src/pages/Integrations.tsx` — Error-Toast-Handler
- Secret-Update: `TIKTOK_REDIRECT_URI` → neuer Wert wird im Update-Dialog bestätigt

## Was du danach tun musst

1. Secret-Update bestätigen (Dialog erscheint automatisch)
2. Frontend „Update" im Publish-Dialog drücken (für `vercel.json` Rewrite — Edge Functions deployen automatisch)
3. Auf `https://useadtool.ai/api/oauth/tiktok/health` prüfen, ob die URI 1:1 stimmt
4. **Connect TikTok** im UI testen → muss durchlaufen

## Rollback-Plan (falls je nötig)

Falls TikTok Production trotzdem ein Problem macht: Rewrite aus `vercel.json` entfernen, Secret zurück auf Supabase-URL — alles in 1 Minute reversibel.

## Kosten

Null. Vercel Rewrites sind im Plan inkludiert, keine extra Edge-Function-Calls, keine zusätzlichen Supabase-Invocations.

