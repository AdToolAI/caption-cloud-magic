# Phase 4 Load Testing - Redis Cache Performance

## 🎯 Ziel

Verifizierung der Redis-Caching-Implementierung und Messung der Performance-Verbesserungen gegenüber Phase 3.

## 📋 Voraussetzungen

### 1. k6 Installation

```bash
# macOS
brew install k6

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Windows (via Chocolatey)
choco install k6
```

### 2. Test-User Setup

Bevor du die Load Tests ausführen kannst, musst du einen Test-User erstellen:

```bash
# Option 1: Automatisches Setup (empfohlen)
k6 run tests/load/setup.js

# Das Script erstellt:
# - Einen Test-User (loadtest-XXXXX@example.com)
# - Einen Workspace
# - Speichert die Credentials in tests/load/config.json
```

**WICHTIG:** Die `config.json` Datei enthält sensible Tokens und sollte NICHT in Git committed werden (ist bereits in .gitignore).

```json
// tests/load/config.json (automatisch generiert)
{
  "testUser": {
    "email": "loadtest-abc123@example.com",
    "accessToken": "eyJhbGci...",
    "workspaceId": "00000000-0000-0000-0000-000000000000"
  }
}
```

## 🚀 Tests Ausführen

### Alle Tests auf einmal

```bash
# Bash (macOS/Linux)
./run-load-tests.sh

# PowerShell (Windows)
.\run-load-tests.ps1

# Batch (Windows)
run-load-tests.bat
```

### Einzelne Tests mit verschiedenen Load-Levels

```bash
# Light Load (Standard für lokale Tests)
K6_LOAD_LEVEL=light k6 run tests/load/planner-list.js

# Medium Load (CI/CD)
K6_LOAD_LEVEL=medium k6 run tests/load/dashboard-summary.js

# Heavy Load (Production Simulation)
K6_LOAD_LEVEL=heavy k6 run tests/load/posting-times.js
```

### Load Level Details

#### Light (Lokal & Entwicklung)
- **Zweck:** Schnelle Smoke Tests, lokale Entwicklung
- **VUs:** 10-50 concurrent users
- **Dauer:** 3-5 Minuten
- **Ziel:** Keine Errors, P95 < Targets

#### Medium (CI/CD)
- **Zweck:** Integration Tests, Pre-Production Validation
- **VUs:** 50-300 concurrent users
- **Dauer:** 5-8 Minuten
- **Ziel:** < 1% Errors, Cache Hit Rate > 70%

#### Heavy (Load/Stress Tests)
- **Zweck:** Breaking Point finden, Production Simulation
- **VUs:** 100-1500+ concurrent users
- **Dauer:** 8-12 Minuten
- **Ziel:** System-Grenzen identifizieren

## 📊 Test Szenarien

### 1. Planner List (`planner-list.js`)

**Kritischster Endpoint** - Wird am häufigsten aufgerufen

**Performance Targets:**
- P95 Latency: **< 200ms** (mit Redis Cache)
- Cache Hit Rate: **> 75%** nach Warmup
- Error Rate: **< 1%**
- Throughput: **> 100 req/s**

**Was wird getestet:**
- Planner-Blöcke abrufen für verschiedene Datum-Ranges
- Cache-Effektivität bei identischen Queries
- Database-Load unter hoher Concurrency

**Erwartete Cache-Verbesserung:**
```
Vorher (Phase 3):  P95 ~500-800ms
Nachher (Phase 4): P95 ~120-200ms  (-60-75%)
```

### 2. Dashboard Summary (`dashboard-summary.js`)

**Aggregierte Daten** - Viele COUNT() Queries

**Performance Targets:**
- P95 Latency: **< 300ms** (mit Redis Cache)
- Cache Hit Rate: **> 70%**
- P50 Latency: **< 150ms** (indikativ für Cache Hits)

**Was wird getestet:**
- Dashboard-Statistiken (scheduled_count, published_count, etc.)
- Cache-Performance bei aggregierten Daten
- Response Times bei wiederholten Requests

**Cache-Strategie:**
- TTL: 2 Minuten (häufige Updates)
- Invalidation: Bei calendar-quick-add, campaign-to-planner
- Key: `dashboard-calendar:${workspace_id}`

### 3. Posting Times API (`posting-times.js`)

**Statische Daten** - Sollte fast 100% gecacht sein

