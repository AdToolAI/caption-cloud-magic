

## TrendRadar "Lebendig machen" - Media & Teaser Upgrade

### Was fehlt
Die Seite ist trotz Glassmorphism und Gradients immer noch sehr **textlastig**. Es fehlen bewegte, lebendige Elemente die sofort Aufmerksamkeit erzeugen.

### Neue Elemente

**1. Animated Trend-Ticker (Laufband)**
- Horizontaler Marquee unter dem Hero-Header mit live scrollenden Trend-Namen
- Neon-glowing Text, animierte Plattform-Icons
- Erzeugt sofort das Gefuhl "hier passiert etwas"

**2. Top-Trends als Hero-Carousel mit Teaser-Cards**
- Statt statisches 3er-Grid: Auto-rotierendes Carousel (alle 5s)
- Jede Slide ist eine grosse, immersive Card mit:
  - Animiertem Hintergrund-Gradient der sich langsam bewegt
  - Grosser Trend-Name mit TypeWriter-Effekt
  - 3 Key-Facts als animierte Chips die nacheinander einblenden
  - "Jetzt analysieren" CTA mit Pulse-Glow
- Dots-Navigation unten

**3. Trend-Cards mit Live-Teaser-Elementen**
- Animiertes "TRENDING NOW" Badge mit Pulse auf heissen Trends (popularity > 85)
- Mini animated chart-sparkline (SVG) die Popularitaet visuell zeigt statt nur Bar
- Hover: Card flippt und zeigt Rueckseite mit Quick-Facts (Plattform, Zielgruppe, Top-Hashtag)

**4. Floating Stats-Counter Section**
- Zwischen Top-Trends und Grid: animierte Zaehler
- "127 Trends analysiert" / "23 neue heute" / "5 Plattformen"
- Count-up Animation beim Scrollen ins Viewport

**5. Category Cards mit animierten Preview-Icons**
- Statt statische Emojis: Lottie-aehnliche CSS-Animationen (bounce, rotate, pulse je nach Kategorie)
- Mini-Preview der Top-3 Trends als Hover-Tooltip

### Technische Aenderungen

| Datei | Aenderung |
|---|---|
| `src/pages/TrendRadar.tsx` | Trend-Ticker Marquee, Hero-Carousel statt Grid, Floating Stats, Card-Flip auf Hover, Sparkline-Charts, "TRENDING NOW" Badges |
| `src/components/trends/TrendRadarHeroHeader.tsx` | Platz fuer Ticker darunter |

Keine neuen Dependencies - alles mit framer-motion, CSS-Animationen und inline SVG fuer Sparklines.

