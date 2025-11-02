# Week 3 & 4 Implementation - Resilienz, Testing & Optimierung

## ✅ WEEK 3: Resilienz + Exactly-Once (COMPLETE)

### Circuit-Breaker Pattern
**Datei:** `supabase/functions/_shared/circuit-breaker.ts`

Implementiert das Circuit-Breaker-Pattern für AI, Database und Storage Services:

```typescript
// Globale Circuit Breakers
aiCircuitBreaker       // AI Service Protection
dbCircuitBreaker       // Database Protection  
storageCircuitBreaker  // Storage Protection

// Usage
await withCircuitBreaker(aiCircuitBreaker, async () => {
  return await callAIService();
});
```

**States:**
- `CLOSED` - Normal operation
- `OPEN` - Blocking requests (circuit tripped)
- `HALF_OPEN` - Testing recovery

**Configuration:**
```typescript
{
  failureThreshold: 5,      // Failures before opening
  successThreshold: 2,      // Successes to close
  timeout: 30000,           // Time before half-open
  resetTimeout: 60000       // Reset failure count
}
```

### Timeout-Handling
**Datei:** `supabase/functions/_shared/timeout.ts`

Verhindert Long-Running Operations:

```typescript
// Simple timeout
await withTimeout(asyncOperation(), 10000);

// Timeout with Queue Fallback
const result = await withTimeoutOrQueue(
  asyncOperation(),
  10000,
  async () => ({ queued: true, job_id: 'xxx' })
);
```

### Exactly-Once Guarantees
**Migration:** Database-Changes für Idempotenz

**1. Content Hash für Deduplication:**
```sql
-- Automatischer Content-Hash auf calendar_events
content_hash TEXT
UNIQUE INDEX ON calendar_events(workspace_id, content_hash)

-- Trigger berechnet Hash automatisch
compute_content_hash(caption, platforms, media_urls)
```

**2. Idempotente Publishing:**
```sql
-- Verhindert Duplikate beim Publishing
UNIQUE INDEX ON publish_results(job_id, provider)
```

**3. Circuit Breaker State Tracking:**
```sql
-- Persistiert Circuit-Breaker-Status
circuit_breaker_state (service_name, state, failure_count)
```

---

## 📋 WEEK 4: Testing + CDN + Feature Flags

### k6 Load Testing
**Verzeichnis:** `tests/load/`

**Scripts erstellt:**
1. `generate-campaign.js` - Campaign Generator Test (P95 < 800ms)
2. `planner-list.js` - Content Planner Test (P95 < 500ms)
3. `publish-dispatch.js` - Publishing Test (P95 < 1000ms)

**Ausführung:**
```bash
# Install k6
brew install k6  # macOS
# or: https://k6.io/docs/getting-started/installation/

# Run tests
k6 run tests/load/generate-campaign.js \
  -e API_URL=https://lbunafpxuskwmsrraqxl.supabase.co \
  -e ANON_KEY=your_anon_key

k6 run tests/load/planner-list.js \
  -e API_URL=https://lbunafpxuskwmsrraqxl.supabase.co \
  -e ANON_KEY=your_anon_key \
  -e WORKSPACE_ID=workspace_uuid

k6 run tests/load/publish-dispatch.js \
  -e API_URL=https://lbunafpxuskwmsrraqxl.supabase.co \
  -e ANON_KEY=your_anon_key \
  -e TEST_EVENT_ID=event_uuid
```

**CI Integration (GitHub Actions):**
```yaml
# .github/workflows/load-test.yml
name: Load Tests
on: [push, pull_request]
jobs:
  k6:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: grafana/setup-k6-action@v1
      - run: k6 run tests/load/*.js
```

### CDN Activation

**Vercel CDN Configuration:**
```json
// vercel.json
{
  "headers": [
    {
      "source": "/assets/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    },
    {
      "source": "/api/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "s-maxage=60, stale-while-revalidate"
        }
      ]
    }
  ]
}
```

**Supabase Storage CDN:**
- Automatisch aktiviert für alle Storage-Buckets
- CDN-URLs: `https://lbunafpxuskwmsrraqxl.supabase.co/storage/v1/object/public/bucket/file`

