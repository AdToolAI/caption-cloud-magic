

## Plan: Trend Radar Layout-Umbau — Top Trends nach oben, Kategorien mit Bildern

### Aktuelles Layout (von oben nach unten)
1. HeroHeader (Titel, Entdecken/Gespeichert/Neu laden)
2. Ticker-Marquee
3. "Entdecke deine Nische" — 6 Kategorie-Karten mit Emojis
4. E-Commerce Subcategories (wenn aktiv)
5. Hero Carousel (Top 5 Trends)
6. Floating Stats
7. Filter/Suche
8. Trend-Grid

### Neues Layout
1. **Kompakter Header** — Nur Titel + "Gespeichert" + "Neu laden" Buttons (Entdecken-Button entfällt, da das der Default ist; Trend-Count-Badge bleibt)
2. **Hero Carousel (Top Trends)** — direkt nach dem Header, prominenteste Position
3. **Ticker-Marquee**
4. **Kategorie-Karten mit Pexels-Bildern** — statt Emojis bekommen die 6 Karten ein Hintergrundbild (z.B. "social media smartphone" für Social-Media). Karten werden als horizontale Bildkarten mit Overlay-Text gestaltet, ähnlich Netflix-Kategorien
5. E-Commerce Subcategories
6. Filter/Suche
7. Trend-Grid

### Änderungen

**`src/pages/TrendRadar.tsx`**
- Reihenfolge im JSX umstellen: HeroCarousel direkt nach Header
- Kategorien-Array: `icon`-Emoji durch `image`-Pexels-URL ersetzen (statische, kuratierte URLs für konsistente Qualität)
- Kategorie-Karten: Neues Design mit Hintergrundbild, dunklem Overlay und Text darüber
- FloatingStats entfernen (redundant mit Ticker und Carousel)

**`src/components/trends/TrendRadarHeroHeader.tsx`**
- "Entdecken"-Button entfernen (Default-View braucht keinen Button)
- Layout vereinfachen: Titel links, "Gespeichert" + "Neu laden" rechts

### Kategorie-Bilder (kuratiert, statisch)
Statt dynamischer Pexels-Suche verwenden wir feste, handverlesene Pexels-Bild-URLs pro Kategorie:
- Social-Media → Smartphone/Content-Creator
- E-Commerce → Shopping/Produkte  
- Lifestyle → Wellness/Natur
- Business → Office/Technologie
- Motivation → Person/Erfolg
- Finance → Geld/Investment

### Betroffene Dateien
- `src/pages/TrendRadar.tsx` — Layout-Umbau, Kategorie-Bilder
- `src/components/trends/TrendRadarHeroHeader.tsx` — Vereinfachung

