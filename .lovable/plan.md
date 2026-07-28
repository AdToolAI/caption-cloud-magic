
# Pre-Launch Security & Go-Live Roadmap

Ziel: In den verbleibenden ~48 h alle drei relevanten Blöcke sauber abarbeiten, sodass ohne offene Sicherheitslücken und mit definiertem Fallback live gegangen werden kann.

> Cloudflare ist bereits im Einsatz — statt Neu-Setup nur **Config-Audit & Hardening** der bestehenden Installation.

---

## Block 1 — Security-Hardening Sprint (Pre-Launch, Tag 1)

### 1.1 Auth-Härtung
- **Leaked-Password-Protection (HIBP)** über `configure_auth` aktivieren
- **Passwort-Mindestlänge** auf 10 Zeichen anheben
- **2FA-Pflicht für Admin-Rolle**: Login-Gate in `AdminLayout` — Admins ohne aktiven TOTP-Faktor werden auf `/account?tab=security&enroll=1` umgeleitet
- **Session-TTL** für Admin-Rolle auf 8 h begrenzen (statt Default 7 Tage)

### 1.2 Rate-Limiting auf teure Edge Functions
Zentrales `rate-limit` Modul in `supabase/functions/_shared/rateLimit.ts` (per-IP + per-user, neue `rate_limits`-Tabelle mit TTL-Cleanup). Anwenden auf:
- `compose-video-clips`, `compose-twoshot-audio`, `compose-scene-anchor` → 20/h pro User
- `generate-music-track`, `clone-voice`, `voice-generate` → 30/h pro User
- `instant-avatar-demo` → bereits 3/h pro IP, ergänzen um 20/Tag pro IP
- `briefing-deep-parse` → 40/h pro User
- Auth/Signup-Endpoints → 10/min pro IP

Response bei Limit: HTTP 429 + `Retry-After` Header + Toast im Frontend.

### 1.3 Stripe-Webhook-Härtung
- Alle Webhook-Handler (`stripe-webhook`, `stripe-founders-webhook`) auf **Signatur-Verify** prüfen (`stripe.webhooks.constructEvent`)
- Idempotency-Key aus `event.id` in `stripe_webhook_events` Tabelle persistieren; Duplikate früh abweisen
- Timeout auf 25 s, Async-Verarbeitung via Background-Task

### 1.4 Storage-Bucket-Audit
- Alle Buckets auflisten und pro Bucket sicherstellen:
  - RLS aktiv
  - Erste Path-Komponente = `auth.uid()::text`
  - `public: false` außer für explizite Public-Assets (`landing-assets`, `avatars-public`)
- Öffentlich lesbare Buckets in `SECURITY_MEMORY.md` dokumentieren

### 1.5 RLS-Sweep
- `security--run_security_scan` ausführen
- Alle **ERROR**-Findings vor Launch fixen
- **WARN**-Findings triagieren (fix vs. ignore mit Begründung im Security-Memo)
- Auf jeder `public.*`-Tabelle GRANT-Statements verifizieren

### 1.6 Sensitive-Data-Sweep
- `console.log`/`console.error` in Edge Functions: keine Klartext-Emails, Tokens, Stripe-Objekte loggen
- Sentry `beforeSend` erweitern um Redaction für `email`, `stripe_customer_id`, `access_token`

**Aufwand:** ~6–8 h.

---

## Block 2 — Cloudflare Config-Audit (bestehende Installation)

Kein Neu-Setup, sondern gezielte Prüfung & Härtung der aktuellen Konfiguration.

### 2.1 Ist-Zustand erfassen
Für **beide** Domains (`captiongenie.app`, `useadtool.ai`):
- SSL-Modus prüfen → Ziel: **Full (Strict)** (nicht Flexible!)
- Proxy-Status (orange cloud) auf allen produktiven Records aktiv?
- Always Use HTTPS: on
- HSTS: aktiv, min. 6 Monate, includeSubDomains
- Automatic HTTPS Rewrites: on
- Min TLS Version: 1.2

### 2.2 WAF & Bot-Schutz aktivieren/verifizieren
- **Managed Rules**: Cloudflare Managed Ruleset + OWASP Core Ruleset auf **Medium** Sensitivity
- **Bot Fight Mode** on (bei Pro-Plan: **Super Bot Fight Mode** mit "Definitely automated → Block", "Likely automated → Managed Challenge")
- **Security Level**: Medium
- **Challenge Passage**: 30 min

