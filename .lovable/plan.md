

## Plan: Trend-Ticker mit Bildern — Futuristisches Hologramm-Design

### Konzept
Die bestehende NewsTicker-Leiste wird auf halbe Höhe (h-5/h-6 statt h-10) reduziert und zeigt statt statischer Tipps echte Trends aus dem Trend Radar. Jeder Trend erscheint als kompakte "Hologramm-Karte" mit kleinem Thumbnail-Bild, Trend-Name und Plattform-Icon — alles horizontal scrollend im Marquee-Stil.

### Design-Vision: "Holographic Intel Strip"
- **Halbe Höhe**: Von `h-10` auf `h-6` (24px)
- **Trend-Cards im Scroll**: Statt reiner Text-Zeile kleine "Micro-Cards" mit:
  - Winziges Thumbnail (20x20px, abgerundete Ecken, Cyan-Glow-Border)
  - Trend-Name in Gold (truncated, max ~120px)
  - Plattform-Indikator als farbiger Dot (TikTok=cyan, Instagram=pink, YouTube=red)
  - Popularity als Mini-Balken oder Pulse-Animation
- **Separator**: Vertikale leuchtende Linie zwischen den Trend-Cards statt ◆
- **Scan-Line-Effekt**: Ein subtiler horizontaler Lichtstreifen, der periodisch über die Leiste "scannt" (CSS animation)
- **Label**: "TREND RADAR" statt "LIVE TIPS" mit Radar-Pulse-Animation

### Datenquelle
- Trends kommen aus der `fetch-trends` Edge Function (gleiche wie TrendRadar-Seite)
- Fallback: Wenn keine Trends geladen, statische Tipps als Placeholder
- Bilder: Generierte Plattform-Icons/Gradient-Thumbnails (Trends haben keine echten Bilder), erzeugt per CSS-Gradient basierend auf Kategorie/Plattform
- Refresh alle 60 Minuten (wie bisher)

### Technische Umsetzung

1. **NewsTicker.tsx komplett umbauen**
   - Trends per `supabase.functions.invoke('fetch-trends')` laden
   - `h-10` → `h-6`, Text/Badge/Switch proportional verkleinern
   - Trend-Items als Inline-Flex-Cards mit generiertem Thumbnail rendern
   - Scan-Line-Animation als zusätzliches CSS-Overlay
   - Click auf Trend → Navigation zum TrendRadar

2. **Generierte Thumbnails**
   - Kein echtes Bild nötig — CSS-Gradient-Squares mit Plattform-Icon-Overlay
   - Farbe basierend auf Plattform (TikTok=cyan, Instagram=gradient pink-orange, YouTube=red, LinkedIn=blue)
   - Leichter Glow-Rand für Hologramm-Effekt

3. **Scan-Line Keyframe** (in tailwind.config.ts)
   - Neuer Keyframe `scanline`: horizontaler weißer Streifen bewegt sich von links nach rechts

### Betroffene Dateien
- `src/components/dashboard/NewsTicker.tsx` — Kompletter Umbau
- `tailwind.config.ts` — Scanline-Keyframe hinzufügen

### Ergebnis
- Halbe Höhe, doppelt so futuristisch
- Echte Trend-Daten mit visuellen Mini-Cards statt nur Text
- Hologramm-Scan-Line-Effekt für einzigartigen Sci-Fi-Look
- Klickbar für direkten Sprung zum Trend Radar

