

## Plan: Community-Seite auf 2028-Niveau anheben

### Problem
Die Community-Seite nutzt einfache, unstyled Komponenten ohne die Premium-Design-Elemente (Glassmorphism, Gradient-Texte, Framer Motion Animationen, Shimmer-Effekte), die auf allen anderen Seiten (HubPage, Coach, Analytics) bereits Standard sind. Der Header-Text ist schlicht und wirkt unprofessionell.

### Änderungen

**1. `src/pages/Community.tsx` — Komplettes Redesign im 2028-Stil**
- Hero-Header mit Gradient-Text (gold-to-cyan) wie auf HubPage statt einfachem `text-2xl font-bold`
- Glow-Ring Icon-Box mit pulsierender Animation
- Animierte Divider-Linie unter dem Header
- Floating Particles im Hintergrund
- Framer Motion `staggerChildren` Animationen beim Laden
- Tabs mit `backdrop-blur-xl bg-card/60 border-white/10` Glassmorphism-Styling
- Subtitel mit eleganterer Formulierung

**2. `src/components/community/MessagesTab.tsx` — Glassmorphism-Container**
- Container mit `backdrop-blur-xl bg-card/60 border border-white/10` statt `bg-card`
- Sub-Navigation Buttons mit Glassmorphism-Hover-Effekten
- Gold/Cyan Akzente auf aktiven Buttons

**3. `src/components/community/DirectMessages.tsx` — Premium Chat-UI**
- Glassmorphism Chat-Bubbles mit `shadow-[0_0_20px_hsla(43,90%,68%,0.1)]`
- Gradient-Hintergrund für eigene Nachrichten (gold statt plain primary)
- Animierte Eingangs-Animationen für neue Nachrichten
- Empty-State mit animiertem Icon und eleganterem Text
- Input mit Glassmorphism-Styling

**4. `src/components/community/MentoringTab.tsx` — Bento-Grid Cards**
- Cards mit `hub-card-shimmer` Klasse und Shimmer-Border-Animation
- Hover-Lift-Effekte (`hover:-translate-y-2 hover:shadow-[...]`)
- Staggered reveal Animationen
- Gradient-Akzente auf Badges

**5. `src/components/community/CollaborationsTab.tsx` — Premium Grid**
- Gleiche Card-Shimmer-Effekte wie MentoringTab
- Glassmorphism auf Filter-Buttons
- Animierte Card-Einblendung mit Framer Motion

**6. `src/components/community/PlatformAnnouncements.tsx` — Polierte Ankündigungen**
- Glassmorphism-Cards mit Shimmer-Borders
- Gold-Glow auf "Wichtig"-Badges
- Animiertes Erscheinen

**7. `src/components/community/CommunityTab.tsx` — Channel-Layout upgraden**
- Glassmorphism-Container für alle drei Spalten
- Shimmer-Effekte auf dem Channel-List-Container

### Design-Elemente (konsistent mit HubPage)
- Gradient-Text: `linear-gradient(135deg, hsl(43 90% 68%), hsl(187 84% 55%))`
- Glassmorphism: `backdrop-blur-xl bg-card/60 border border-white/10`
- Card-Glow: `hover:shadow-[0_0_40px_hsla(43,90%,68%,0.2)]`
- Shimmer-Border Animation auf Cards
- Floating Particles (gold + cyan)
- Framer Motion stagger reveal

### Betroffene Dateien
- `src/pages/Community.tsx`
- `src/components/community/MessagesTab.tsx`
- `src/components/community/DirectMessages.tsx`
- `src/components/community/MentoringTab.tsx`
- `src/components/community/CollaborationsTab.tsx`
- `src/components/community/PlatformAnnouncements.tsx`
- `src/components/community/CommunityTab.tsx`

