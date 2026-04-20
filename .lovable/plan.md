

## Plan: Cost-Monitoring-Tab im Admin Dashboard

### Was du bekommst

Ein neuer Tab **"Cost Monitor"** in `/admin` (zwischen Cache Health und neu) mit Live-Sicht auf alle Kostenpunkte deiner App — basierend auf **echten Daten**, die wir bereits sammeln.

### Wichtige Erkenntnis vorab

Die Tabelle `credit_usage_events` ist leer, weil `trackUsage()` aktuell **nirgendwo aufgerufen** wird. Wir nutzen stattdessen die **echten Datenquellen**, die bereits voll funktionieren:

| Datenquelle | Was wir tracken |
|---|---|
| `provider_quota_log` | Jeder API-Call (Replicate, Gemini, ElevenLabs, OpenAI, Lovable AI) mit Dauer + Status |
| `director_cut_renders` + `video_renders` | AWS Lambda Renders (Dauer, Status) |
| `email_send_log` | Resend Email-Volumen |
| `wallets` + `ai_video_wallets` | User-Credits & AI-Video-Balance (Revenue-Seite) |

### Tab-Layout

```text
╔══════════════════════════════════════════════════════════╗
║  💰 Cost Monitor              Zeitraum: [7d ▼]   🔄      ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐         ║
║  │ Cloud   │ │ AI      │ │ Lambda  │ │ Forecast│         ║
║  │ $4.20   │ │ $0.18   │ │ 142 min │ │ ~$18/mo │         ║
║  │ /$25    │ │ /$1     │ │ 0/3 now │ │ ⚠️ 72%  │         ║
║  └─────────┘ └─────────┘ └─────────┘ └─────────┘         ║
║                                                          ║
║  📊 API-Calls per Provider (last 7d)         [Chart]     ║
║  ▓▓▓▓▓▓▓▓ Replicate    1,243 calls  ~$2.10              ║
║  ▓▓▓▓▓    Gemini         847 calls  ~$0.42              ║
║  ▓▓▓▓     ElevenLabs     312 calls  ~$0.95              ║
║  ▓▓       OpenAI         198 calls  ~$0.31              ║
║  ▓        Lovable AI      89 calls  ~$0.18              ║
║                                                          ║
║  🔥 Top 5 teuerste Edge Functions                        ║
║  ┌─────────────────────────┬──────┬────────┬──────────┐  ║
║  │ Function                │Calls │Avg Time│Est. Cost │  ║
║  ├─────────────────────────┼──────┼────────┼──────────┤  ║
║  │ render-directors-cut    │  142 │ 4.2 min│  $1.80   │  ║
║  │ generate-universal-video│   38 │ 12.3 s │  $0.45   │  ║
║  │ ...                                                 │  ║
║                                                          ║
║  📈 Verbrauchstrend (30 Tage)                [Line]     ║
║  [Recharts Line: Cloud + AI Spend per Day]              ║
║                                                          ║
║  🚨 Cost Alerts                                          ║
║  • Cloud-Verbrauch bei 72% — Hochrechnung $18/Monat ⚠️  ║
║  • Lambda-Renders +45% vs Vorwoche                       ║
╚══════════════════════════════════════════════════════════╝
```

### Komponenten & Dateien

**Neu zu erstellen:**

1. **`src/pages/admin/CostMonitor.tsx`** — Haupt-Page mit Layout
2. **`src/components/admin/cost/CostKpiCards.tsx`** — Die 4 Top-Karten
3. **`src/components/admin/cost/ProviderCostBreakdown.tsx`** — Tabelle pro Provider mit Schätzpreisen
4. **`src/components/admin/cost/TopExpensiveFunctionsCard.tsx`** — Top 5 Edge Functions
5. **`src/components/admin/cost/CostTrendChart.tsx`** — Recharts Line (30 Tage)
6. **`src/components/admin/cost/CostAlertsCard.tsx`** — Aktive Warnungen
7. **`src/lib/cost/pricing.ts`** — Schätzpreis-Tabelle (siehe unten)

**Neu (Edge Function):**

8. **`supabase/functions/admin-cost-snapshot/index.ts`** — Aggregiert alle Daten in einem Call (vermeidet 6 separate Round-Trips)
   - Admin-Auth-Check via `has_role(uid, 'admin')`
   - Liest `provider_quota_log`, `director_cut_renders`, `video_renders`, `email_send_log`
   - Berechnet Schätzkosten + Hochrechnung
   - Gibt strukturiertes JSON zurück

