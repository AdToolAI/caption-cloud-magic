## Problem

Die `FeatureGrid`-Sektion ("Alles was du brauchst…") ist ein flaches 3×2-Raster aus identisch kleinen Icon-Karten. Auf 1060px wirkt das eingequetscht, generisch und mehr wie ein Admin-Dashboard als wie eine Premium-Landingpage.

## Lösung: Bento-Showcase mit visuellen Mockups

Ein asymmetrisches Bento-Grid (Apple/Linear-Stil), in dem jede Karte ein eigenes Mini-Visual zeigt — kein Gradient-Platzhalter, sondern ein echtes UI-Snippet, das das Modul greifbar macht.

### Layout (Desktop, 4 Spalten · `auto-rows-[260px]`)

```text
┌─────────────────────────────┬───────────────┬───────────────┐
│                             │               │               │
│   CONTENT PLANNING          │   ANALYTICS   │   BRAND KIT   │
│   (Hero · 2×2)              │               │               │
│   Mini-Calendar Heatmap     │   Bar-Chart   │   Swatches    │
│                             │   +248%       │   + Aa        │
├─────────────────────────────┼───────────────┼───────────────┤
│   AI COACH                  │ MULTI-PLATTFORM │ GOAL TRACKING │
│   Chat-Bubbles              │ Plattform-Grid│   Progress 72% │
└─────────────────────────────┴───────────────┴───────────────┘
```

Mobile/Tablet: 1 bzw. 2 Spalten, Hero-Card rückt nach oben.

### Per-Card-Visuals (alle in CSS/SVG, keine externen Assets)

| Modul              | Visual                                                                |
|--------------------|-----------------------------------------------------------------------|
| Content Planning   | 3-Wochen-Heatmap-Mini-Kalender mit pulsierenden Gold-Slots            |
| Analytics          | 10-Bar-Chart Gradient gold, "+248% Reach"-Badge                       |
| Brand Kit          | 5 Farb-Swatches mit Glow + Playfair/Inter Type-Spec                   |
| AI Content Coach   | Zwei Chat-Bubbles (User-Frage + KI-Antwort mit Metric-Highlight)      |
| Multi-Platform     | 6 Plattform-Tiles (IG/TT/LI/X/YT/FB), eines gold-aktiv                |
| Goal Tracking      | Gold-Progressbar 72% mit Glow + großer tabular Zahl                   |

### Karten-Look (James Bond 2028)

- Glassmorphism: `bg-gradient-to-br from-card/70 via-card/50 to-card/20`, `backdrop-blur-xl`
- Sharp Corners (`borderRadius: 6px`), 1px gold Hairline-Border auf Hover
- Innerer/äußerer Gold-Glow auf Hover (`box-shadow inset` + drop)
- Visual oben (~55%), Content unten mit Icon, Titel (Playfair), Beschreibung, dezentem `ArrowUpRight` rechts oben (erscheint auf Hover)

### Header-Refinement

- Linksbündig statt zentriert, max-w-3xl, mehr Atemraum
- "Modules"-Badge mit gold Hairline (analog AI Arsenal)
- H2 in Playfair, 4xl→6xl, Gradient von `primary → gold → gold-dark`
- 80px Margin nach unten zum Grid

### Spacing

- `py-32` (statt 24) für mehr Atemraum oben/unten
- `gap-6` zwischen Cards (statt 6 → bleibt) plus min-height 260px → keine Quetschung mehr
- Container `max-w-7xl` (statt 6xl) für edge-to-edge Premium-Gefühl

## Dateien

- `src/components/landing/FeatureGrid.tsx` — komplett neu geschrieben (~280 Zeilen)
- Keine Translation-Änderungen nötig — alle Keys (`landing.featureGrid.*`) bleiben
- Keine neuen Assets — Visuals sind reine CSS/Tailwind-Mockups
- `src/pages/Index.tsx` bleibt unverändert (gleicher Komponenten-Import)

## Out-of-scope

- `MissionFeatures` (01/02/03 Karten) bleibt unverändert — du hast nur das Feature-Grid markiert
- `AIArsenalShowcase` bleibt unverändert
