

# Lambda Health Dashboard — Plan

## Ziel
Admin-UI-Cockpit unter `/admin/lambda-health`, das die Lambda-Render-Performance live visualisiert — kein SQL mehr nötig.

## Datenquellen (alle vorhanden ✅)

| Quelle | Verwendung |
|--------|-----------|
| `lambda_health_metrics` (status, duration_ms, memory_used_mb, error_message, created_at) | Failure-Rate, Erfolgsquote, Trend, Memory |
| `system_config` (lambda_max_concurrent, lambda_max_concurrent_safe) | Aktuelle Concurrency + Circuit-Breaker-Status |
| `render_cost_history` (actual_cost, duration_sec) | AWS-Kosten-Schätzung |

## Backend: 1 neue Edge Function

**`supabase/functions/lambda-health-stats/index.ts`** (verify_jwt + admin-Role-Check)

Returns JSON:
```ts
{
  concurrency: { current, safe, normal, circuit_breaker_active },
  failure_rate: { last_1h, last_24h, last_7d },
  outcomes: { success, failed, oom, timeout },         // letzte 24h für Donut
  trend_7d: [{ hour, total, success, failed }],        // 168 Buckets
  cost: { last_24h_usd, last_7d_usd, avg_per_render_usd, total_seconds_24h },
  recent_errors: [{ created_at, error_message, render_id }]  // letzte 10
}
```

Nutzt Lambda-Pricing aus `src/lib/cost/pricing.ts` (`PROVIDER_PRICING_USD['aws-lambda'].perMinute = 0.0167`).

## Frontend: 1 neue Seite + 5 Widgets

**`src/pages/admin/LambdaHealth.tsx`** — Container mit Auto-Refresh (30s via React Query)

Komponenten (`src/components/admin/lambda-health/`):

1. **`ConcurrencyStatusCard.tsx`** — Aktuelle Concurrency + Circuit-Breaker-Badge (grün „Normal 25" / rot „Tripped → 15")
2. **`FailureRateCards.tsx`** — 3 KPI-Karten (1h / 24h / 7d) mit Color-Coding (<5% grün, 5-15% gelb, >15% rot)
3. **`OutcomesDonut.tsx`** — Recharts Donut: success / failed / oom / timeout (24h)
4. **`RenderTrendChart.tsx`** — Recharts AreaChart: Renders pro Stunde, 7 Tage, success vs failed gestapelt
5. **`CostEstimateCard.tsx`** — Geschätzte AWS-Kosten 24h / 7d + Ø-Kosten/Render + Free-Tier-Indikator
6. **`RecentErrorsTable.tsx`** — Letzte 10 Errors mit Timestamp, Render-ID, Error-Message

James Bond 2028 Style (Glassmorphism, Gold-Akzente) — konsistent zum Rest der Admin-UI.

## Routing & Navigation

**`src/App.tsx`** — neue protected Route hinzufügen:
```tsx
const LambdaHealth = lazy(() => import("./pages/admin/LambdaHealth"));
<Route path="/admin/lambda-health" element={
  <ProtectedRoute requireRole="admin"><LambdaHealth /></ProtectedRoute>
} />
```

**`src/pages/Admin.tsx`** — neuer Tab „Lambda Health" mit Icon `Server` (lucide-react), der direkt auf `/admin/lambda-health` linkt oder die Komponente inline rendert (inline = konsistent mit anderen Tabs).

## Sicherheit

- Edge Function prüft `has_role(auth.uid(), 'admin')` über bestehende Postgres-Function — Non-Admins erhalten 403
- Frontend-Route via `<ProtectedRoute requireRole="admin">` (bestehender Schutz)

## Geänderte/Neue Dateien

| Datei | Änderung |
|-------|----------|
| `supabase/functions/lambda-health-stats/index.ts` | **NEU** — Aggregations-Endpoint |
| `src/pages/admin/LambdaHealth.tsx` | **NEU** — Container-Seite |
| `src/components/admin/lambda-health/ConcurrencyStatusCard.tsx` | **NEU** |
| `src/components/admin/lambda-health/FailureRateCards.tsx` | **NEU** |
| `src/components/admin/lambda-health/OutcomesDonut.tsx` | **NEU** |
| `src/components/admin/lambda-health/RenderTrendChart.tsx` | **NEU** |
| `src/components/admin/lambda-health/CostEstimateCard.tsx` | **NEU** |
| `src/components/admin/lambda-health/RecentErrorsTable.tsx` | **NEU** |
| `src/App.tsx` | Lazy-Import + Route `/admin/lambda-health` |
| `src/pages/Admin.tsx` | Neuer Tab „Lambda Health" |

## Risiko & Rollback

- **Risiko:** Sehr niedrig — rein additive Read-Only-Funktionalität, keine DB-Migrationen nötig
- **Rollback:** Route + Tab + Edge-Function entfernen → 2 Min

## Was du als Nächstes tust

Approve den Plan → ich switche in Default-Mode und baue alles in einem Rutsch (Edge-Function + 7 Komponenten + Route).

