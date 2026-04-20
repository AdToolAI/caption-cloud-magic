

## Plan: Kapazitäts-Hardening Phase 2 — 2.000+ concurrent users

Ziel: Von aktuell ~1.500 → **2.000–3.000+ concurrent users** (entspricht ~2–3 Mio Besucher/Monat).

### Wo wir stehen

| Komponente | Aktuell | Limit bei 2.000 Usern |
|---|---|---|
| DB Connections | Supavisor Pooling ✅ | OK bis ~2.000 |
| Edge Functions | Auto-scaling ✅ | OK bis ~5.000 |
| Lambda Renders | 6 parallel ✅ | Queue wird bei Spitzen lang |
| **Read-Heavy Queries** | Direkt aus DB | **🔴 BOTTLENECK** |
| **Statische Assets** | Direkt aus Browser | **🔴 BOTTLENECK** |
| **Wiederholte AI-Calls** | Jedes Mal neu | **🔴 BOTTLENECK** |
| Compute Instance | Standard | **🟡 Upgrade nötig** |

---

### Was wir bauen — 4 Module

#### Modul 1: Redis-Cache für Hot Queries 🔥
**Problem:** Jeder User-Page-Load triggert 5–10 DB-Queries für Daten, die sich selten ändern (Dashboard-Stats, Trend-Radar, Posting-Times, News-Feed). Bei 2.000 Usern = 10.000–20.000 DB-Queries/Sekunde.

**Lösung:** Upstash Redis als Cache-Layer (serverless, pay-per-request).
- `dashboard-summary` → Cache 60s pro User
- `trend-radar` → Cache 5 Min global  
- `news-hub` → Cache 15 Min global
- `posting-times` → Cache 1h pro Sprache (bereits vorhanden, erweitern)
- `provider-quota-stats` → Cache 30s

**Impact:** -85% DB-Last → Headroom für 5x mehr User.  
**Kosten:** ~$10–20/Monat bei deinem Volumen.

---

#### Modul 2: CDN-Caching für statische Assets 🚀
**Problem:** Bilder, Videos, Thumbnails, Fonts werden direkt aus Supabase Storage geladen. Bei 2.000 Usern = Bandbreiten-Spitzen.

**Lösung:**
- **Cloudflare CDN** vor `caption-cloud-magic.lovable.app` und Custom Domains (`captiongenie.app`, `useadtool.ai`)
- Storage-URLs (Thumbnails, Avatare, generierte Bilder) durch Cache-Layer routen
- Cache-Headers in Edge Functions: `Cache-Control: public, max-age=3600` für statische Antworten
- Image-Optimization: WebP-Auto-Konvertierung via Cloudflare

**Impact:** -90% Bandbreiten-Last auf Supabase, schnellere Ladezeiten weltweit.  
**Kosten:** Cloudflare Free-Plan reicht aus.

---

#### Modul 3: AI-Response-Caching mit Semantic Search 🧠
**Problem:** Viele User stellen ähnliche Prompts (z.B. „Erstelle Caption für Instagram Reel über Fitness"). Aktuell: jedes Mal API-Call an Gemini/OpenAI = teuer + langsam + Rate-Limit-Risiko.

**Lösung:**
- Tabelle `ai_response_cache` mit `prompt_hash`, `prompt_embedding` (vector), `response`, `created_at`
- Vor jedem AI-Call: Embedding generieren, ähnliche Prompts suchen (Cosine Similarity > 0.95)
- Bei Match → gecachte Antwort zurückgeben (mit kleiner Variation für Frische)
- TTL: 24h pro Prompt

**Wo aktiv:**
- `generate-caption` (häufigster Endpoint)
- `generate-hashtags`
- `posting-times-api`
- `trend-radar` (bereits gecached, erweitern)

**Impact:** -60% AI-Provider-Calls → 2–3x mehr Headroom bei OpenAI/Gemini Rate Limits.  
**Kosten:** Eingespart > zusätzliche Embedding-Kosten.

---

#### Modul 4: Lambda 6 → 10 + Compute-Upgrade ⚡
**Problem:** Bei 2.000 Usern könnten 30–50 gleichzeitige Render-Requests auflaufen → lange Queue.

**Lösung:**
- `lambda_max_concurrent`: 6 → **10** (mit Safety-Net auf 6 fallback)
- `lambda_max_concurrent_safe`: 3 → **6** (höherer Floor)
- Circuit Breaker bleibt aktiv, aber mit höheren Schwellen
- **Lovable Cloud Compute Upgrade**: Du gehst in **Backend → Advanced settings → Upgrade instance** und wählst die nächst-größere Instance-Klasse (mehr CPU/RAM für DB)

**Impact:** Queue-Länge bei Spitzen halbiert sich, DB-Latenz sinkt um 30–50%.  
**Kosten:** AWS Lambda linear (~+30%), Compute-Upgrade je nach Plan.

---

### Datenbank-Änderungen

| Tabelle | Zweck |
|---|---|
| `ai_response_cache` | Semantic-Cache für AI-Antworten (mit pgvector) |
| `cache_stats` | Cache-Hit-Rate-Tracking pro Endpoint |
| `system_config` (Update) | Neue Werte für Lambda 10/6 |

---

### Neue Edge Functions

1. `_shared/redis-cache.ts` — Wrapper für Upstash Redis (Get/Set/Invalidate)
2. `_shared/ai-semantic-cache.ts` — Embedding + Similarity-Search-Logik
3. `cache-invalidator` (Cron alle 1h) — Löscht abgelaufene Cache-Entries
4. `cache-stats-aggregator` — Aggregiert Hit-Rates für Admin-Dashboard

---

### Admin-Dashboard-Erweiterung

Neuer Tab **„Cache Health"** im `/admin`:
- Redis Hit-Rate pro Endpoint (Ziel: >80%)
- AI-Semantic-Cache-Hits (Ziel: >40%)
- CDN-Bandbreite-Einsparung
- Top-10 ungeacachte Hot-Queries (Optimierungspotenzial)

---

### Was du dafür brauchst

| Anbieter | Was | Kosten/Monat |
|---|---|---|
| **Upstash Redis** | Account erstellen → API-Token | $0–20 |
| **Cloudflare** | Account + Domain hinzufügen → DNS umstellen | $0 (Free Plan) |
| **Lovable Cloud** | Compute Instance Upgrade | siehe Plan |

Ich frage dich nach den Secrets (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`), sobald wir starten.

---

### Was du gewinnst

| Metric | Vorher | Nachher |
|---|---|---|
| Concurrent Users | 1.500 | **3.000+** |
| Monatliche Besucher | 1M | **3M+** |
| AI-Provider-Last | 100% | 40% |
| DB-Query-Last | 100% | 15% |
| Page-Load-Zeit (global) | 1.5s | 0.4s |
| Render-Queue bei Spitzen | 30s wait | <10s wait |

---

### Reihenfolge der Implementierung

1. **Redis-Cache + Hot-Query-Caching** (größter Impact, geringster Aufwand)
2. **AI-Semantic-Cache** (DB + Edge Functions)
3. **Lambda 6→10 + system_config Update**
4. **Cache-Health-Dashboard**
5. **CDN-Setup-Guide** (du musst Cloudflare manuell einrichten, ich liefere Anleitung)
6. **Compute-Upgrade-Hinweis** im Admin-Panel

Alles in einem Rutsch nach Plan-Freigabe.

