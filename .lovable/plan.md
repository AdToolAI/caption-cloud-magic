

## Plan: Themenrelevante Stockbilder per Pexels/Pixabay in Trends

### Problem
Picsum liefert zufällige Fotos ohne Bezug zum Trend. Ein Trend über "Crossbody Mini Bag" zeigt ein Bergsee-Foto. Das ist nicht professionell.

### Beste Lösung
Die `fetch-trends` Edge Function wird erweitert: Für jeden Trend wird per **Pexels API** (Key ist bereits konfiguriert) ein themenrelevantes Bild gesucht. Das Bild wird als `image_url` im Trend-Objekt mitgeliefert. Die UI zeigt dann echte, thematisch passende Stockfotos.

### Warum das die beste Lösung ist
- **Pexels API Key existiert bereits** als Secret — null Setup nötig
- **Keyword-basierte Suche** — "Crossbody Mini Bag" liefert ein Bild einer Tasche, nicht eines Berges
- **Hochwertige, lizenzfreie Fotos** — professionelle Qualität
- **Kein AI-Bildgenerierungs-Budget** nötig (Replicate kostet pro Bild)

### Technischer Ablauf

```text
fetch-trends Edge Function
  ├─ Trends generieren (wie bisher)
  ├─ NEU: Für jeden Trend → Pexels API Search
  │   Suchbegriff: Trend-Name bereinigt (ohne # und Sonderzeichen)
  │   Fallback: Kategorie-Keywords wenn nichts gefunden
  ├─ image_url + photographer attribution anhängen
  └─ Response mit angereicherten Trends

TrendCardMedia.tsx
  ├─ Neue prop: imageUrl?: string
  ├─ Wenn vorhanden → echtes Pexels-Bild
  └─ Fallback → Picsum wie bisher

TrendRadar.tsx
  ├─ image_url aus Trend-Daten durchreichen
  └─ Hero-Carousel ebenfalls mit echtem Bild
```

### Änderungen

1. **`supabase/functions/fetch-trends/index.ts`**
   - Neue Hilfsfunktion `searchPexelsImage(query)` — sucht ein einzelnes Bild per Pexels API
   - Nach Trend-Generierung: Batch-Loop über alle Trends, jeweils ein Pexels-Bild suchen
   - Suchbegriff: `trend.name.replace(/#/g, '').trim()` + ggf. Kategorie
   - Ergebnis: `image_url` (medium-Auflösung ~350x230) und `image_photographer` pro Trend
   - Rate-Limit-Schutz: Max 20 Trends parallel mit `Promise.allSettled`
   - Fallback-Keywords pro Kategorie (social-media → "social media content creator", ecommerce → "online shopping product")

2. **`src/components/trends/TrendCardMedia.tsx`**
   - Neue prop `imageUrl?: string` akzeptieren
   - Wenn vorhanden: echtes Bild laden statt Picsum-URL
   - Alle visuellen Effekte (Glassmorphism, Scanlines, Glow) bleiben erhalten

3. **`src/pages/TrendRadar.tsx`**
   - `trend.data_json?.image_url` an `TrendCardMedia` durchreichen
   - Hero-Carousel: `HeroMediaBackground` ebenfalls mit echtem Bild

### Betroffene Dateien
- `supabase/functions/fetch-trends/index.ts` — Pexels-Integration
- `src/components/trends/TrendCardMedia.tsx` — imageUrl prop
- `src/pages/TrendRadar.tsx` — Daten durchreichen

### Kein API-Key-Setup nötig
`PEXELS_API_KEY` ist bereits als Secret konfiguriert.

