

## Klarstellung: Email-Versand-Pfad

Du hast recht — wir nutzen bereits **Resend** (siehe `send-password-reset-email/index.ts` mit `import { Resend } from "resend"`). Es macht keinen Sinn, parallel Lovable Emails einzurichten. Der Plan wird angepasst:

## C2 Win-Back via Resend (statt Lovable Emails)

### Was bleibt gleich
- $5 AI-Video-Credits an Tag 14 (in `ai_video_wallets`)
- 20% Stripe-Coupon `WINBACK20` (3 Monate) an Tag 30
- Pg_cron daily 11:00 UTC
- Idempotenz via `winback_email_log`
- Push-Notifications parallel
- Auto-Stop bei Reaktivierung in den letzten 7 Tagen

### Was sich ändert (vs. vorheriger Plan)
- **Kein** `email_domain--setup_email_infra`, **kein** `scaffold_transactional_email`, **keine** pgmq-Queues
- Email-Versand direkt via **Resend SDK** im Stil von `send-password-reset-email`
- HTML-Templates inline in der Edge Function (gleiches AdTool-Branding: `#0a0a0f` BG, `#F5C76A` Gold, Inter)
- Domain `support@useadtool.ai` (bereits verifiziert, da bestehend genutzt)

### Implementierungs-Schritte

**1. Stripe-Coupon `WINBACK20`** (20% off, 3 Monate, repeating) via `stripe--create_coupon`

**2. DB-Migration**
- `winback_email_log` (user_id, stage `day_14|day_30`, sent_at, UNIQUE(user_id, stage))
- RLS: nur Service-Role schreibt

**3. Edge Function `process-winback-emails`** (Resend-basiert)
- Auth: Service-Role + optional Cron-Secret Header
- Day-14-Branch:
  - Query: User mit `last_sign_in_at` zwischen 13–15 Tagen, noch kein Day-14-Log
  - Grant $5 in `ai_video_wallets` + Insert in `ai_video_transactions` (type=`bonus`, description="Win-back reward Day 14")
  - Sende Email via Resend (`from: "AdTool <support@useadtool.ai>"`)
  - Web-Push parallel (falls Subscription)
  - Insert in `winback_email_log` (ON CONFLICT DO NOTHING)
- Day-30-Branch: gleiche Logik, mit Coupon-Code `WINBACK20`
- Auto-Stop bei `last_sign_in_at` < 7 Tage
- Sprache aus `profiles.language` für Template-Auswahl

**4. HTML-Templates** (3 Sprachen × 2 Stages = 6 Varianten, alle inline)
- Day-14 DE/EN/ES: "Wir vermissen dich" / "We miss you" / "Te extrañamos" + "$5 für deinen nächsten KI-Clip" + CTA → `/ai-video-studio`
- Day-30 DE/EN/ES: "Letzte Chance" / "Last chance" / "Última oportunidad" + Coupon `WINBACK20` + CTA → `/pricing?coupon=WINBACK20`
- Branding wie `send-password-reset-email`: dunkler BG, Gold-Logo, Footer mit Links

**5. Pg_cron-Schedule** täglich 11:00 UTC ruft Edge Function via `pg_net` + Vault-Secret auf

**6. Tracking** (PostHog)
- `winback_email_sent` (mit stage)
- `winback_reactivated` (User loggt sich nach Email ein)

### Voraussetzung-Check
- ✅ `RESEND_API_KEY` ist bereits konfiguriert
- ✅ Domain `useadtool.ai` ist bereits in Resend verifiziert (genutzt von `send-password-reset-email`)
- → **Keine Email-Infra-Setup-Schritte nötig**

### Aufwand: ~1h (statt 1.5h, da kein Email-Infra-Setup)

### Reihenfolge nach Approval
1. DB-Migration `winback_email_log`
2. Stripe-Coupon `WINBACK20`
3. Edge Function `process-winback-emails` (mit allen 6 Templates inline)
4. Pg_cron-Schedule
5. Manueller Test mit Test-User

