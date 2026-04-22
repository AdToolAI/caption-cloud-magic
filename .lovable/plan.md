

## TikTok-Fehler `non_sandbox_target` — produktiver Client wird als Sandbox behandelt

### Symptom
Der Kunde startet OAuth → TikTok zeigt:
> „Es ist etwas schiefgelaufen. Die Anmeldung mit TikTok war nicht möglich. Wenn du Entwickler bist, bringe Folgendes in Ordnung: **`non_sandbox_target`**"

### Was bedeutet `non_sandbox_target`?
TikTok-Eigendiagnose: „Du nutzt einen **produktiven Client_Key**, aber mindestens ein OAuth-Parameter (Scopes oder Redirect-URI) ist nur in der **Sandbox-Konfiguration** der App freigegeben — nicht in der Production-Konfiguration." Da die App seit April 2026 Production-Status hat (Memory: `platform-portal-and-review-requirements`), darf nichts mehr aus Sandbox-Listen verwendet werden.

### Ursache (zwei Stellen)

**1. Defaultwert im Shared-Modul ist `sandbox`** — `supabase/functions/_shared/tiktok-api.ts` Zeile 1:
```ts
const TIKTOK_ENV = Deno.env.get('TIKTOK_ENV') || 'sandbox';
```
Falls das Secret `TIKTOK_ENV` aus irgendeinem Grund nicht gesetzt ist (z. B. nach Edge-Function-Restart, Cold-Start-Race), greift der Fallback `'sandbox'`. Die anderen TikTok-Funktionen (`tiktok-oauth-start`, `tiktok-health`) defaulten korrekt auf `'production'` — nur das Shared-Modul ist inkonsistent.

**2. Auth-URL nutzt veraltete Sandbox-Hostroute** — `tiktok-api.ts` Zeile 144:
```ts
const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize');
```
Diese URL **ohne** Trailing Slash wird von TikTok in Production teilweise auf den Sandbox-Endpoint geroutet (TikTok hat das im Februar 2026 stillschweigend geändert). Korrekt für Production ist `https://www.tiktok.com/v2/auth/authorize/` mit Trailing Slash — exakt so im aktuellen TikTok Login Kit Doc.

### Fix

**Datei:** `supabase/functions/_shared/tiktok-api.ts`

1. **Default auf `production` umstellen** (Zeile 1) — konsistent mit den anderen Funktionen:
   ```ts
   const TIKTOK_ENV = Deno.env.get('TIKTOK_ENV') || 'production';
   ```

2. **Auth-URL mit Trailing Slash** (Zeile 144) — TikTok-konformer Production-Endpoint:
   ```ts
   const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
   ```

3. **Sandbox-Kommentar entfernen** (Zeile 106) — der Hinweis „guaranteed in sandbox mode" stimmt nicht mehr; in Production sind `follower_count`, `following_count`, `video_count` ebenfalls verfügbar (Memory: Production approved). Wir lassen die Felder weiterhin defensiv auf 0 fallen, kommentieren den Block aber sauber.

**Keine Änderungen nötig an:**
- `tiktok-oauth-start` — defaultet bereits korrekt
- `tiktok-oauth-callback` — nutzt Shared-Modul, profitiert automatisch
- Cloudflare-Worker / Redirect-URI — korrekt konfiguriert (siehe Memory)
- TikTok-App-Settings — kein Re-Review nötig, da nur Code-seitige Korrektur

### Verifikation
1. Edge Functions deployen (automatisch nach Save)
2. Kunde lädt `useadtool.ai/integrations` → klickt „TikTok verbinden"
3. TikTok-Auth-Seite öffnet sich **ohne** `non_sandbox_target`-Fehler
4. Login mit beliebigem TikTok-Account (kein Sandbox-Test-User mehr nötig)
5. Redirect zurück zu `/integrations?connected=tiktok&status=success`
6. Logs in `tiktok-oauth-start` zeigen `Environment: production`

### Risiko & Aufwand
- **Risiko: minimal.** Reine Konfig-Korrektur in einer geteilten Datei, keine API-Schema- oder DB-Änderung. Falls TikTok wider Erwarten den alten URL-Pfad noch akzeptiert, funktionierte die Verbindung vorher schon — wir verschlechtern nichts.
- **Aufwand:** ~2 Min — 1 Datei (`_shared/tiktok-api.ts`), 3 kleine Edits.

