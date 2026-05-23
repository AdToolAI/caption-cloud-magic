## Ziel
Meta (Instagram + Facebook) Long-Lived Tokens **automatisch** alle ~50 Tage erneuern, bevor sie nach 60 Tagen ablaufen — keine manuelle Token-Eingabe mehr nötig.

## Was wir bereits haben (wiederverwenden)
- `instagram-token-renew` — Edge-Function, die per `fb_exchange_token` aus einem Token einen 60-Tage Long-Lived Page-Token erzeugt. **Wird zur Kernlogik wiederverwendet.**
- `token-expiry-notifier` — Daily Cron, mailt User bei <7d Restlaufzeit.
- `social_connections` Tabelle mit `provider`, `account_id`, `access_token_hash`, `token_expires_at`.
- `instagram_token_backups` — Audit-Log für Token-Wechsel.

## Was fehlt und gebaut wird

### 1. Neue Edge-Function `auto-refresh-meta-tokens`
- Daily Cron-Trigger.
- Liest aus `social_connections` alle Rows mit `provider IN ('instagram','facebook')` und `token_expires_at < now() + 14 days`.
- Für jede Row:
  1. Token entschlüsseln (gleicher Mechanismus wie `instagram-publish` / `facebook-page-sync`).
  2. `GET /v24.0/oauth/access_token?grant_type=fb_exchange_token&client_id=…&client_secret=…&fb_exchange_token=<current_long_lived>` — Meta erlaubt Re-Exchange innerhalb der 60-Tage-Gültigkeit und gibt einen frischen 60-Tage-Token zurück.
  3. Bei Erfolg: neuen Token verschlüsseln + speichern, `token_expires_at = now() + 60d`, Audit-Eintrag in `instagram_token_backups`.
  4. Bei `error.code 190` (Token revoked/invalid/Passwort geändert): `account_metadata.connection_status = 'needs_reauth'`, sofortige Mail an User (nicht erst nach Ablauf warten).
  5. Bei anderen Fehlern: Retry-Counter +1, max 3 Retries über Folgetage, dann ebenfalls Notification.
- Idempotent: zweimal am gleichen Tag laufen lassen schadet nicht.
- Service-Role-Client, kein JWT nötig.

### 2. Hardcoded PAGE_ID rausziehen aus `instagram-token-renew`
- Zeile 21 (`const PAGE_ID = '797827560073785'`) → multi-tenant-Bug.
- Stattdessen `account_id` aus `social_connections` lesen oder per Request-Body übergeben.
- Bestehender manueller Flow (User pastes Token im Dialog) bleibt als **Fallback** funktional, falls Auto-Refresh fehlschlägt.

### 3. pg_cron Job
- Job `auto-refresh-meta-tokens-daily`, Schedule `0 3 * * *` (3 Uhr nachts UTC).
- Ruft die neue Edge-Function per `net.http_post` auf (Standard-Pattern, wie bei `qa-watchdog` / `poll-dialog-shots`).

### 4. Admin-Sichtbarkeit (klein)
- Neuer Tab/Sektion im QA-Cockpit: **„Social Token Health"** mit Liste aller Connections, Tagen bis Ablauf, letztem Refresh-Versuch + Status (✅ refreshed / ⚠️ needs_reauth / ❌ failed).
- Manueller „Refresh now"-Button pro Row, der die neue Edge-Function für genau diese Connection triggert.

### 5. Audit & Observability
- Jeder Refresh-Versuch → Insert in `instagram_token_backups` (existiert schon) mit Feldern: `old_expires_at`, `new_expires_at`, `result` (success|revoked|error), `error_message`.
- Sentry-Tag `meta_token_refresh` für Alerts bei Fehlerquote >20%.

## Out of Scope (bewusst weggelassen)
- **System-User-Tokens** (never-expiring) — würde Business-Manager-Setup pro Kunde erfordern. Kann später als Premium-Option nachgereicht werden.
- Auto-Refresh für TikTok/X/LinkedIn/YouTube — separate Token-Modelle, eigener Plan später.
- Token-Encryption-Migration — wir benutzen die existierende Verschlüsselungs-Helper-Function unverändert.

## Datei-Übersicht

```text
supabase/functions/
├── auto-refresh-meta-tokens/index.ts      [NEU]   ~200 LOC
└── instagram-token-renew/index.ts         [EDIT]  PAGE_ID dynamisch

supabase/migrations/
└── <ts>_auto_refresh_meta_cron.sql        [NEU]   pg_cron job

src/components/admin/
└── SocialTokenHealthCard.tsx              [NEU]   ~150 LOC

src/pages/AdminQACockpit.tsx               [EDIT]  Tab integrieren

mem/features/social-integrations/
└── meta-auto-refresh                      [NEU]   Memory-Eintrag
```

## Test-Strategie
1. Nach Deploy: `curl_edge_functions` mit Test-Connection-Row (`token_expires_at = now() + 7d`) → erwarte neuen Token, neues Expiry.
2. Mit absichtlich invalidem Token → erwarte `needs_reauth` Status + Mail.
3. Cron-Job-Lauf nach 24h → check `instagram_token_backups` für Audit-Eintrag.
4. Existierender manueller Flow im `InstagramTokenDialog.tsx` muss weiterhin funktionieren (Regression).

## Aufwand
~1.5h Implementierung + Test. Keine UI-Änderungen nötig außer Admin-Tab. Keine Schema-Änderungen (nur Cron-Job).
