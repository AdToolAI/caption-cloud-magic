

## Plan: News Hub als eigenständiges Feature

### Was gebaut wird
Eine eigene **News Hub Seite** (`/news-hub`) — ein vollwertiger Nachrichten-Feed mit Karten-Layout, getrennt vom Trend Radar. Liefert tagesaktuelle News aus:
- Social Media Management & Plattform-Updates
- KI-Tools & Marketing-Automation
- Creator Economy & Monetization
- Unternehmens-Prognosen & Börsenkurse (Meta, Alphabet, Snap etc.)
- Digitales Marketing & Strategie-Insights

News aktualisieren sich alle 4-5 Stunden. Ältere News bleiben bestehen, rutschen nach hinten.

### Umsetzung

**1. DB-Tabelle `news_hub_articles`**
- Spalten: `id`, `headline`, `summary` (2-3 Sätze), `category`, `source`, `source_url`, `language`, `batch_id`, `published_at`, `created_at`
- 7 Kategorien: `platform`, `ai_tools`, `analytics`, `monetization`, `community`, `business_finance`, `strategy`
- RLS: öffentlich lesbar für authentifizierte User, Service-Role schreibbar
- Max 200 Artikel behalten, ältere werden beim Fetch gelöscht

**2. Edge Function `fetch-news-hub`**
- Nutzt Perplexity API (sonar) — Key ist bereits konfiguriert
- Holt 12-15 Artikel pro Batch mit ausführlichen Summaries über alle 7 Kategorien
- 4-Stunden-Cache: prüft ob letzter Batch < 4h alt, sonst Skip
- Duplikat-Check gegen letzte 50 Headlines
- Cleanup: behält max 200 Artikel

**3. Frontend**

| Datei | Beschreibung |
|-------|-------------|
| `src/pages/NewsHub.tsx` | Eigenständige Seite mit Hero-Header, Kategorie-Filter-Chips, Karten-Grid (1 Spalte mobil, 2 Desktop), "Mehr laden"-Button |
| `src/hooks/useNewsHub.ts` | Lädt Artikel aus DB, Paginierung (10/Seite), Kategorie-Filter, triggert Edge Function bei Bedarf |
| `src/App.tsx` | Route `/news-hub` hinzufügen |
| `src/components/ui/CommandBar.tsx` | News Hub in Suche aufnehmen |

**4. Karten-Design**
- Farbcodierte Kategorie-Badges (cyan=Platform, violet=AI, green=Analytics etc.)
- Headline + Summary (2-3 Zeilen)
- Quelle + relative Zeitangabe ("vor 2 Stunden")
- Link zur Originalquelle
- James Bond 2028 Sci-Fi Stil passend zum Rest der App

### Was sich nicht ändert
- Trend Radar bleibt unverändert
- News Radar Ticker (im Header) bleibt unverändert
- Keine Änderungen an bestehenden Features

### Betroffene Dateien
| Aktion | Datei |
|--------|-------|
| Neu (Migration) | `news_hub_articles` Tabelle + RLS |
| Neu | `supabase/functions/fetch-news-hub/index.ts` |
| Neu | `src/pages/NewsHub.tsx` |
| Neu | `src/hooks/useNewsHub.ts` |
| Edit | `src/App.tsx` — Route hinzufügen |
| Edit | `src/components/ui/CommandBar.tsx` — Suchlink |

