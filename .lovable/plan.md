

## Medien-Tab "Next Level" Redesign

### Problem
Der Medien-Tab zeigt nur textbasierte Suchlinks mit kleinen Play-Buttons - das wirkt wie eine einfache Linkliste statt einer modernen Medien-Erfahrung. Es fehlen echte visuelle Elemente (Thumbnails, Previews).

### Loesung: Visuelles Medien-Erlebnis

**1. YouTube-Karten als grosse visuelle Thumbnail-Cards**
- Statt kleine Text-Links: Grossflaechige Cards im 16:9 Format mit Gradient-Overlay
- Zentrierter Play-Button mit Neon-Glow und Pulse-Animation
- Suchbegriff als Overlay-Text unten im Card
- Hover-Effekt: Card hebt sich, Play-Button skaliert, Glow intensiviert sich

**2. Grid-Layout statt Liste**
- 2-Spalten Grid fuer Video-Cards (statt vertikale Liste)
- Erste Card kann als "Featured" groeszer dargestellt werden (full-width)
- Glassmorphism-Rahmen mit animiertem Gradient-Border

**3. Artikel-Tab ebenfalls aufwerten**
- Artikel als Cards mit grossem Thumbnail-Platzhalter (Gradient basierend auf Source-Domain)
- Source-Favicon prominenter mit Glow-Ring
- Hover: Neon-Border-Shimmer-Animation

**4. Futuristischer Loading-State**
- Skeleton-Cards im gleichen Grid-Layout
- Shimmer mit Neon-Gradient statt grauem Pulse

### Technische Aenderungen

| Datei | Aenderung |
|---|---|
| `src/components/trends/TrendDetailModal.tsx` | Medien-Tab: Grid-Layout mit grossen visuellen Thumbnail-Cards, animierte Glow-Effekte. Artikel-Tab: Visuellere Cards mit Gradient-Thumbnails |