**Geändert:**

9. **`src/pages/Admin.tsx`** — Neuer 6. Tab "Cost Monitor" mit `DollarSign`-Icon

### Schätzpreis-Tabelle (`pricing.ts`)

Da wir keine echten $-Beträge von Resend/Replicate/etc. haben, nutzen wir öffentlich dokumentierte Preise als **Schätzwerte** (klar als „Estimated" markiert):

```typescript
export const PROVIDER_PRICING_USD = {
  replicate:  { perCall: 0.0017, note: 'Avg per Replicate API call' },
  gemini:     { perCall: 0.0005, note: 'Gemini 2.5 Flash avg' },
  elevenlabs: { perCall: 0.003,  note: 'TTS avg' },
  openai:     { perCall: 0.0015, note: 'GPT-5 avg input+output' },
  lambda:     { perMinute: 0.0167, note: 'Lambda 3008MB' }, // 0.00001667/sec
  resend:     { perEmail: 0.0004, note: 'Resend free tier exhausted' },
};

export const FREE_TIERS = {
  cloudBalanceUSD: 25,     // Lovable Cloud monthly free
  aiBalanceUSD: 1,         // Lovable AI monthly free
  lambdaConcurrent: 3,     // From memory rule
};
```

> **Hinweis:** Da Lovable Cloud die Cloud-Kosten **nicht per API exposed**, sind alle Cloud-Beträge **Schätzungen basierend auf gezählten API-Calls × dokumentierten Stückpreisen**. Das wird im UI explizit gekennzeichnet („Estimated · based on call volume").

### Berechnete Kennzahlen

| KPI | Formel |
|---|---|
| **Cloud Spend (est.)** | Σ (provider_quota_log.count × pricing.perCall) im Zeitraum |
| **AI Spend (est.)** | Σ (lovable-ai calls × $0.001) — separat vom $1 AI-Tier |
| **Lambda Minutes** | Σ (renders.duration_seconds) / 60, aus director_cut_renders + video_renders |
| **Lambda Active Now** | Count(render_queue.status = 'processing') |
| **Forecast Month** | (Spend last 7d / 7) × Tage_im_Monat |
| **% of Free Tier** | Forecast / 25 × 100 |

### Cost Alerts (Schwellen)

- 🟢 **<50%** Free-Tier-Verbrauch hochgerechnet → grünes „On Track"
- 🟡 **50–80%** → gelbe Warnung „Watch closely"
- 🔴 **>80%** → roter Alarm „Risk of overage"
- 🔴 **Lambda 3/3 belegt für >5 Min** → Capacity-Warnung
- 🟡 **Provider-Calls +50% vs Vorwoche** → Spike-Warnung

### Sicherheit (RLS)

Keine neuen DB-Tabellen → **keine neuen Migrations nötig**.  
Edge Function `admin-cost-snapshot` prüft selbst:
```typescript
const { data: isAdmin } = await supabase.rpc('has_role', {
  _user_id: user.id, _role: 'admin'
});
if (!isAdmin) throw new Error('Forbidden');
```

### UI-Style

Folgt dem bestehenden **James Bond 2028** Design (deep black, gold accents, glassmorphism) — wie die anderen Admin-Tabs.

### Aufwand-Einschätzung

- **Backend Edge Function**: 1 Datei (~150 Zeilen)
- **Frontend**: 6 Komponenten + 1 Page (~500 Zeilen total)
- **Pricing Config**: 1 kleine Datei
- **Admin.tsx**: 1 neuer Tab
- **Keine Migrations, keine neuen Tabellen, keine RLS-Policies**

→ **Mittlere Komplexität, machbar in einer Session.**

### Was du danach hast

✅ Echtzeit-Übersicht über deine Cloud-/AI-/Lambda-Kosten  
✅ Hochrechnung auf Monatsende mit Free-Tier-Vergleich  
✅ Top-5 teuerste Functions (für Optimierungs-Targeting)  
✅ 30-Tage-Trend als Line-Chart  
✅ Automatische Alerts ab 80% Verbrauch  
✅ Klar gekennzeichnete Schätzwerte (kein Fake-Genauigkeitsanspruch)  

