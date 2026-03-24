

# Plan: Hub-Seiten futuristisch & aufregend gestalten

## Zusammenfassung
Die aktuellen Hub-Seiten wirken schlicht und statisch. Wir machen sie visuell spektakulär mit animierten Hintergründen, Neon-Glow-Effekten, interaktiven Hover-Animationen und einem futuristischen Sci-Fi-Feeling passend zum James-Bond-Theme.

## Designkonzept

```text
┌─────────────────────────────────────────────────┐
│  ✦ Animated gradient background (subtle pulse)  │
│                                                 │
│  [Icon mit Glow-Ring]  MEDIEN                   │
│  Verwalte Medien, Videos und Audio              │
│  ─────── animated line divider ───────          │
│                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ ◆ glow   │  │ ◆ glow   │  │ ◆ glow   │      │
│  │ icon     │  │ icon     │  │ icon     │      │
│  │ gradient │  │ gradient │  │ gradient │      │
│  │ border   │  │ border   │  │ border   │      │
│  │ shimmer  │  │ shimmer  │  │ shimmer  │      │
│  └──────────┘  └──────────┘  └──────────┘      │
│    hover: 3D tilt + neon border + particles     │
└─────────────────────────────────────────────────┘
```

## Änderungen an `src/pages/HubPage.tsx`

### 1. Animated Background
- Subtiler animierter Gradient-Hintergrund (radial gradient mit sanfter Pulsation via CSS animation)
- Floating Particles: 5-8 kleine leuchtende Punkte die sanft schweben (pure CSS / Framer Motion)

### 2. Hero Header redesign
- Hub-Icon bekommt einen **animierten Glow-Ring** (pulsierender Ring-Effekt um das Icon)
- Titel mit **Gradient-Text** (gold → cyan, passend zum Bond-Theme)
- Animierte Trennlinie darunter (line that draws itself von links nach rechts)

### 3. Cards komplett neu gestalten
- **Glassmorphism** mit sichtbarem Gradient-Border (border-image mit gold→cyan)
- **Animated border shimmer**: Ein Lichtstreifen wandert über den Card-Rand (CSS animation)
- **Hover-Effekt**: Card hebt sich stärker an (-translate-y-2), Neon-Glow wird sichtbar (box-shadow mit primary-color), Icon bekommt Glow
- **Icon-Bereich**: Größer, mit subtiler animated gradient bg hinter dem Icon
- **Animated Arrow**: Bei Hover erscheint ein → Pfeil der reinslided (zeigt "klickbar")
- **Stagger-Animation verbessern**: Mehr Dramatik (scale von 0.8, blur rein → klar)

### 4. Locked-Cards
- Behalten den Lock-Overlay, aber mit einem eleganten "frosted glass" Effekt
- Pulsierender Upgrade-Badge statt statischem

### 5. Responsive Polish
- Auf Mobile: 1 Spalte, Cards etwas kompakter
- Tablet: 2 Spalten

## Technisch
- Alles in `HubPage.tsx` selbst (keine neuen Dateien)
- CSS-Animationen für den Border-Shimmer als inline `@keyframes` via style-Tag oder Tailwind arbitrary values
- Framer Motion für Entrance-Animationen und Hover-States
- Keine externen Dependencies nötig

