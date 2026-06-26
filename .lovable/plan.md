
## Bestandsaufnahme — was läuft aktuell

**Sechs Email/Notification-Systeme feuern parallel auf denselben User:**

| Funktion | Cron-Frequenz | Was sie macht | Problem |
|---|---|---|---|
| `process-drip-emails` | **stündlich** (`0 * * * *`) | Onboarding-Steps Tag 1/3/7 | Stündliche Frequenz → bei Logik-Slip mehrfach pro Tag |
| `process-activation-emails` | täglich 10:00 | day_0, day_1, day_3, day_7 nach Verify | OK, aber überlappt mit Drip |
| `process-push-reminders` | **stündlich** :15 | Push-Reminder Step 1/3/7 | Stündlich = ggf. mehrfach täglich |
| `process-verify-reminders` | **alle 30 Min** | Verify-Reminder 24–72h nach Signup | Übertrieben häufig |
| `check-trial-status` | täglich 09:00 | Nur **grace_warning** (Tag 14) + **trial_expired** (Tag 28) | **Keine Reminder während Trial, keine 24h-vor-Pause-Warnung** |
| `process-winback-emails` | täglich 11:00 | Tag 14 + Tag 30 Inaktivität | OK |

**Ergebnis:** An einem einzigen Tag kann ein User Activation-Email + Drip-Email + Push-Reminder + Winback bekommen — vier Touches/Tag ist real, bei Edge-Cases (Multi-Step gleichzeitig fällig) bis zu 8.

**Was komplett fehlt:**
- Kein globaler Frequenz-Cap über alle Marketing-Emails hinweg
- Keine Trial-Countdown-Reminder (alle 3 Tage)
- Keine **Last-Day-Warnung vor Trial-Ende** (Tag 13)
- Keine **24h-vor-Pause-Warnung** (Tag 27, vor Grace-End)

---

## Plan — 3 chirurgische Eingriffe

### Schritt 1 — Globaler 3-Tage-Frequenz-Cap (das wichtigste Fix)

Neuer Shared-Helper `supabase/functions/_shared/emailFrequency.ts`:

```text
canSendMarketingEmail(userId, templateName)
  → liest email_send_log: letzter Send mit category='marketing' für diesen User
  → returnt false wenn < 3 Tage her (Ausnahmen: final_day, pre_pause, account_paused)
  → returnt true sonst
```

**Eingebaut in** alle vier kritischen Funktionen:
- `process-drip-emails`
- `process-activation-emails`
- `process-winback-emails`
- `check-trial-status` (nur für die neuen Countdown-Reminder, nicht für Pflicht-Warnungen)

**Bypass-Liste** (immer senden, egal wann letzte Email kam):
- Auth-Emails (signup/verify/recovery/magic-link)
- `trial_final_day` (Tag 13 — letzte Chance)
- `trial_pre_pause` (Tag 27 — 24h vor Account-Pause)
- `trial_expired` / `account_paused` (Pflicht-Info)
- Ticket-Updates, Password-Reset, etc.

### Schritt 2 — Trial-Lifecycle neu strukturieren

Erweiterung von `check-trial-status` um eine **Phase 0: Countdown-Reminder während Trial**:

```text
Trial Tag 0   → Welcome (bereits via activation day_0)
Trial Tag 3   → Reminder "So holst du das Maximum raus"   (nur wenn cap erlaubt)
Trial Tag 6   → Reminder "Was Power-User in Woche 1 bauen" (nur wenn cap erlaubt)
Trial Tag 9   → Reminder "Noch 5 Tage — bist du bereit?"   (nur wenn cap erlaubt)
Trial Tag 13  → ⚠ FINAL DAY: "Letzter Tag deines Trials"   (BYPASS cap)
Trial Tag 14  → Grace-Warning "Trial vorbei — 14 Tage Grace" (bereits da, BYPASS)
Grace Tag 27  → ⚠ PRE-PAUSE: "Morgen wird dein Account pausiert" (BYPASS cap — NEU)
Grace Tag 28  → Account-Paused-Notice (bereits da, BYPASS)
```

