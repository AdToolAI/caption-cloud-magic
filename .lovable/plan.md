

# Instagram Sync Fix: Posts in `post_metrics` schreiben

## Problem
Genau dasselbe Problem wie bei Facebook:
- `instagram-graph-sync` schreibt in `ig_media` + `ig_media_metrics` — aber NICHT in `post_metrics`
- `sync-posts-history` schreibt in `posts_history` — aber NICHT in `post_metrics`
- Das Dashboard (`PlatformOverviewCards`) liest aus `post_metrics` → Instagram zeigt immer 0
- `instagram-graph-sync` nutzt hardcodierte Env-Vars (`FB_USER_LL_TOKEN`, `IG_PAGE_ID`) statt den OAuth-Token aus `social_connections`

## Lösung

### 1. `instagram-graph-sync` Edge Function umbauen
- **Token aus `social_connections`** laden und mit `decryptToken` entschlüsseln (wie bei Facebook)
- **Instagram User ID dynamisch** über die Page ermitteln (statt `IG_PAGE_ID` Env-Var)
- **Posts in `post_metrics` upserten** mit `provider: 'instagram'`, damit die Platform-Karten Daten anzeigen
- Bestehende `ig_account_daily` / `ig_media` / `ig_media_metrics` Logik beibehalten

### 2. Datenfluss nach Fix
```text
Sync Now → instagram-graph-sync
  ├─ Token aus social_connections laden + entschlüsseln
  ├─ Page Token → IG User ID ermitteln
  ├─ /{ig_user_id}/media → post_metrics (für Platform-Karten)
  ├─ /{ig_user_id}/insights → ig_account_daily (für Overview)
  └─ /{media_id}/insights → ig_media_metrics (Detail-Metriken)
```

### Technische Details
- Edge Function: `supabase/functions/instagram-graph-sync/index.ts`
- Import hinzufügen: `import { decryptToken } from '../_shared/crypto.ts'`
- Token-Quelle: `social_connections` WHERE `provider = 'instagram'`
- Upsert: `post_metrics` mit `provider: 'instagram'`, `onConflict: 'user_id,provider,post_id'`
- Engagement-Rate wird automatisch durch den DB-Trigger `compute_engagement_rate` berechnet
- Medien der letzten 90 Tage statt nur 7 Tage abrufen (für mehr Datenpunkte)

