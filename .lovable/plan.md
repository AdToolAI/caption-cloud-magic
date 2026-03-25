

## Probleme & Loesung: Medien-Tab Upgrade

### Problem 1: YouTube-Videos sind "unavailable"
Die KI (Gemini) **erfindet** YouTube Video-IDs - diese Videos existieren nicht. Daher zeigt jedes Embed "Video unavailable". Das ist ein fundamentales Problem: KI kann keine echten Video-IDs liefern.

**Loesung:** Statt fake Embeds → YouTube-Suche per Thumbnail-Link. Wir nutzen die oeffentliche YouTube oEmbed API oder verlinken direkt auf `youtube.com/results?search_query=...`. Alternativ: YouTube Data API v3 fuer echte Suchergebnisse (braucht API Key). Pragmatischste Loesung: Thumbnails mit YouTube-Suchlinks generieren, die den Trend-Namen als Query nutzen.

### Problem 2: Design sieht "2009" aus
Das aktuelle Design nutzt einfache Cards und iframes ohne den futuristischen James Bond / Sci-Fi Stil der restlichen App.

**Loesung:** Komplettes Redesign beider Tabs mit:
- Glassmorphismus-Cards mit Neon-Glow-Borders
- Animierte Hover-Effekte mit Shimmer
- Gradient-Overlays auf Video-Thumbnails
- Quellen-Chips mit Glow-Effekten
- Skeleton-Loader im futuristischen Stil statt einfacher Spinner

### Technische Aenderungen

**1. Edge Function (`search-trend-articles/index.ts`)**
- YouTube-Video-Suche entfernen (liefert nur fake IDs)
- Stattdessen: YouTube-Suchlinks generieren basierend auf Trend-Keywords
- Optional: Video-Thumbnails via YouTube-Suche-URL einbetten

**2. TrendDetailModal.tsx - Artikel-Tab Redesign**
- Glassmorphism-Cards mit `backdrop-blur` und `border-glow`
- Favicon groesser + in kreisfoermigem Container mit Glow
- Source-Badge mit Plattform-Farb-Gradient
- Animierter Hover mit Scale + Shadow-Glow
- Lese-Zeit Schaetzung als visuelles Element

**3. TrendDetailModal.tsx - Medien-Tab Redesign**
- Statt broken iframes: YouTube-Thumbnail-Cards mit Play-Overlay
- Click oeffnet YouTube-Suche in neuem Tab
- Futuristisches Grid-Layout mit Neon-Borders
- Animated gradient background auf Cards
- "Powered by Web-Suche" Badge im Sci-Fi Stil

**4. Loading State**
- Skeleton-Loader mit Shimmer-Animation statt Spinner
- Pulsierender Neon-Ring beim Laden

| Datei | Aenderung |
|---|---|
| `supabase/functions/search-trend-articles/index.ts` | YouTube-Fake-IDs entfernen, Suchlinks generieren |
| `src/components/trends/TrendDetailModal.tsx` | Beide Tabs komplett im Sci-Fi/Glassmorphism Stil redesignen |