**Performance Targets:**
- P95 Latency: **< 200ms**
- Cache Hit Rate: **> 85%** (statische Daten!)
- P50 Latency: **< 100ms**

**Was wird getestet:**
- Posting-Times für verschiedene Platforms (Instagram, TikTok, LinkedIn, Facebook)
- Cache-Performance bei statischen Daten
- Consistency über verschiedene Parameter

**Cache-Strategie:**
- TTL: 1 Stunde (selten ändernde Daten)
- Invalidation: Nur bei publish-post
- Key: `posting-times:${platform}:${days}:${tz}`

### 4. Generate Campaign (`generate-campaign.js`)

**AI-Last** - Langsamer, aber sollte von Cache profitieren

**Performance Targets:**
- P95 Latency: **< 3000ms** (AI-Calls sind langsam)
- Cache Hit Rate: **> 30%** (identische Prompts)
- Error Rate: **< 2%** (Rate Limits von AI APIs)

**Was wird getestet:**
- AI Campaign Generation mit verschiedenen Parametern
- Cache bei identischen Prompts
- Rate Limit Handling

## 📈 Ergebnisse Analysieren

### Automatische Analyse

```bash
# Analysiert die letzten Test-Ergebnisse
./tests/load/analyze-results.sh
```

**Output:**
```
═══════════════════════════════════════════════════════════════
   📊 Load Test Results Analysis - 20250110_143022
═══════════════════════════════════════════════════════════════

📋 Test Summary

Test                           Requests     Avg (ms)     P95 (ms)     Target      Status
────────────────────────────────────────────────────────────────────────────────────
Auth Token                     1234         45.23        89.12        < 100ms     ✅
Planner List                   5678         112.45       198.34       < 200ms     ✅
Dashboard Summary              2345         98.76        287.23       < 300ms     ✅
Posting Times API              3456         67.89        145.67       < 200ms     ✅
Generate Campaign              234          1234.56      2789.12      < 3000ms    ✅

🔥 Redis Cache Performance

Test                           Hits         Misses       Hit Rate
────────────────────────────────────────────────────────────────────
Planner List                   4532         1146         79.82%
  ✓ Excellent cache performance
Dashboard Summary              1876         469          80.00%
  ✓ Excellent cache performance
Posting Times API              3125         331          90.42%
  ✓ Excellent cache performance

💡 Recommendations & Next Steps

✅ All performance targets met!

Next Steps:
1. 📊 Add Cache Monitoring Widget to admin dashboard
2. 🚀 Implement Virtual Scrolling for large lists
3. 🖼️  Add Image Optimization with Supabase Transformations
4. 📈 Monitor cache hit rates in production
```

### Manuelle Analyse

Die Test-Ergebnisse werden in `tests/load/results/` gespeichert:

```
tests/load/results/
├── 20250110_143022/           # Timestamp-Ordner
│   ├── planner-list.json      # Detaillierte k6 Metriken
│   ├── dashboard-summary.json
│   ├── posting-times.json
│   └── generate-campaign.json
└── summary_latest.md          # Markdown Summary
```

**Wichtige Metriken in JSON:**

```javascript
{
  "metrics": {
    "http_req_duration": {
      "values": {
        "avg": 123.45,      // Durchschnitt
        "p(50)": 98.2,      // Median (Indikator für Cache Hits)
        "p(95)": 245.6,     // 95. Perzentil (SLA Target)
        "p(99)": 456.7,     // 99. Perzentil (Worst Case)
        "max": 1234.5       // Maximum
      }
    },
    "http_reqs": {
      "values": {
        "count": 5678,      // Total Requests
        "rate": 94.6        // Requests per Second
      }
    },
    "http_req_failed": {
      "values": {
        "rate": 0.002       // Error Rate (0.2%)
      }
    }
  }
}
```

## 🔍 Troubleshooting

### Problem: Hohe P95 Latencies (> Targets)

**Diagnostik:**
```bash
# 1. Check Redis Cache Stats
curl -X GET https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/cache-stats \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "apikey: SUPABASE_ANON_KEY"

# 2. Check Database Performance
# (via Supabase Dashboard > Database > Query Performance)

# 3. Check Edge Function Logs
# (via Supabase Dashboard > Edge Functions > Logs)
```