### 2.3 Rate-Limiting-Rules (Pro-Feature)
Prüfen ob Pro-Plan aktiv; falls ja folgende Rules anlegen:
- `/auth/*` → 20 req/min pro IP → Block 10 min
- `/functions/v1/*` (Supabase Edge Functions) → 100 req/min pro IP → Managed Challenge
- `/functions/v1/instant-avatar-demo*` → 5 req/min pro IP → Block
- Falls Free-Plan: Rate-Limiting im Rate-Limit-Modul (Block 1.2) reicht — Cloudflare-Rate-Limits sind dann nice-to-have

### 2.4 Wichtige Skip-Rules
- **Stripe-Webhooks** (`/functions/v1/stripe-webhook*`, `/functions/v1/stripe-founders-webhook*`) → Bot Fight Mode + Security Level = Off (sonst blockt Cloudflare Stripes IPs)
- **Replicate/HappyHorse-Webhooks** falls Inbound → gleiches Skip
- **Sentry-Ingest** falls über eigene Domain → Skip

### 2.5 Security-Header via `public/_headers` ergänzen
- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` restriktiv (camera, microphone nur für Voice-Studio-Route)
- CSP später (Post-Launch, weil Aufwand mit Sentry/PostHog/Stripe-Inline nicht trivial)

### 2.6 Verifikation
- **SSL Labs**: Ziel A+ für beide Domains
- **securityheaders.com**: Ziel A
- Stripe-Testkauf durchführen → Webhook muss ankommen
- Von externem Netz + VPN prüfen, dass keine legit User geblockt werden

**Aufwand:** ~2 h.

---

## Block 3 — Pen-Test-Vorbereitung (Tag 2, Test läuft nach Launch)

### 3.1 Scope-Dokument (`docs/security/pentest-scope.md`)
- **In Scope**: beide Domains, alle Edge Functions, Auth-Flow, Stripe-Flow, Cast-&-World-Storage
- **Out of Scope**: Supabase-managed Infra, Cloudflare, Replicate/HappyHorse (Third-Party), Landing ohne Login
- **Test-Fokus**:
  1. RLS-Bypass (User A liest User B?)
  2. Auth-Escalation (Free-User → Admin-Endpoint?)
  3. Stripe-Webhook-Fälschung
  4. Storage-Bucket-Traversal
  5. Edge-Function-Injection (SQL, Command, Prompt-Injection)
  6. Rate-Limit-Bypass
- **Verboten**: DDoS, Social-Engineering, Physical

### 3.2 Test-Accounts
- 3 Test-User (Free / Basic-Beta / Pro-Beta) mit realen Credits
- 1 Test-Admin, 1 Test-Workspace mit 2 Members
- Credentials in Passwort-Manager (nicht Repo)

### 3.3 Read-only DB-Snapshot
- Anonymisierter Snapshot via Cloud → Advanced → Export data
- Emails, Zahlungsdaten vor Übergabe maskieren

### 3.4 Drei Angebote parallel einholen
- **Cure53** (DE, Premium, ~8–15k €)
- **usd AG** (DE, DSGVO-Report, ~4–7k €) — meine Empfehlung
- **SecureLayer7** (Offshore, ~2–4k €)

### 3.5 Bug-Bounty vorbereiten (ab Woche 4)
- Private Program bei **Intigriti** vorregistrieren
- Rewards: Critical 1500 €, High 500 €, Medium 150 €, Low 50 €
- `SECURITY.md` im Repo-Root mit Disclosure-Policy + Kontakt

**Aufwand:** ~3–4 h Vorbereitung.

---

## Block 4 — Go-Live-Checkliste (Launch-Tag)

Operatives Runbook in `docs/launch/RUNBOOK.md`.

### 4.1 T-24h Checks
- [ ] Alle Migrations auf Prod, `supabase--linter` clean
- [ ] Security-Scan: 0 Critical, 0 High offen
- [ ] Cloudflare-Audit (Block 2) grün
- [ ] Stripe: Live-Keys gesetzt, Webhooks auf Live-URL, `FOUNDERS_VIDEO_20` aktiv, Test-Kauf + Refund erfolgreich
- [ ] Email-Pipeline: Test-Mails (Signup / Reset / Welcome / Founders) im Posteingang, nicht Spam
- [ ] `robots.txt`, `sitemap.xml` korrekt; `noindex` auf Staging
- [ ] Sentry-Alerts konfiguriert (Slack-Webhook), Error-Rate-Threshold gesetzt
- [ ] PostHog-Dashboards live (Signup-Funnel, Video-Gen-Success, Refund-Rate)

### 4.2 T-1h Checks
- [ ] `BETA_ACTIVE = false` (Half-Finished-Hubs versteckt für Nicht-Admins)
- [ ] Founders-Zähler 0/1000
- [ ] Support-Postfach `support@useadtool.ai` funktioniert, Autoresponder aktiv
- [ ] Status-Page (empfohlen: **instatus.com** Free) unter `status.useadtool.ai` live
- [ ] Admin-2FA für alle Owner aktiviert

### 4.3 Go-Live-Sequenz
1. Cloudflare DNS TTL auf 300 s absenken (Vortag)
2. `preview_ui--publish` — Custom Domain wird automatisch bedient
3. Smoke-Test manuell: Signup → Cast-Char → Video → Kauf → Refund
4. Founders-Kampagne triggern
5. Sentry + PostHog Live-Monitoring in Slack `#launch-warroom`

