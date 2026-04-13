

## Plan: News Radar — Echte, nützliche Nachrichten statt Trend-Namen

### Problem
Der aktuelle Ticker zeigt nur Trend-Namen (z.B. "#MiniSuccessStories", "GPS Pet Tracker") — das ist wenig informativ. Der Nutzer scrollt darüber hinweg, weil kein Mehrwert erkennbar ist.

### Lösung
Den Ticker in einen **News Radar** umwandeln, der echte, nützliche Social-Media- und Marketing-News zeigt. Die News werden per **Perplexity API** (bereits konfiguriert) als Backend-Function generiert und gecacht.

### Neue Edge Function: `fetch-news-radar`
- Nutzt Perplexity Sonar für echte, aktuelle Nachrichten
- Prompt: "Die 8-10 wichtigsten Social Media, Creator Economy und Digital Marketing News der letzten 7 Tage — kurze, actionable Einzeiler"
- Ergebnis-Format: `{ news: [{ headline: string, source: string, category: string, url?: string }] }`
- Caching: Ergebnisse werden in einer `news_radar_cache`-Tabelle gespeichert (max 1 Abruf pro 6 Stunden), damit nicht bei jedem Seitenaufruf ein API-Call passiert
- Fallback: Statische, kuratierte Tips wenn API nicht verfügbar

### Datenbank
- Neue Tabelle `news_radar_cache`: `id`, `news_json`, `fetched_at`, `language`
- RLS: Public read (News sind nicht nutzerspezifisch)

### UI-Änderungen

**`src/components/dashboard/NewsTicker.tsx`**
- Badge: "NEWS RADAR" statt "TREND RADAR"
- Statt TrendCards: News-Headlines als scrollende Einzeiler mit Kategorie-Icon (📱 Social, 💰 Business, 🎨 Creator, 📊 Analytics)
- Klick auf News → öffnet URL oder navigiert zu Trend Radar
- Fallback-Tips bleiben als Backup

**`src/pages/TrendRadar.tsx`**
- `TrendTicker` ebenfalls auf News-Daten umstellen (gleiche Datenquelle)

### Beispiel-News im Ticker
```
📱 Instagram testet 3-Minuten Reels für alle Creator
💰 TikTok Shop expandiert nach Europa — neue Monetarisierung
📊 LinkedIn Algorithm Update: Kommentare 3x wichtiger als Likes
🎨 Canva launcht KI-Video-Editor für Social Media
```

### Betroffene Dateien
- **Neu:** `supabase/functions/fetch-news-radar/index.ts` — Perplexity-basierte News
- **Neu:** DB-Migration für `news_radar_cache` Tabelle
- **Edit:** `src/components/dashboard/NewsTicker.tsx` — News statt Trends anzeigen
- **Edit:** `src/pages/TrendRadar.tsx` — TrendTicker auf News umstellen

