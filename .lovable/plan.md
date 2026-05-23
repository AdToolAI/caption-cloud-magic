## Ziel

Jeder verbundene User kann auf **seinen eigenen** Facebook-Page und Instagram-Business-Account posten — nicht mehr nur App-Admins/Test-User. Dafür muss die zentrale Dispatcher-Function `publish-post` repariert und um echte Multi-Tenancy + alle Medienformate erweitert werden.

## Was bereits steht (nicht anfassen)

- OAuth-Flow (`instagram-oauth-start` → `oauth-callback`) + Page-Picker (`facebook-list-pages`, `facebook-select-page`) speichern verschlüsselte Long-Lived Page-Tokens in `social_connections.access_token_hash`.
- `auto-refresh-meta-tokens` Cron erneuert globale Tokens, aber per-User Tokens müssen wir separat verlängern.
- `meta-page-discovery` (Graph v24) verifiziert IG-Business-Account-Verknüpfung.

## Was zu bauen ist

### 1. `publish-post` — zentrale Dispatcher reparieren

Komplette `publishToInstagram` und `publishToFacebook` ersetzen:

- **Token-Lookup korrekt:** `social_connections` per `user_id + provider` (kein erfundenes `status`-Feld), Token via `decryptToken()` aus `_shared/crypto.ts` lesen (statt `atob()`).
- **Graph API v24** durchgehend (Memory: Meta v24 ist Standard).
- **Account-ID korrekt:**
  - Instagram: `account_id` = IG-Business-Account-ID (wird beim Page-Select gesetzt)
  - Facebook: `account_id` = FB-Page-ID, Token = Page Access Token (kein User-Token).
- **Token-Health-Check** vorher: bei Expiry < 7 Tage → versuche `fb_exchange_token`, sonst Fehler `TOKEN_EXPIRED` mit klarer Reconnect-Aufforderung.
- **Fehler-Mapping:** Meta-Errorcodes (190 Token, 100 Param, 200 Permission, 368 Rate-Limit) → benutzerfreundliche Messages in `posts.error_message`.

### 2. Medienformate vollständig

| Plattform | Format | Endpoint | Trigger |
|---|---|---|---|
| Instagram | Single Image | `/media` `image_url` | post.media_type='image' |
| Instagram | Reel/Video | `/media` `media_type=REELS, video_url` + Status-Polling | `video_url` vorhanden |
| Instagram | Story | `/media` `media_type=STORIES` | `post.is_story` |
| Instagram | Carousel | N× child container → `media_type=CAROUSEL, children=...` | `media_urls[]` length>1 |
| Facebook | Text+Link | `/{page_id}/feed` `message`, `link` | nur Text/Link |
| Facebook | Photo | `/{page_id}/photos` `url`, `caption` | image_url, kein video |
| Facebook | Video/Reel | `/{page_id}/videos` `file_url`, `description` + Status-Polling | video_url vorhanden |

Container-Status-Polling teilen wir mit `instagram-publish` über einen neuen Helper `_shared/meta-publish.ts` (graphPost/graphGet/waitUntilFinished, `decryptUserToken(userId, provider)`).

### 3. Legacy aufräumen

- `publish-to-instagram` (alt, globaler Token): umstellen auf `_shared/meta-publish.ts` mit Token-Lookup per `user_id` (passed in via body). Falls kein User → globaler Fallback nur für admin/dev.
- `instagram-publish` (Testseite `/instagram-publishing`): bleibt für **Owner-Debug** mit globalem Token, klar als "Test/Diagnose-Tool" markiert.
- `publish-to-instagram` aus dem App-Flow entfernen — alle Calls gehen über `publish-post`.

### 4. Per-User Token-Refresh

`auto-refresh-meta-tokens` Cron erweitern: Loop über alle `social_connections` mit provider in (facebook, instagram), bei `token_expires_at < now()+14d` → `fb_exchange_token` mit dem entschlüsselten User-Token, neuen 60-Tage-Token verschlüsselt zurückschreiben, Backup in `token_backups`.

### 5. UI — Connection-Status & Reconnect-Prompt

`/integrations` (oder Social Connections Karte): wenn `publish-post` `TOKEN_EXPIRED` zurückgibt, Banner mit "Verbindung erneuern" Button → öffnet `instagram-oauth-start` bzw. Facebook-OAuth.

### 6. Test-Plan (manuell durch User)

Vor Roll-out auf alle User:
1. Zweit-Account verbinden (nicht App-Admin, nicht Tester) → IG Single Image
2. Selber Account → FB Page Photo
3. Selber Account → IG Reel (Video) — Polling muss FINISHED erreichen
4. Token bewusst ablaufen lassen oder revoken → Banner muss erscheinen
5. Reconnect-Flow durchgehen → erneuter Post muss klappen

## Technische Details

**Neue Datei** `supabase/functions/_shared/meta-publish.ts`
- `getMetaConnection(supabase, userId, provider)` — liest+entschlüsselt
- `graphPost / graphGet` — v24
- `waitForContainer(creationId, token, maxMs=120000)` — Status-Polling für IG Reels & FB Videos
- `mapMetaError(err)` — Fehlercode → User-Message + boolean isReconnectRequired

**Schema-Anpassung:** keine Migration nötig — `social_connections` hat schon `token_expires_at` und `account_metadata` (JSONB) für extra IG/FB-Details.

**Edge-Function-Deployment:** `publish-post`, `auto-refresh-meta-tokens`, `publish-to-instagram` neu deployen.

**Keine neuen Secrets** nötig — alles läuft über per-User Tokens. `IG_PAGE_ACCESS_TOKEN` bleibt nur als Owner-Debug-Fallback bestehen.

## Out of scope

- TikTok/LinkedIn/X/YouTube Publishing (sind separate Functions, funktionieren bereits per-User).
- Story-Insights/Analytics (kommt über `instagram-graph-sync`, schon vorhanden).
- Calendar/Autopilot-Scheduling UI (ruft schon `publish-post` auf — wird automatisch profitieren).

## Risiken

- **Token-Verschlüsselungs-Migration:** falls alte `social_connections` noch base64-Tokens haben (aus Vor-OAuth-Zeit), fallback im Helper: `try decrypt → catch → atob`. Migrations-Skript optional.
- **Rate-Limits (Meta App-Level):** v24 App Usage Header beobachten — bei Code 4/17/32 Backoff 60s und Retry.