### 4.4 Rollback-Plan
- **L1 (Feature-Flag)**: Feature per Flag deaktivieren (< 1 Min)
- **L2 (Maintenance-Mode)**: Cloudflare Worker → `/maintenance.html` (< 5 Min)
- **L3 (Rollback)**: Lovable Chat History → letzter stabiler Commit + Publish (< 15 Min)
- **L4 (DB-Rollback)**: PITR via Cloud → Advanced (< 60 Min, Datenverlust seit Snapshot)

### 4.5 Post-Launch T+24h Review
- Error-Rate < 0.5 %
- Video-Gen-Success ≥ 85 %
- Refund-Rate < 5 %
- Support-Ticket-Volume + Founders-Belegung dokumentieren
- Retro in `docs/launch/POST_LAUNCH_REVIEW.md`

**Aufwand:** ~4 h Runbook + Setup Status-Page + Alerting.

---

## Umsetzungs-Reihenfolge

```text
Tag 1 (~9 h)
├─ Block 1: Security-Hardening
│   ├─ configure_auth (HIBP + Passwort-Länge)     [30 min]
│   ├─ rate_limits Tabelle + Shared-Modul          [2 h]
│   ├─ Rate-Limits in 8 Edge Functions             [2 h]
│   ├─ Admin-2FA-Gate                              [1 h]
│   ├─ Stripe-Webhook-Idempotency                  [1 h]
│   ├─ Storage-Bucket-Audit + Fixes                [1.5 h]
│   ├─ Security-Scan + Fixes                       [1.5 h]
│   └─ Sensitive-Data-Sweep                        [0.5 h]

Tag 2 (~9 h)
├─ Block 2: Cloudflare-Audit                       [2 h]
├─ Block 3: Pen-Test-Vorbereitung                  [3.5 h]
└─ Block 4: Runbook + Status-Page + Alerts         [3.5 h]

Tag 3: Launch — Runbook abarbeiten
```

---

## Nicht in diesem Plan (explizit ausgeklammert)

- Feature-Änderungen (reiner Security- & Launch-Fokus)
- Preisänderungen (19,99 € / 15,99 € Founders bleiben)
- UI-Redesign
- Managed SOC / SIEM (erst ab ~10k MAU)
- ISO 27001 / SOC 2 (erst wenn Enterprise-Kunden es fordern)
- Neu-Aufsetzen von Cloudflare (bereits vorhanden, nur Audit)

---

## Deliverables

1. Auth-gehärtete, rate-limited Backend-Umgebung
2. Cloudflare-Config auditiert & gehärtet, Skip-Rules für Stripe
3. Vollständiges Pen-Test-Paket (Scope, Accounts, 3 Angebote in der Inbox)
4. `docs/launch/RUNBOOK.md` + Status-Page + Sentry-Alerts
5. Aktualisiertes `SECURITY_MEMORY.md`
6. `SECURITY.md` im Repo-Root für Responsible Disclosure

Nach Approval starte ich mit **Block 1** (Auth-Härtung + Rate-Limits) — größte Angriffsfläche vor Launch.
