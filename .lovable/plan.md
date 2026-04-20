

User-Anpassung: **20% Rabatt-Coupon (statt 50%) für 3 Monate** in der Day-30 Win-Back-Email.

## C2 Win-Back-Kampagne — Final-Spec

### Belohnungs-Struktur
- **Tag 14 inaktiv:** $5 AI-Video-Credits (in `ai_video_wallets`)
- **Tag 30 inaktiv:** Stripe-Coupon **20% off, 3 Monate** (Code: `WINBACK20`)

### Implementierung

**1. Stripe-Coupon erstellen**
- Name: "Win-Back 20% Off"
- 20% percent_off, duration `repeating`, 3 Monate
- Promotion-Code: `WINBACK20`

**2. DB-Migration**
- Tabelle `winback_email_log` (user_id, stage `day_14|day_30`, sent_at, unique constraint auf `(user_id, stage)`)
- RLS: Service-Role schreibt, User liest nur eigene Logs

**3. Edge Function `process-winback-emails`**
- Cron: täglich 11:00 UTC via pg_cron
- **Day-14-Branch:** User mit `last_sign_in_at` zwischen 13–15 Tagen
  - Grant: $5 in `ai_video_wallets` via `ai_video_transactions` (type=`bonus`, description="Win-back reward Day 14")
  - Email "Wir vermissen dich" + Push parallel
  - Log in `winback_email_log` (ON CONFLICT prevents Doppelversand)
- **Day-30-Branch:** User zwischen 29–31 Tagen
  - Email "Letzte Chance" mit Code `WINBACK20` (20% off, 3 Monate)
  - CTA → `/pricing?coupon=WINBACK20`
  - Push parallel + Log
- **Auto-Stop:** User in den letzten 7 Tagen aktiv → kein Mailing
- **Suppression-Check:** Automatisch via `send-transactional-email`

**4. Email-Templates (DE/EN/ES)**
- `winback-day-14`: "Wir vermissen dich" + "$5 für deinen nächsten KI-Clip" + CTA → `/ai-video-studio`
- `winback-day-30`: "Letzte Chance" + "20% Rabatt für 3 Monate" + Code `WINBACK20` + CTA → `/pricing`
- Sprache aus `profiles.language`
- React-Email-Templates in `_shared/transactional-email-templates/`

**5. Tracking**
- PostHog: `winback_email_sent` (mit stage), `winback_reactivated`

### Voraussetzungen-Check (vor Start)
1. Email-Domain-Status prüfen → ggf. Setup-Dialog
2. Email-Infrastruktur (`setup_email_infra`) ggf. provisionieren
3. Transactional-Email scaffold falls nicht vorhanden

### Reihenfolge nach Approval
1. Email-Domain & Infra prüfen/aufsetzen
2. DB-Migration (`winback_email_log`)
3. Stripe-Coupon `WINBACK20` erstellen
4. 2 Email-Templates × 3 Sprachen (DE/EN/ES)
5. Edge Function `process-winback-emails`
6. Pg_cron-Schedule (11:00 UTC daily)
7. End-to-End-Test mit Test-User

### Aufwand: ~1.5h

