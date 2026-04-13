

## Plan: TV-Style News-Ticker für Content-Tipps

### Konzept
Ein horizontaler, durchlaufender Ticker-Balken wie bei Nachrichtensendern (CNN/Bloomberg-Stil), der ständig Content-Tipps, Plattform-Updates und Weisheiten durchscrollt. Platziert direkt unter dem Header, über dem Dashboard-Content. Im James Bond 2028 Stil mit Gold-Akzenten und Glassmorphism.

### Umsetzung

1. **Neue Komponente `NewsTicker.tsx` erstellen**
   - Horizontaler Balken mit CSS-Animation (`@keyframes marquee`) für endloses Durchlaufen
   - Gold-leuchtende Trennlinien oben und unten (wie Enterprise-Credits-Pattern)
   - Dunkler glassmorphism Hintergrund (`bg-black/40 backdrop-blur-md`)
   - Links ein Label-Badge "LIVE TIPS" oder "💡 CONTENT INTEL" im Gold-Stil
   - Rechts scrollender Text mit Tipps, getrennt durch Gold-Diamonds (◆)
   - Hover pausiert die Animation

2. **Tipps-Datenbank**
   - Statisches Array mit 15-20 Content-Tipps auf Deutsch (z.B. "Poste Reels zwischen 18-20 Uhr für 3x mehr Reichweite", "Nutze 3-5 Hashtags für optimale Sichtbarkeit")
   - Tipps rotieren bei jedem Laden zufällig
   - Später erweiterbar mit personalisierten Tipps aus der DB

3. **Integration in Home.tsx**
   - Direkt unter dem "Tipp des Tages"-Bereich bzw. als Ersatz dafür
   - Nur für eingeloggte User sichtbar
   - Schmale Höhe (~36-40px) um wenig Platz zu nehmen

4. **Styling (James Bond 2028)**
   - Hintergrund: `bg-gradient-to-r from-black/60 via-[#0a0f1e]/80 to-black/60`
   - Text: Gold (`text-primary`) oder helles Weiß
   - Leuchtende Linien oben/unten: `bg-gradient-to-r from-transparent via-primary/40 to-transparent`
   - Label-Badge: Gold-Border mit Glow
   - Smooth infinite scroll animation

### Betroffene Dateien
- `src/components/dashboard/NewsTicker.tsx` — Neue Komponente
- `src/pages/Home.tsx` — Integration

### Ergebnis
- TV-Nachrichtensender-Feeling mit durchlaufenden Content-Tipps
- Passt zum James Bond 2028 Premium-Look
- Nimmt minimal Platz ein, liefert aber ständig Mehrwert

