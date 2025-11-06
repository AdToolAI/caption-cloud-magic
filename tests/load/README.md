# Load Testing Suite - Phase 2

k6 Load Tests zur Performance-Validierung für 1.000-10.000 concurrent users.

## 📋 Test-Szenarien

### 1. `generate-campaign.js` - AI Campaign Generation
**Endpoint:** `/functions/v1/generate-campaign`  
**Target:** P95 < 800ms  
**Load Profile:**
- Baseline: 100 users (2 min)
- Stress: 1,000 users (5 min)
- Spike: 5,000 users (30 sec + 1 min sustain)
- Recovery: Scale down (2 min)

**Expected Behavior:**
- ✅ P95 < 800ms unter Normal-Load
- ✅ Rate Limiting aktiv (429 responses)
- ✅ Job Queue übernimmt bei Overload

---

### 2. `planner-list.js` - Database Query Performance
**Endpoint:** `/functions/v1/planner-list`  
**Target:** P95 < 500ms  
**Load Profile:**
- Baseline: 100 users (1 min)
- Stress: 1,000 users (3 min)
- Peak: 2,000 users (2 min)

**Expected Behavior:**
- ✅ P95 < 200ms (mit Indexes)
- ✅ Schnelle Queries auch bei hoher Last
- ✅ Verschiedene Filter-Patterns testen

---

### 3. `ai-queue-worker.js` - Worker Throughput
**Endpoint:** `/functions/v1/ai-queue-worker`  
**Target:** 5 jobs/sec Durchsatz  
**Load Profile:**
- Warm up: 5 workers (30 sec)
- Sustained: 10 workers (5 min)
- Stress: 20 workers (2 min)

**Expected Behavior:**
- ✅ Batch-Processing von 5 Jobs parallel
- ✅ Mindestens 1.500 Jobs in 5 Min (5 jobs/sec)
- ✅ Worker-Completion < 1s

---

### 4. `auth-token.js` - Authentication Performance
**Endpoint:** `/auth/v1/token`  
**Target:** P95 < 100ms  
**Load Profile:**
- Baseline: 100 users (1 min)
- High Load: 1,000 users (3 min)
- Peak: 3,000 users (2 min)

**Expected Behavior:**
- ✅ P95 < 100ms (kritisch für UX)
- ✅ Error Rate < 0.1%
- ✅ Hochverfügbar auch unter Stress

---

## 🚀 Installation

### 1. k6 installieren

**macOS:**
```bash
brew install k6
```

**Linux:**
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

**Windows:**
```powershell
choco install k6
```

---

## ▶️ Tests ausführen

### Einzelner Test
```bash
# Campaign Generation Test
k6 run tests/load/generate-campaign.js

# Database Query Test
k6 run tests/load/planner-list.js

# Worker Throughput Test (benötigt SERVICE_ROLE_KEY)
k6 run -e SUPABASE_SERVICE_ROLE_KEY=your-key tests/load/ai-queue-worker.js

# Auth Performance Test
k6 run tests/load/auth-token.js
```

### Alle Tests sequenziell
```bash
#!/bin/bash
echo "🚀 Running Load Tests..."

k6 run tests/load/auth-token.js
k6 run tests/load/planner-list.js
k6 run tests/load/generate-campaign.js

# Worker test requires service role key
if [ -n "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  k6 run tests/load/ai-queue-worker.js
else
  echo "⚠️  Skipping ai-queue-worker test (SUPABASE_SERVICE_ROLE_KEY not set)"
fi

echo "✅ All tests complete!"
```

---

## 📊 Ergebnisse interpretieren

### ✅ Success Criteria

**Response Times:**
- Auth: P95 < 100ms
- Database Queries: P95 < 500ms
- AI Generation: P95 < 800ms
- Worker: < 1s per batch

**Throughput:**
- Worker: ≥ 5 jobs/sec
- Auth: ≥ 500 req/sec
- Database: ≥ 100 req/sec

**Reliability:**
- Error Rate < 0.5%
- Failed Requests < 5%
- No timeouts under normal load

### ⚠️ Warning Signs

- P95 > Target + 20%
- Error Rate > 1%
- Worker throughput < 3 jobs/sec
- Database queries > 1s

