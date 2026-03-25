

## TrendRadar Hauptseite - "Next Level" Media-First Redesign

Die bisherigen Aenderungen betrafen nur das **Modal** (TrendDetailModal.tsx). Die **Hauptseite** (`TrendRadar.tsx`) mit den Trend-Cards, Top-Trends und Nischen-Kategorien wurde noch nicht angefasst. Das aendern wir jetzt.

### Was sich aendert

**1. Top-Trends der Woche - Hero Cards mit Media-Thumbnails**
- Statt flache Text-Cards: Grosse Cards mit gradient-basierten visuellen Thumbnails (aehnlich dem Medien-Tab-Design)
- Hintergrund-Gradient basierend auf Plattform-Farbe (TikTok: pink-cyan, Instagram: purple-pink, etc.)
- Scanline-Overlay und Glassmorphism-Effekte
- Groessere Darstellung: Top 3 als Feature-Cards, Rest als kompaktere Row

**2. Nischen-Kategorien - Glassmorphism Upgrade**
- Groessere Icons mit Glow-Ring und Neon-Border auf Hover
- Animierter Gradient-Hintergrund statt flacher Farbe
- Aktive Kategorie mit pulsierendem Border-Glow

**3. Trend-Cards Grid - Visuelles Upgrade**
- Jede Card bekommt einen visuellen Header-Bereich mit Plattform-Gradient (wie die Artikel-Thumbnails im Modal)
- Plattform-Logo/Icon prominent im Gradient-Bereich
- Popularity-Bar mit Neon-Glow-Effekt statt flachem Balken
- Subtile Scanline-Textur im Hintergrund
- Hover: Card hebt sich staerker, Border glowed in Plattform-Farbe

**4. Filter-Bar Redesign**
- Glassmorphism-Upgrade mit subtilen Neon-Borders
- Such-Input mit animiertem Focus-Glow
- Plattform-Dropdown mit Farb-Chips

### Technische Aenderungen

| Datei | Aenderung |
|---|---|
| `src/pages/TrendRadar.tsx` | Top-Trends Cards mit Gradient-Thumbnails, Trend-Cards mit visuellem Header, Filter-Bar Glassmorphism, Popularity-Bar Glow |
| `src/components/trends/TrendRadarHeroHeader.tsx` | Feintuning der Glow-Effekte fuer Konsistenz |

