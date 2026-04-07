

## Plan: Gaming Hub auf James Bond 2028 Design-Level bringen

### Problem
Der Gaming Hub ist die einzige große Seite ohne Premium-Design. Einfache Layouts, fehlende Animationen und keine Glassmorphism-Effekte lassen ihn im Vergleich zum Rest der App unfertig wirken.

### Änderungen

**1. Neuer GamingHubHeroHeader**
- `src/components/gaming/GamingHubHeroHeader.tsx` — Neue Komponente nach dem Muster aller anderen HeroHeaders:
  - Pulsierendes Mission-Badge ("Twitch Connected" / "Gaming Hub")
  - Gradient-Titel mit Framer Motion reveal
  - Glow-Orbs im Hintergrund (Purple/Violet-Palette)
  - Twitch-Verbindungsstatus als animiertes Badge
  - Subtitle mit Beschreibung

**2. GamingHub.tsx aufwerten**
- HeroHeader einbinden statt des einfachen div-Headers
- Tabs mit Glassmorphism-Styling (backdrop-blur, border-white/10)
- Container-Layout angleichen an andere Seiten

**3. StreamDashboard Premium-Redesign**
- Cards mit `backdrop-blur-xl bg-card/60 border border-white/10`
- StatCards mit Gradient-Border und animierten Zahlen
- Live-Indikator mit Neon-Glow pulsierend
- Framer Motion staggered reveal für Cards
- "Stream vorbereiten"-Card mit Glassmorphism
- Checklist-Items mit smooth Animationen

**4. ClipCreator Aufwertung**
- Clip-Cards mit Hover-Lift (`whileHover={{ y: -4 }}`)
- Thumbnail-Preview mit Glassmorphism-Overlay
- Sortierung und Filter mit Premium-Styling

**5. ChatManager Premium-Styling**
- Chat-Fenster mit Glassmorphism-Background
- Nachrichten mit subtilen Animationen
- Poll/Prediction-Dialoge mit Gradient-Akzenten
- Sentiment-Balken mit animierten Übergängen

**6. StreamAnalytics aufwerten**
- KPI-Cards mit Gradient-Borders und Glow-Shadows
- CountUp-Animation für Zahlen
- Top-Clips-Liste mit Hover-Effekten

**7. GamingContentStudio Premium**
- Cards mit Glassmorphism und Hover-Glow
- Kalender-Einträge mit Motion-Animation
- Reward-Liste mit Premium-Badges

### Technisches Muster (konsistent mit dem Rest)
```text
Card-Styling:    backdrop-blur-xl bg-card/60 border border-white/10
Glow-Shadows:    shadow-[0_0_20px_rgba(145,70,255,0.15)]
Gradient-Text:   bg-gradient-to-r from-purple-400 via-violet-400 to-purple-400 bg-clip-text text-transparent
Mission-Badge:   bg-purple-500/10 border border-purple-500/30 + pulsing dot
Hover-Lifts:     whileHover={{ y: -4, scale: 1.02 }}
Stagger:         variants + staggerChildren: 0.1
```

### Reihenfolge
1. GamingHubHeroHeader erstellen
2. GamingHub.tsx mit HeroHeader + Premium-Tabs
3. StreamDashboard Cards + Animationen
4. StreamAnalytics KPI-Cards + CountUp
5. ClipCreator + ChatManager + ContentStudio Polishing

### Ergebnis
Der Gaming Hub sieht aus wie der Rest der App — Premium, glassmorphic, animated, 2026-ready.

