

## Plan: Auto-Alert-System (mit `bestofproducts4u@gmail.com` als Admin-Empfänger)

### Was sich vs. ursprünglichem Plan ändert

Alle Alert-Emails und der Sonntags-Health-Report gehen an **`bestofproducts4u@gmail.com`** (deine echte Admin-Adresse), nicht mehr an `meta-reviewer@useadtool.ai`.

Außerdem fixe ich zwei vorhandene Inkonsistenzen:
- `provider-quota-alerter` nutzt aktuell `meta-reviewer@useadtool.ai` als Default → wird auf `bestofproducts4u@gmail.com` umgestellt
- `UserMenu.tsx` Zeile 61: Typo `bestofproducts4@gmail.com` (ohne `u`) → wird zu `bestofproducts4u@gmail.com` korrigiert

### Zentrale Admin-Email-Konfiguration

Statt die Email-Adresse hardcoded in jede Edge Function zu schreiben, lege ich eine **zentrale Konstante** an:

- **`supabase/functions/_shared/admin-config.ts`** — exportiert `ADMIN_ALERT_EMAIL = 'bestofproducts4u@gmail.com'` als Single Source of Truth
- Edge Functions importieren von dort: `import { ADMIN_ALERT_EMAIL } from '../_shared/admin-config.ts'`
- Falls du später ein zweites Admin-Konto möchtest, ist nur **eine** Datei zu ändern
- Optional: `Deno.env.get('ADMIN_ALERT_EMAIL')` überschreibt den Default (für Test-Setups)

### Was du bekommst

Ein **vollautomatisches Monitoring-System**, das dich an `bestofproducts4u@gmail.com` per Email warnt, **bevor** Probleme auftreten — plus einen **wöchentlichen Health-Report jeden Sonntag um 08:00 Uhr** mit allen KPIs.

### Was bereits existiert (wird wiederverwendet)

| Komponente | Status |
|---|---|
| `alert_notifications` Tabelle (RLS, Indizes, Cooldown) | ✅ vorhanden |
| `provider-quota-alerter` (Provider + Lambda) | ✅ läuft als Cron |
| `monitoring-alerts` (System Health) | ✅ vorhanden |
| `send-transactional-email` Edge Function | ✅ aktiv |
| Lovable Email Infrastructure | ✅ aktiv |

→ **Keine** neue Tabelle, **keine** neue Email-Pipeline, **keine** Migrations für DB-Tabellen.

### Was neu hinzukommt

#### 1. Neue Edge Function: `health-alerter` (5 neue Checks)

`supabase/functions/health-alerter/index.ts` — läuft per Cron alle 10 Minuten und prüft:

| Check | Trigger | Severity | Cooldown |
|---|---|---|---|
| 📧 **Bounce-Rate >2%** | Letzte 24h, Test-Adressen rausgefiltert | Warning | 60 min |
| 💰 **Cost-Forecast >80% Free-Tier** | Aus admin-cost-snapshot Logik | Warning | 6 Std |
| 💰 **Cost-Forecast >100% Free-Tier** | Über $25/Monat hochgerechnet | Critical | 60 min |
| 🔥 **Provider-Failures >3 in 5 Min** | provider_quota_log mit status=error | Critical | 15 min |
| ⚡ **Cache Hit-Rate <50%** | Aus cache_metrics über 1h | Warning | 2 Std |

Jeder Check nutzt das bestehende Cooldown-Pattern aus `alert_notifications`.

#### 2. Neue Edge Function: `weekly-health-report`

`supabase/functions/weekly-health-report/index.ts` — läuft **Sonntags 08:00** und sendet einen HTML-Report an `bestofproducts4u@gmail.com` mit:

- 📊 **Email-Health**: Sent / Bounce-Rate / Complaints letzte 7 Tage
- 💰 **Cost-Snapshot**: Cloud / AI / Lambda + Forecast vs Free-Tier
- 🚀 **App-Aktivität**: Neue Signups, neue Verifizierungen, erstellte Videos
- 🎬 **Render-Statistik**: Erfolgreiche/fehlgeschlagene Renders, Avg. Dauer
- 🚨 **Aktive Alerts**: Liste der unresolved Alerts der Woche
- 📈 **Trend-Vergleich**: vs Vorwoche mit ↑↓ Indikatoren

#### 3. Neuer Admin Tab: "Alerts"

**Neue Seite** `src/pages/admin/Alerts.tsx` als **7. Tab** im Admin-Dashboard (mit `Bell`-Icon).

```text
╔══════════════════════════════════════════════════════╗
║  🚨 Alerts & Health Monitoring     [Test Run] 🔄      ║
╠══════════════════════════════════════════════════════╣
║  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                  ║
║  │  0   │ │  2   │ │  5   │ │ ✓ OK │                  ║
║  │Critic│ │Warn  │ │Resolv│ │Last  │                  ║
║  │      │ │      │ │ed 7d │ │Check │                  ║
║  └──────┘ └──────┘ └──────┘ └──────┘                  ║
║                                                       ║
║  🔴 Aktive Alerts                                     ║
║  ⚠️  Cost-Forecast bei 82%  [Resolve]                 ║
║  ⚠️  Cache Hit-Rate fiel auf 47%  [Resolve]           ║
║                                                       ║
║  📋 Alert-Konfiguration                               ║
║  ✅ Bounce-Rate >2%      → bestofproducts4u@gmail.com ║
║  ✅ Cost >80% Free-Tier  → bestofproducts4u@gmail.com ║
║  ✅ Provider-Failures    → bestofproducts4u@gmail.com ║
║  ✅ Cache Hit-Rate <50%  → bestofproducts4u@gmail.com ║
║  ✅ Lambda 3/3 belegt    → bestofproducts4u@gmail.com ║
║  ✅ Wöchentl. Sonntags-Report (So 08:00)              ║
║                                                       ║
║  📜 Alert-Historie (letzte 30 Tage)        [Filter]   ║
╚══════════════════════════════════════════════════════╝
```

