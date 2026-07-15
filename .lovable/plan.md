# Pre-Launch Deep-Dive Audit — Go-Live 26.07.2026

Ziel: Systematischer End-to-End-Check aller kritischen Pfade. Kein Feature-Build, kein Refactor — nur Audit + gezielte Härtungs-Fixes, wo wir konkrete Risiken finden.

## Audit-Scope (7 Blöcke)

### 1. Auth & Onboarding
- Sign-up / Login / Password-Reset / Google OAuth Redirect-URIs
- E-Mail-Verifizierung + Suppression-Liste + 3-Tage-Cap
- Onboarding-Flow inkl. Cinema-Concierge Trigger
- `user_roles` Absicherung (keine Client-Role-Checks, `has_role` Function korrekt)

### 2. Billing & Founders-Programm
- Stripe: 14.99 € Beta-Basic Produkt + Preis-ID live?
- Founders 20 % Coupon (`FOUNDERS_VIDEO_20`) + 24-Monate-Preisgarantie
- Status-Forfeit-Logik bei Kündigung
- `claim_founders_slot` RPC + Slot-Zähler
- Webhooks (checkout.completed, subscription.updated, invoice.failed)
- Refund-Automation bei Render-/Provider-Fehlern

### 3. Studios — Wiring & Persistenz
- Cast & World (Charaktere/Outfits/Locations/Props, IDs sichtbar, Voice-Zuordnung)
- Motion Studio, Director's Cut, Universal Content Creator, Video Composer
- AI Video Studio inkl. Kling Omni Media-Lock + DE-Silent-Mode
- Picture Studio, Music Studio, Audio Studio + Voice Studio
- Prüfung: Session-Persistenz (kein Datenverlust bei Reload/Render), Lip-Sync-Intent-Toggle-Veto, Progress-Bar-Consistency

### 4. Backend & Sicherheit
- RLS-Check aller neu angelegten Tabellen (Founders, Voice-Lib, Companion, Render-Queue)
- GRANTs auf public.* für neu erstellte Tabellen
- Edge Functions: CORS-Preflight, Timeouts, Error-Handling, Idempotenz
- Secrets: Keine geleakten Keys im Frontend, ElevenLabs/Replicate/Sync.so Keys gesetzt
- Security-Scanner-Run + Ergebnis dokumentieren

### 5. Render-Pipeline & Queue
- 60-Slot Lambda-Pool + Founders-Priority-Queue Dispatcher (`pg_cron` tickt?)
- Credit-Refund bei Render-Failures (idempotent)
- Lip-Sync-Pipeline v55 (audioInput refId-only, stale-payload-guard)
- Realtime-Fallback-Polling aktiv

### 6. Frontend & Public Pages
- Startseite (Hero, AI Arsenal Showcase mit Loops, Founders-Dialog, Footer-Links)
- Legal-Seiten (AGB §8, Impressum, Datenschutz) — Anker + Links
- SEO: Title/Meta/OG auf allen öffentlichen Routen, Sitemap aktuell
- 404 / Unauthorized / CheckEmail Flow
- Mobile-Responsive Spot-Check (Landing, Dashboard, ein Studio)

### 7. Observability & E2E
- Playwright Smoke-Suite lokal einmal grün?
- Sentry-Errors letzte 7 Tage sichten
- Admin-Monitoring-Dashboards funktionieren (Cost, Lambda-Health, Alerts, Render-Load)
- Cron-Heartbeats (Queue-Manager, Voice-Refresh, Email-Drip) laufen

## Deliverable

Nach Audit: **Pre-Launch-Report** mit
- ✅ Grün: was launch-ready ist
- 🟡 Gelb: was noch nice-to-have vor Launch
- 🔴 Rot: Blocker, die vor 26.07. gefixt werden müssen

Für Rot-Findings jeweils Mini-Fix-Plan (Datei, Aufwand, Risiko). Erst danach Build-Mode für die Fixes.

## Was NICHT Teil des Audits ist
- Neue Features
- UI-Redesigns
- Preisänderungen jenseits der bereits beschlossenen 14.99 € / 20 % Founders
- Umbau der Lip-Sync-Pipeline (nur Verifikation)

## Frage vor Start

Soll ich **direkt mit dem vollständigen 7-Block-Audit** starten (dauert lange, dafür einmal alles) oder **priorisiert nach Risiko** — also erst Billing + Auth + RLS/Secrets (Block 1, 2, 4), dann der Rest? Priorisiert = früher konkrete Blocker sichtbar.