### 🔴 Critical Issues

- P95 > Target * 2
- Error Rate > 5%
- Complete service outage
- Unhandled exceptions in logs

---

## 🐛 Troubleshooting

### Issue: High Response Times

**Database Queries slow:**
```sql
-- Check if indexes are being used
EXPLAIN ANALYZE
SELECT * FROM content_items
WHERE workspace_id = 'xxx'
ORDER BY created_at DESC
LIMIT 50;

-- Should show: "Index Scan using idx_content_items_workspace_created"
```

**AI Endpoints slow:**
- Check if Rate Limiter is active
- Verify Job Queue is processing
- Review PostHog Telemetry for bottlenecks

### Issue: Rate Limit Errors (429)

**Expected behavior during stress tests:**
```bash
# Rate limits should kick in after:
# - Free: 5 requests/min
# - Basic: 15 requests/min
# - Pro: 30 requests/min

# Check rate limit logs:
grep "rate_limit_hit" logs.txt
```

### Issue: Worker Low Throughput

**Debug worker performance:**
```bash
# Check pending jobs:
SELECT COUNT(*) FROM ai_jobs WHERE status = 'pending';

# Check stale jobs:
SELECT COUNT(*) FROM active_ai_jobs WHERE started_at < now() - INTERVAL '1 hour';

# Manually trigger worker:
curl -X POST https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/ai-queue-worker \
  -H "Authorization: Bearer SERVICE_ROLE_KEY"
```

---

## 🎯 Nächste Schritte nach Tests

### 1. Analyse der Ergebnisse
- Vergleiche P95/P99 mit Targets
- Identifiziere Bottlenecks
- Prüfe Error Logs

### 2. Optimierungen
- Slow Queries → Indexes hinzufügen
- High Error Rate → Circuit Breaker
- Low Throughput → Worker-Kapazität erhöhen

### 3. Re-Test
- Nach Optimierungen erneut testen
- Validiere Verbesserungen
- Dokumentiere Ergebnisse

---

## 📁 Output Files

Nach jedem Test werden Summary-Files erstellt:

- `summary.json` - Vollständige Metriken
- `summary-planner.json` - Planner-Test Ergebnisse
- `summary-worker.json` - Worker-Test Ergebnisse
- `summary-auth.json` - Auth-Test Ergebnisse

**Beispiel Summary:**
```
=== Load Test Summary: generate-campaign ===

Total Requests: 2453
Request Rate: 8.17/s

Response Times:
  Avg: 452.34ms
  P95: 723.12ms
  P99: 891.45ms
  Max: 1234.56ms

Error Rate: 0.24%

Thresholds:
  ✓ http_req_duration{scenario:generate_campaign}: p(95)<800
  ✓ errors: rate<0.005
  ✓ http_req_failed: rate<0.05
```

---

## 🔗 Integration mit CI/CD

**GitHub Actions Workflow kommt in Phase 4:**

```yaml
name: Load Tests
on:
  schedule:
    - cron: '0 2 * * 1' # Weekly on Monday 2 AM
  workflow_dispatch: # Manual trigger

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install k6
        run: |
          curl https://github.com/grafana/k6/releases/download/v0.45.0/k6-v0.45.0-linux-amd64.tar.gz -L | tar xvz
          sudo cp k6-v0.45.0-linux-amd64/k6 /usr/local/bin
      - name: Run Load Tests
        env:
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: |
          k6 run tests/load/auth-token.js
          k6 run tests/load/planner-list.js
          k6 run tests/load/generate-campaign.js
          k6 run tests/load/ai-queue-worker.js
      - name: Upload Results
        uses: actions/upload-artifact@v3
        with:
          name: load-test-results
          path: summary*.json
```

---

## 📚 Weitere Ressourcen

- [k6 Documentation](https://k6.io/docs/)
- [k6 Best Practices](https://k6.io/docs/testing-guides/best-practices/)
- [Performance Testing Guide](https://docs.lovable.dev/performance)

---

**Phase 2 Status:** ✅ Tests erstellt, ready für Execution
**Nächster Schritt:** Tests lokal ausführen → Bottlenecks identifizieren → Phase 3 (Circuit Breaker)