**Auto-Suppression-Regeln** (zusätzlich zum 3-Tage-Cap):
- User hat in den letzten 24h einen Post veröffentlicht → skip Countdown-Reminder (er ist aktiv)
- User hat bezahlt → alle Trial-Mails sofort stoppen
- User hat unsubscribed (`suppressed_emails`) → skip, außer Pflicht-Pause-Notice

**Storage:** `profiles.activation_emails_sent` JSONB (existiert bereits) bekommt neue Keys: `trial_day_3`, `trial_day_6`, `trial_day_9`, `trial_final_day`, `pre_pause_warning`.

### Schritt 3 — Cron-Frequenzen entschärfen

| Cron | Vorher | Nachher | Begründung |
|---|---|---|---|
| `process-drip-emails` | stündlich | **täglich 10:30** | Steps sind tagebasiert, stündlich macht null Sinn |
| `process-push-reminders` | stündlich | **täglich 18:00** | Push-Reminder = 1×/Tag Abend, optimal für CTR |
| `process-verify-reminders` | alle 30 Min | **alle 6h** | Verify-Reminder einmal nach 24h reicht, 30-Min-Scan ist verschwenderisch |

Alle drei via `supabase--insert` (cron.alter_job / unschedule+schedule), kein Migration-Tool.

---

## UI-Eingriff (klein)

Ein neuer Admin-Tab im QA-Cockpit: **Email Health**
- Letzte 7 Tage: Sends pro Template (deduped via `message_id`)
- Top-10-User mit meisten Sends/7d (Sanity-Check)
- "Force Pause All Marketing" Big-Red-Button (Notbremse, setzt System-Flag in `system_config`, alle Cap-Helpers respektieren ihn)
- Trial-Funnel-Sicht: Wie viele User sind in Tag 1/3/6/9/13/14/27/28

---

## Files

**Neu**
- `supabase/functions/_shared/emailFrequency.ts` (Cap-Helper)
- `src/components/admin/EmailHealthTab.tsx`
- `src/hooks/useEmailHealth.ts`

**Modifiziert**
- `supabase/functions/check-trial-status/index.ts` — Phase 0 Countdown + Phase 1.5 Pre-Pause (~80 Zeilen)
- `supabase/functions/process-drip-emails/index.ts` — Cap-Check (~5 Zeilen)
- `supabase/functions/process-activation-emails/index.ts` — Cap-Check (~5 Zeilen)
- `supabase/functions/process-winback-emails/index.ts` — Cap-Check (~5 Zeilen)
- `src/pages/admin/QACockpit.tsx` — neuer Tab

**SQL via `insert`-Tool** (kein Migration-Tool weil Cron-Daten user-spezifisch)
- 3× `cron.unschedule()` + `cron.schedule()` für die Frequenz-Änderungen

**Keine Schema-Migration nötig** — nutzt bestehende `activation_emails_sent` JSONB und `email_send_log`.

---

## Was bewusst NICHT angefasst wird
- Auth-Email-Hook (signup/verify/recovery) — funktioniert
- Render-Pipeline, Lipsync, Composer — null Berührung
- Ticket-Resolution-Mails (`notify-ticket-resolved`) — Pflicht-Trigger
- Calendar-Notifications (User-konfiguriert pro Event)

---

## Aufwand
~1h, in einer Sitzung machbar. Effekt: Statt 4–8 Mails/Tag im Worst-Case maximal **1 Marketing-Mail / 3 Tage** + die zwei Pflicht-Warnungen am Tag 13 & 27.

---

## Eine offene Frage an dich

Beim **Tag 13 (Final-Day)** und **Tag 27 (Pre-Pause)** — sollen diese auch eine zusätzliche **Push-Benachrichtigung** auslösen (falls User Push erlaubt hat), oder nur Email? Empfehlung: **Beides** — das sind die zwei einzigen wirklich konversions-kritischen Touches.
