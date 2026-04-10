
# Facebook Sync Fix: Posts in `post_metrics` schreiben

## Problem
- `facebook-page-sync` schreibt nur Seiten-Metriken in `fb_page_daily`
- Die Platforms-Übersicht (`PlatformOverviewCards`) liest aus `post_metrics` → Facebook zeigt immer 0
- Die Sync-Funktion nutzt hardcodierte Env-Vars statt den OAuth-Token aus `social_connections`

## Lösung

### 1. `facebook-page-sync` Edge Function umbauen
- **Token aus `social_connections`** laden (verschlüsselt gespeichert via `facebook-select-page`) statt `FB_USER_LL_TOKEN` Env-Var
- **Einzelne Posts der Facebook-Seite abrufen** via Graph API (`/{page_id}/posts?fields=id,message,created_time,permalink_url,shares,reactions.summary(true),comments.summary(true),insights.metric(post_impressions,post_impressions_unique)`)
- **Posts in `post_metrics` upserten** mit `provider: 'facebook'`, damit die Platforms-Karten sie anzeigen
- Bestehende `fb_page_daily`-Logik beibehalten für Seiten-Level-Metriken (wird in OverviewTab genutzt)

### 2. Token-Entschlüsselung
- Die Funktion `decryptToken` aus `_shared/crypto.ts` nutzen, um den Page Access Token aus `social_connections.access_token_hash` zu entschlüsseln

### 3. Datenfluss nach Fix
```text
Sync Now → facebook-page-sync
  ├─ Token aus social_connections laden + entschlüsseln
  ├─ /{page_id}/posts → post_metrics (für Platforms-Karten)
  └─ /{page_id}/insights → fb_page_daily (für Overview-Tab)
```

## Technische Details
- Edge Function: `supabase/functions/facebook-page-sync/index.ts`
- Crypto Import: `import { decryptToken } from '../_shared/crypto.ts'`
- Upsert-Logik: `post_metrics` mit `external_id` als Conflict-Key, `provider: 'facebook'`
- Graph API v24.0 beibehalten
- `engagement_rate` berechnen: `(likes + comments + shares) / reach * 100`