**Mögliche Ursachen:**
- ❌ Cache Hit Rate < 50% → TTL zu kurz oder falsche Cache Keys
- ❌ Langsame DB Queries → Fehlende Indexes
- ❌ Redis Connection Issues → Check Upstash Status
- ❌ Zu viele Cache Invalidations → Strategie überdenken

### Problem: Niedrige Cache Hit Rate

**Diagnostik:**
```bash
# Prüfe Cache Hit/Miss Logs in Edge Functions
# Suche nach: "✓ Cache HIT" vs "○ Cache MISS"
```

**Fixes:**
- Erhöhe Cache TTL (z.B. von 2min → 5min)
- Reduziere Cache Invalidations (zu aggressiv?)
- Verwende stabilere Cache Keys (keine dynamischen Timestamps)

### Problem: Rate Limit Errors (429)

**Nur bei `generate-campaign.js` relevant**

```bash
# Reduziere VUs oder erhöhe think time
K6_LOAD_LEVEL=light k6 run tests/load/generate-campaign.js
```

### Problem: Setup Script schlägt fehl

```bash
# Check Supabase Connection
curl -X GET https://lbunafpxuskwmsrraqxl.supabase.co/rest/v1/ \
  -H "apikey: SUPABASE_ANON_KEY"

# Manuelles Setup:
# 1. Erstelle User in Supabase Dashboard
# 2. Kopiere Access Token aus Browser DevTools
# 3. Erstelle config.json manuell:
cat > tests/load/config.json <<EOF
{
  "testUser": {
    "email": "your-email@example.com",
    "accessToken": "eyJhbGci...",
    "workspaceId": "your-workspace-id"
  }
}
EOF
```

## 📝 Best Practices

### 1. Immer mit Light Load starten

Bevor du Heavy Tests machst, starte mit Light Load um sicherzustellen dass:
- Tests korrekt konfiguriert sind
- Keine Syntax-Fehler vorhanden sind
- Basic Funktionalität arbeitet

### 2. Cache Warmup berücksichtigen

Die **ersten 10-20% der Requests** werden Cache Misses sein. Das ist normal!

**Erwartete Cache Hit Rate Progression:**
```
0-30s:   20-40% Hit Rate (Warmup Phase)
30-60s:  50-70% Hit Rate (Stabilisierung)
60s+:    70-90% Hit Rate (Steady State)
```

### 3. Test-Daten Cleanup

Nach Heavy Tests solltest du Test-Daten bereinigen:

```bash
# Lösche Test-User und Workspaces
# (Manuell via Supabase Dashboard oder cleanup script)
```

### 4. Realistische Load-Level wählen

**Faustregel:**
- **Light:** 10-50 VUs = 100-500 aktive Users
- **Medium:** 50-300 VUs = 500-3000 aktive Users
- **Heavy:** 100-1500 VUs = 1000-15000 aktive Users

## 🎯 Performance Baselines (Phase 4 Targets)

| Metrik | Phase 3 (vor Redis) | Phase 4 (mit Redis) | Verbesserung |
|--------|---------------------|---------------------|--------------|
| **Planner List P95** | 500-800ms | **< 200ms** | -60-75% |
| **Dashboard P95** | 400-600ms | **< 300ms** | -25-50% |
| **Posting Times P95** | 300-500ms | **< 200ms** | -33-60% |
| **Cache Hit Rate** | 0% | **> 70%** | +70% |
| **DB Queries/min** | 500+ | **< 200** | -60% |
| **Error Rate** | < 2% | **< 1%** | -50% |

## 🚀 Nächste Schritte nach Load Testing

1. **Dokumentation:**
   - Update `PHASE_2_LOAD_TESTING_SETUP.md` mit Ergebnissen
   - Fülle `LOAD_TEST_RESULTS_TEMPLATE.md` aus

2. **Frontend Optimierung (Phase 5):**
   - Virtual Scrolling für große Listen
   - Image Optimization mit Supabase Transformations
   - Cache Monitoring Dashboard Widget

3. **Optional (nur bei Bedarf):**
   - Materialized Views für Dashboard
   - Database Indexes optimieren
   - Read Replicas (nur bei >5k Users)

## 📚 Weitere Ressourcen

- [k6 Dokumentation](https://k6.io/docs/)
- [Upstash Redis Docs](https://docs.upstash.com/redis)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- Phase 2 Setup: `PHASE_2_LOAD_TESTING_SETUP.md`
- Results Template: `LOAD_TEST_RESULTS_TEMPLATE.md`
