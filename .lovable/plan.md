

# Plan: Komplett-Paket — Phase 1 + 2 + 3 in einem Rutsch

Du wählst Option C → Wir fixen alle stillen Bugs sofort, erweitern den AI-Superuser um neue automatische Tests und installieren einen täglichen Consistency-Watcher.

## Phase 1 — Akute stille Failures fixen (sofortiger User-Impact)

### 1.1 Calendar-Publishing-Pipeline reaktivieren
- Die 18 alten Calendar Events (`scheduled` mit `start_at` >24h in der Vergangenheit) markieren wir als `expired` mit Hinweis-Log — sie als hängend zu zeigen wäre ein Karteileiche-Bug
- Neuen `pg_cron`-Job `dispatch-calendar-publishing` einrichten, der alle 5 Minuten die Edge Function `calendar-publish-dispatcher` aufruft
- Falls `calendar-publish-dispatcher` nicht existiert: Wir nutzen `check-scheduled-publications` (existiert bereits) als Fallback und ergänzen es um Calendar-Event-Handling

### 1.2 Storage-Quota-Backfill
- One-shot SQL-Script: Für alle 45 Profiles ohne `user_storage_quotas`-Zeile passende Default-Quota anlegen (basierend auf `wallets.plan_code`)
- Bestehender `initialize_storage_quota`-Trigger feuert offenbar nicht zuverlässig → wir prüfen den Trigger und reparieren ihn falls nötig

### 1.3 Campaign→Calendar Re-Sync
- Manueller Re-Sync für die 33 verwaisten `campaign_posts`: Trigger `sync_campaign_to_content_items` ist da, aber für Altbestand wurde er nie ausgeführt
- One-shot SQL: `INSERT INTO content_items` für alle Posts ohne entsprechenden Eintrag

### 1.4 Social-Token-Expiry-Notification
- Neue Edge Function `notify-expired-social-tokens` schreibt für alle abgelaufenen Tokens einen Eintrag in `alert_notifications` (User-sichtbar) + sendet Reconnect-Push/Email
- Token-Status im UI durch Badge „Reconnect erforderlich" auf der Connections-Seite

## Phase 2 — AI-Superuser erweitern (automatische Tests)

Fügen wir 5 neue Szenarien zur bestehenden Superuser-Suite hinzu:

| # | Szenario | Was geprüft wird |
|---|---|---|
| 11 | **Trial-Lifecycle-Test** | Erstellt Test-Profil mit Trial → simuliert Ablauf → prüft `account_paused`-Logik |
| 12 | **Calendar-Publish-Test** | Erstellt Event mit `start_at = now()` → prüft ob Dispatcher es innerhalb 6 Min greift |
| 13 | **Stripe-Webhook-Test** | Postet Test-Webhook-Payload an `stripe-webhook` → prüft Wallet-Update |
| 14 | **Onboarding-Complete-Test** | Durchläuft Onboarding-Steps headless via Edge Function → prüft `profiles`-Felder |
| 15 | **Social-Token-Refresh-Test** | Simuliert OAuth-Refresh-Call für jede Plattform → prüft Token-Encryption |

Jedes Szenario folgt dem bestehenden Schema (Eintrag in `ai_superuser_runs`, Status-Logging, Pass-Rate-Tracking).

## Phase 3 — Consistency-Watcher (täglicher Cron)

### Neue Edge Function `consistency-watcher`
Läuft täglich um 4:00 Uhr UTC und prüft systematisch:

| Check | Schwellwert | Action |
|---|---|---|
| Profiles ohne Wallet/Quota | > 0 | Alert + Auto-Backfill |
| Calendar Events `scheduled` mit `start_at` < now() − 1h | > 5 | Alert |
| `active_ai_jobs` älter als 2h | > 0 | Alert + Auto-Cleanup |
| `campaign_posts` ohne `content_items`-Sync | > 0 | Alert + Auto-Resync |
| Social-Tokens abgelaufen ohne Notification | > 0 | Alert + Notification senden |
| AI-Video-Generations stuck `processing` > 30 Min | > 0 | Alert + Refund-Check |
| `ai_video_wallets` mit negativem Balance | > 0 | Kritischer Alert |
| `director_cut_renders` stuck `rendering` > 1h | > 0 | Alert |

Findings landen in `alert_notifications` → erscheinen automatisch im **Alerts-Tab** des Admin-Dashboards.

### Cron-Setup
`pg_cron` Job `consistency-watcher-daily` → täglich 04:00 UTC → ruft Edge Function via `pg_net`.

## Technische Details

**Geänderte/neue Dateien**
- `supabase/functions/notify-expired-social-tokens/index.ts` (neu)
- `supabase/functions/consistency-watcher/index.ts` (neu)
- `supabase/functions/ai-superuser-test-runner/index.ts` (erweitert um 5 Szenarien)
- `src/pages/admin/AISuperuserDashboard.tsx` (UI für 5 neue Szenarien)
- `supabase/functions/calendar-publish-dispatcher/index.ts` (neu falls fehlt, sonst Fix)

**Datenbank-Migrationen**
- Trigger `initialize_storage_quota` reparieren (falls der Default-Lookup auf `wallets` fehlschlägt)
- Neue Spalte `expired_at` in `calendar_events` (oder Status-Wert `expired` ergänzen)

**One-shot Datenoperationen** (via Insert-Tool, nicht Migration)
- 18 alte Calendar Events → `status = 'expired'`
- 45 fehlende Storage-Quotas backfillen
- 33 verwaiste Campaign Posts → `content_items` re-syncen

**Cron-Jobs** (3 neue)
- `dispatch-calendar-publishing` — alle 5 Min
- `consistency-watcher-daily` — täglich 04:00 UTC
- `notify-expired-tokens-hourly` — stündlich

## Erwartetes Ergebnis

- ✅ 18 alte Calendar Events sauber als `expired` markiert (keine Karteileichen mehr)
- ✅ Auto-Publishing für neue Events läuft alle 5 Min
- ✅ 45 Storage-Quotas backfilled, Trigger repariert
- ✅ 33 Campaign Posts erscheinen im Kalender
- ✅ User mit abgelaufenen Tokens werden aktiv informiert
- ✅ AI-Superuser deckt 15 statt 10 kritische Flows ab (50 % mehr Coverage)
- ✅ Täglicher Consistency-Watcher findet zukünftige stille Bugs ohne dein Zutun
- ✅ **Du brauchst keine Testuser für Standard-Flows mehr** — das System testet sich selbst

## Reihenfolge der Umsetzung

1. **Phase 1.1** Calendar-Cron + alte Events aufräumen (höchster Impact)
2. **Phase 1.2 + 1.3** Storage + Campaign Backfills (parallel)
3. **Phase 1.4** Token-Notification
4. **Phase 3** Consistency-Watcher deployen + Cron einrichten
5. **Phase 2** Superuser um 5 neue Szenarien erweitern
6. **Verifikation**: Komplett-Test im AI-Superuser → 15/15 grün erwartet