**Image Optimization Helper:**
```typescript
// utils/cdn.ts
export function getOptimizedImageUrl(
  bucket: string, 
  path: string, 
  options?: { width?: number; quality?: number }
): string {
  const base = `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
  if (!options) return base;
  
  const params = new URLSearchParams();
  if (options.width) params.set('width', options.width.toString());
  if (options.quality) params.set('quality', options.quality.toString());
  
  return `${base}?${params}`;
}
```

**React Query Cache:**
```typescript
// queryClient.ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 60 * 1000,  // 10 minutes
      cacheTime: 60 * 60 * 1000,  // 1 hour
    },
  },
});
```

### Feature Flags (PostHog)

**Setup in PostHog Dashboard:**
1. `worker_queue_enabled` - Enable Queue-Worker (50% Rollout)
2. `new_rate_limits` - Stricter Rate Limits (10% Canary)
3. `advanced_analytics` - Premium Analytics (Enterprise-Only)

**React Hook:**
```typescript
// hooks/useFeatureFlag.ts
import { useFeatureFlagEnabled } from 'posthog-js/react';

export function useFeatureFlag(flag: string): boolean {
  return useFeatureFlagEnabled(flag) ?? false;
}

// Usage
const isQueueEnabled = useFeatureFlag('worker_queue_enabled');
```

**Edge Function Feature Flags:**
```typescript
// _shared/feature-flags.ts
export async function checkFeatureFlag(
  userId: string,
  flag: string
): Promise<boolean> {
  const POSTHOG_API_KEY = Deno.env.get('VITE_PUBLIC_POSTHOG_KEY');
  
  const response = await fetch('https://eu.i.posthog.com/decide/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: POSTHOG_API_KEY,
      distinct_id: userId,
    })
  });
  
  const data = await response.json();
  return data.featureFlags?.[flag] === true;
}
```

---

## 🎯 Integration Checklist

### Week 3 Integration:
- [x] Circuit-Breaker Classes erstellt
- [x] Timeout Utilities implementiert
- [x] Database-Migration für Exactly-Once ausgeführt
- [ ] Circuit-Breaker in AI-Functions integrieren
- [ ] Timeout-Handling in synchronen Calls aktivieren

### Week 4 Integration:
- [x] k6 Load-Test Scripts erstellt
- [ ] Load-Tests im CI/CD Pipeline aktivieren
- [ ] Vercel CDN Headers konfigurieren
- [ ] PostHog Feature Flags erstellen
- [ ] Feature Flag Hook implementieren

---

## 📊 Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| Campaign Generation P95 | < 800ms | To be measured |
| Planner List P95 | < 500ms | To be measured |
| Publishing P95 | < 1000ms | To be measured |
| Error Rate | < 0.5% | To be measured |
| Circuit Breaker Uptime | > 99% | To be measured |

---

## 🚀 Nächste Schritte

### Sofort (User-Action erforderlich):
1. **k6 Load-Tests ausführen** - Baseline-Performance messen
2. **PostHog Feature Flags erstellen** - Flags im Dashboard anlegen
3. **Vercel CDN konfigurieren** - `vercel.json` deployen

### Integration (Code-Changes):
1. Circuit-Breaker in `generate-campaign`, `generate-caption` etc. integrieren
2. Timeout-Handling in synchronen AI-Calls aktivieren
3. Feature-Flag-Checks vor neuen Features einbauen

### Monitoring:
1. PostHog Dashboards für Circuit-Breaker-Status
2. Alerts für Open-Circuit-Events
3. k6 Cloud Integration für kontinuierliches Load-Testing

---

## 🔍 Testing Commands

```bash
# Load Testing
k6 run tests/load/generate-campaign.js -e ANON_KEY=$ANON_KEY
k6 run tests/load/planner-list.js -e WORKSPACE_ID=$WORKSPACE_ID
k6 run tests/load/publish-dispatch.js -e TEST_EVENT_ID=$EVENT_ID

# Circuit Breaker Testing
curl -X POST https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/generate-campaign \
  -H "Authorization: Bearer $ANON_KEY" \
  -d '{"topic":"Test"}'

# Feature Flag Testing (Frontend)
console.log(posthog.isFeatureEnabled('worker_queue_enabled'));
```

---

**Status:** Week 3 implementiert ✅ | Week 4 Scripts bereit ⏳
**Bereit für:** Load-Testing + Feature-Flag-Setup