### Komponenten & Dateien

**Neu zu erstellen:**

1. `supabase/functions/_shared/admin-config.ts` — zentrale Admin-Email-Konstante
2. `supabase/functions/health-alerter/index.ts` — die 5 neuen Checks (~250 Zeilen)
3. `supabase/functions/weekly-health-report/index.ts` — Sonntags-Report (~200 Zeilen)
4. `src/pages/admin/Alerts.tsx` — Haupt-Page
5. `src/components/admin/alerts/AlertSummaryCards.tsx` — 4 KPI-Karten oben
6. `src/components/admin/alerts/ActiveAlertsCard.tsx` — Liste mit Resolve-Button
7. `src/components/admin/alerts/AlertConfigCard.tsx` — Übersicht aller Schwellen
8. `src/components/admin/alerts/AlertHistoryTable.tsx` — Historie mit Filter

**Geändert:**

9. `src/pages/Admin.tsx` — Neuer 7. Tab "Alerts" mit `Bell`-Icon
10. `supabase/functions/provider-quota-alerter/index.ts` — Default-Email auf `ADMIN_ALERT_EMAIL` aus shared config umstellen
11. `src/components/layout/UserMenu.tsx` Zeile 61 — Typo-Fix `bestofproducts4@gmail.com` → `bestofproducts4u@gmail.com`

**Migration (nur für Cron-Jobs, keine neuen Tabellen):**

12. Eine Migration für 2 neue pg_cron-Jobs:
   - `health-alerter` alle 10 Minuten
   - `weekly-health-report` jeden Sonntag um 08:00

### Email-Templates (Lovable Email)

Die Alert-Emails sind **System-Notifications** (transactional) — sie werden ausgelöst, weil ein konkretes Event eintritt (Bounce-Spike, Cost-Schwelle erreicht, Provider-Failure). Empfänger ist genau **eine** Person (du). Das erfüllt die Transactional-Kriterien.

**Zwei neue Templates:**
- `alert-warning` — Einzel-Alert-Email (rot/gelb je Severity, Message, Recommendation, Link zum Admin-Dashboard)
- `weekly-health-report` — HTML-Report mit allen Sektionen

Beide gehen via `send-transactional-email` Edge Function durch die Lovable Email Queue (mit Retry-Schutz, Cooldown via `alert_notifications`).

### Resolve-Logik

- **Auto-Resolve:** Wenn beim nächsten Check der Wert unter Schwelle ist → `resolved_at = now()`
- **Manuelles Resolve:** Button im UI setzt `resolved_at` manuell
- **Auto-Cleanup:** Alerts älter als 30 Tage werden gelöscht

### Cron-Konfiguration (pg_cron Migration)

```sql
SELECT cron.schedule(
  'health-alerter-every-10min',
  '*/10 * * * *',
  $$ SELECT net.http_post(...) $$
);

SELECT cron.schedule(
  'weekly-health-report-sunday-8am',
  '0 8 * * 0',
  $$ SELECT net.http_post(...) $$
);
```

### Sicherheit

- Edge Functions: Service-Role-Key intern, keine User-Auth (Cron-Aufruf)
- UI: Existierender Admin-Auth-Check (via `useUserRoles` + `has_role`)
- RLS auf `alert_notifications`: bereits vorhanden, nur Admins lesen

### UI-Style

Folgt dem bestehenden **James Bond 2028** Design (deep black, gold accents, glassmorphism) — analog zu Cost Monitor.

### Aufwand-Einschätzung

- **2 neue Edge Functions** (~450 Zeilen total)
- **1 shared config Datei** (~10 Zeilen)
- **1 neue Page + 4 Komponenten** (~400 Zeilen total)
- **1 Migration** für 2 Cron-Jobs
- **3 kleine Fixes** (Admin.tsx Tab, provider-quota-alerter, UserMenu Typo)
- **Keine neuen DB-Tabellen** — `alert_notifications` existiert bereits

→ **Mittlere Komplexität, machbar in einer Session.**

### Was du danach hast

✅ Alle Alerts gehen an deine echte Admin-Adresse `bestofproducts4u@gmail.com`  
✅ Email-Warnung **bevor** Probleme eskalieren (5 verschiedene Trigger)  
✅ Wöchentlicher Sonntags-Report mit allen wichtigen KPIs  
✅ UI zum Sehen aller aktiven & historischen Alerts  
✅ Manuelles + automatisches Resolve  
✅ Cooldown-Schutz (keine Email-Flut)  
✅ Zentrale Admin-Email-Config (nur eine Stelle ändern bei Bedarf)  
✅ Typo-Fix im UserMenu  

