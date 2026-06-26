# Launch-Readiness & AI-Support-Pipeline

## Teil A — Launch-Readiness Status (Kurz-Audit)

**Bereits live & grün:**
- 467/473 Edge Functions Smoke-tested
- Stripe-Payments + TRIAL20-Coupon
- Status-Page `/status` + Watchdog + Synthetic Probes
- Auth-Emails + Email-Queue (pgmq + cron) + Suppression-Liste
- `support_tickets` Tabelle + `send-support-ticket` Funktion (sendet bereits an `info@useadtool.ai`)
- SupportWizard + MyTicketsList UI

**Lücken vor Paid-Launch:**
1. **Kein AI-Triage** auf eingehenden Tickets → Antwort dauert manuell
2. **Keine Auto-Bestätigung** an Kunden mit ETA
3. **Keine Auto-Notify** beim Statuswechsel `resolved`
4. **Keine Verknüpfung** Ticket ↔ Status-Page-Incident (wenn Bug bereits bekannt)

## Teil B — AI-Support-Pipeline (deine Idee, ja sehr sinnvoll)

### Flow

```text
Kunde sendet Ticket (Wizard / Email-Reply)
       │
       ▼
[send-support-ticket]  ──►  support_tickets INSERT
       │
       ├─► Auto-Confirm Email an Kunde (sofort)
       │   "Ticket #1234 erhalten, AI analysiert gerade…"
       │
       └─► triage-support-ticket (async via pg_notify)
              │
              ▼
        Gemini 2.5 Flash:
        - Kategorie (bug/billing/howto/feature)
        - Severity (low/normal/high/blocking)
        - Root-Cause-Hypothese
        - Match gegen offene status_incidents
        - ETA-Vorschlag (1h / 24h / 3d / 1w)
        - Vorgeschlagene Antwort (DE/EN/ES)
              │
              ├─► UPDATE support_tickets SET ai_analysis, eta, suggested_reply
              ├─► Email an info@useadtool.ai (mit User-Kontext + Plan + letzte Renders)
              └─► Email an Kunden: "Wir haben deine Anfrage analysiert.
                                    Voraussichtliche Lösung in ~{ETA}.
                                    {kontextuelle Erstantwort}"

Admin im Cockpit: 1-Klick "Approve & Send" oder "Mark Resolved"
       │
       ▼
Status = resolved  ──►  Trigger notify-ticket-resolved
                              └─► Email an Kunde: "Fixed ✓ — bitte teste"
```

### Was gebaut wird

**1. DB-Migration** — `support_tickets` erweitern:
- `ai_category`, `ai_severity`, `ai_root_cause`, `ai_eta_hours`, `ai_suggested_reply`, `ai_analyzed_at`
- `linked_incident_id` (FK auf `status_incidents`)
- `resolved_notification_sent_at`
- Trigger: bei `status → resolved` queue Email

**2. Edge Function `triage-support-ticket`**
- Input: `ticket_id`
- Lädt Ticket + User-Profile + letzte 5 Errors aus `runtime_errors`/`bug_reports`
- Gemini 2.5 Flash Tool-Call → strukturiertes Triage-JSON
- Matched gegen offene `status_incidents` (Vector-Similarity auf description)
- Schreibt zurück + verschickt 2 Emails (Kunde + Inbox)

**3. Edge Function `notify-ticket-resolved`**
- Triggered durch DB-Trigger (pg_net) bei `status → resolved`
- Sendet React-Email "Fixed" Template

**4. React-Email Templates** in `_shared/transactional-email-templates/`:
- `support-ticket-received.tsx` (sofortige Eingangsbestätigung)
- `support-ticket-triaged.tsx` (AI-Analyse + ETA + Antwort)
- `support-ticket-resolved.tsx` (Fix-Notification)
- Registry-Eintrag + deploy

**5. Admin-Cockpit-Tab "Support Inbox"** unter `/admin/qa-cockpit`:
- Liste aller Tickets mit AI-Analyse-Spalte
- 1-Klick "Send Suggested Reply" / "Approve ETA" / "Mark Resolved"
- Link zu verknüpftem Incident
- Filter: Offen / In Progress / Resolved heute

**6. Auto-Suggest auf Status-Page**
- Wenn Ticket mit `linked_incident_id` → User sieht Banner "Wir arbeiten dran: {incident.title}"

### Kosten
- Gemini 2.5 Flash Triage: ~0.001€/Ticket (negierbar)
- Email-Sends laufen über bestehende Lovable-Emails-Queue (kein Extra-Provider)

### Sicherheit
- AI-Antwort wird **NICHT** automatisch versendet ohne Admin-Approve (Default OFF), nur als Vorschlag
- Toggle `system_config.support.auto_send_ai_reply = false` per Default
- User können später auf "Auto" wechseln wenn Confidence hoch genug

## Teil C — Out of Scope (für später)
- Inbound-Email-Parsing (Kunden antworten direkt per Email → Ticket-Update). Braucht Mailgun/Postmark Inbound-Webhook. Vorschlag: Phase 2.
- Multi-Agent-Inbox (mehrere Support-Mitarbeiter). Aktuell genügt 1 Inbox.

## Empfehlung
Vor Paid-Launch: **Teil B komplett bauen** (geschätzt 1 Iteration). Danach grün für Marketing-Spend.
