

## Hero "Sith Command Deck" — 3D Laptop mit Live-Demo + Holo-HUD

### Die Vision

Statt eines Mock-Players bauen wir ein **3D-perspektivisches Laptop-Display** das wie ein **Sith-Kommandopult** wirkt — scharf, präzise, gefährlich elegant. Im Bildschirm läuft das echte Demo-Video. Über und unter dem Laptop schweben **echte App-UI-Fragmente** (Header-Strip mit Logo/Avatar/Credits; Engagement-Stats; Best-Time-Pill) als Holo-Projektionen.

Kein Spielzeug-Look. Kein Bond-Smoking-Dinner. **Sith-Cockpit.** Schwarz, Karbon, blutrote Akzente neben Gold, scharfe Kanten, pulsierende Daten-Linien, brutale Präzision.

```text
            ┌─ AdTool · Pro · 2.847 credits ─ 🔔 ─ 👤 ──┐  ← Floating Header HUD
            └────────────────────────────────────────────┘
                          ╲
                           ╲   3D-perspective tilt (~8°)
       ┌──────────────────────────────────┐
      ╱                                    ╲
     ╱      ▶  [LIVE DEMO VIDEO 16:9]       ╲   ← Laptop screen
    ╱          custom controls auto-hide     ╲
   ╱        ━━━━━━●━━━━━━━━  0:18 / 1:32     ╲
  └──────────────────────────────────────────┘
  ═══════════════════════════════════════════════   ← Laptop base + glow strip
       
       ┌─ +43% ENGAGE ─┐    ┌─ ⏱ BEST 19:00 ─┐    ┌─ 2.4M REACH ─┐
       └───────────────┘    └─────────────────┘    └──────────────┘
            ↑ 3 floating data pills below — Sith-red+gold glow
```

### Was den Wow-Effekt erzeugt

**1. Echtes 3D-Tilt** (CSS `perspective` + `rotateY/rotateX`) — der Laptop steht leicht schräg, Mausbewegung kippt ihn sanft mit (parallax). Kein Mock — wirkt wie ein Display, das im Raum schwebt.

**2. Sith-Sharp Design** — kein Glow-Soup. Stattdessen:
- Karbon-Schwarz Gehäuse mit messerscharfen Kanten
- **1px hairline** Gold-Linien als Konturen
- Tiefe rot-gold Glühen-Pulse aus der Tastatur-Spalte (wie ein Sith-Lichtschwert das gerade aktiviert wird)
- Kein Border-Radius > 4px — alles eckig, präzise

**3. „Live App Frame" Atmosphäre** — Der Header oben (mit AdTool-Logo, Plan-Badge, Credit-Count, Notification-Bell, Avatar) suggeriert: „Das ist die echte App, die du bekommst." User sieht sich schon eingeloggt.

**4. Daten-Pills unten** — drei schwebende Holo-Pills mit echten Zahlen (+43% Engagement / Best Time 19:00 / 2.4M Reach). Subtile Levitation (3-4px sin-wave float), pulsierender Datenwert-Tick.

**5. Echter Cinematic Player im Display** — Custom Controls in Bond-Style, Auto-Hide nach 2s, Progress-Bar in Gold mit dünnem roten Tracer am Playhead.

---

### Was geändert/gebaut wird

#### Neue Komponenten

1. **`src/components/landing/SithCommandDeck.tsx`** — Hauptcontainer
   - Wrapt die ganze 3D-Szene
   - Mausbewegungs-Parallax via `useState` + `mousemove` (sehr subtil, ±4° max)
   - Perspective-Container mit `transform-style: preserve-3d`

2. **`src/components/landing/LaptopFrame3D.tsx`** — Der Laptop
   - Karbon-Schwarz Gehäuse, dünne Hairline-Akzente
   - Display-Bezel mit **1px Gold-Linie** + **inner shadow** für Tiefe
   - Tastatur-Spalt mit pulsierendem **rot→gold Lichtschwert-Glow** (CSS gradient + `animate-pulse` rhythmisch)
   - Standfuß als trapezförmiger Sockel
   - Slot für `<children />` (= der Player)

3. **`src/components/landing/CinematicVideoPlayer.tsx`** — Der Player im Display
   - 16:9, autoplay muted loop, `playsInline`
   - Custom Controls (Play/Pause, Gold-Progress mit rotem 2px Tracer, Mute, Fullscreen)
   - Auto-Hide nach 2s ohne Hover/Move
   - Klick auf Player → unmute + restart from 0
   - Soft inner glow (kein aggressives Neon)

4. **`src/components/landing/FloatingAppHeader.tsx`** — Das Header-HUD oben
   - Mini-Version der eingeloggten App-Header
   - Inhalt: Logo „AdTool" + Pro-Badge + „2.847 credits" (animiert hochzählend) + Bell-Icon (dezenter rot-Dot) + Avatar-Initial
   - Glassmorphism, 1px Gold-Hairline-Border
   - Schwebt ~24px über dem Laptop, leichte z-Tiefe

5. **`src/components/landing/HoloDataPills.tsx`** — Die 3 Daten-Pills unten
   - Pill 1: `+43% ENGAGEMENT` (Gold-Akzent, Trend-Arrow up)
   - Pill 2: `⏱ BEST 19:00` (Gold)
   - Pill 3: `2.4M REACH` (rot→gold Verlauf, leuchtet stärker)
   - Jede Pill: subtile sin-wave Levitation (verschiedene Phasen damit nicht synchron)
   - Pulsierender 1px-Stroke

#### Geänderte Komponenten

- **`src/components/landing/BlackTieHero.tsx`**
  - Entfernt: `GadgetCardDynamic` (komplett raus)
  - Eingebaut: rechts spaltig `<SithCommandDeck>` als Hero-Visual
  - Layout bleibt **2-spaltig** (Conversion-Text links, Visual rechts) — du bekommst maximale Conversion + maximales Wow
  - Entfernt: aggressive Hintergrund-Pulses und das Holo-Prism-Layer drumherum (lassen den Laptop atmen)
  - Subtle background addition: ein einziger sehr dunkler radial-gradient mit minimalem Rot-Anflug am Boden (Sith-Atmosphäre, nicht Theater)

#### Sith-Farb-Akzente (additive, kein Theme-Bruch)

- Bestehende Bond-Palette (Gold #F5C76A, Deep Black) bleibt **dominant**
- Neuer **dezenter Rot-Akzent** nur im Hero: `hsl(355, 75%, 48%)` (tiefes Sith-Rot, nicht knallig)
- Verwendet ausschließlich für: Lichtschwert-Spalt im Laptop, Tracer-Punkt auf Progress-Bar, Notification-Dot im Header, glow-Akzent unter der „REACH"-Pill
- Rest der Page bleibt 100% Gold/Black — kein Brand-Shift

#### Video-Asset

- Brauchen ein **kurzes Demo-Video** (10-20s, 16:9, MP4, < 4 MB für schnelles Laden)
- Vorerst: Platzhalter-MP4 oder ich generiere mit Remotion ein **Demo-Loop** das die App-UI zeigt (Caption-Generierung in Action, Plattform-Switch, Engagement-Stats)
- Datei landet in `public/hero-demo.mp4`
- **Empfehlung**: Ich generiere den Demo-Loop via Remotion-Skill (15s, 1920×1080, zeigt UI-Mockup-Sequenz mit AdTool-Branding) — dann hast du ein echtes konsistentes Hero-Video das genau passt

---

### Technische Details

- **Pure CSS 3D** (kein Three.js nötig — Performance + Bundle-Size optimal)
  - `perspective: 1500px` auf Container
  - `transform: rotateY(-8deg) rotateX(4deg)` als Default
  - Mouse-parallax: `transform` interpolation ±3° basierend auf `clientX/clientY`
- **Reduced-motion respektiert** — bei `prefers-reduced-motion`: kein Tilt, kein Float, statisches Bild
- **Mobile**: Auf < `lg` Breakpoint zeigen wir den Laptop kleiner und ohne Mausparallax (Tilt nur statisch); Floating-Header darüber bleibt
- **Lazy load** für Video (`preload="metadata"`, autoplay erst bei InView via IntersectionObserver)
- **Performance**: `will-change: transform` auf den 3D-Layern, sonst nichts (kein blur, kein backdrop-filter im Hero)

### Translations (`src/lib/translations.ts`)

Neue Keys EN/DE/ES:
- `landing.hero.deck.headerPlan` → „Pro" / „Pro" / „Pro"
- `landing.hero.deck.headerCredits` → „credits" / „Credits" / „créditos"
- `landing.hero.deck.pillEngagement` → „Engagement" / „Engagement" / „Interacción"
- `landing.hero.deck.pillBestTime` → „Best time" / „Beste Zeit" / „Mejor hora"
- `landing.hero.deck.pillReach` → „Reach" / „Reichweite" / „Alcance"
- `landing.hero.deck.playHint` → „Click to unmute" / „Klicken für Ton" / „Clic para sonido"

### Was NICHT passiert

- Kein Three.js / R3F (overkill, Bundle-Cost zu hoch für ein Hero-Visual)
- Kein Theme-Switch — Bond/Gold bleibt überall sonst
- Kein Verlust der bestehenden Stats-Row (10K+ / 1M+ / +43%) unter den CTAs — bleibt
- Kein Touchen anderer Sektionen in diesem Schritt (Phase 1 fokussiert nur Hero)

---

### Reihenfolge der Umsetzung

**Phase 1 (jetzt, ~75 Min):**
1. `LaptopFrame3D` + `CinematicVideoPlayer` bauen
2. `FloatingAppHeader` + `HoloDataPills` bauen
3. `SithCommandDeck` zusammenbauen mit Mouse-Parallax
4. In `BlackTieHero` integrieren, alte Effekte entfernen
5. Translations EN/DE/ES
6. Platzhalter-Video oder Remotion-generierten Demo-Loop einbinden

**Phase 2 (später, separat):**
- SocialProofStrip, LiveDemoShowcase, TestimonialSpotlight (aus dem vorherigen Plan)

### Demo-Video — eine Frage

Soll ich für das Laptop-Display:

**A)** ein **echtes Demo-Video** via Remotion generieren (15s Loop, zeigt AdTool UI in Action mit Caption-Generierung + Plattform-Switch + Engagement-Spike). Dauert beim Build ~5 Min extra, Ergebnis ist 100% on-brand und konsistent.

**B)** vorerst einen **stillen Platzhalter** (animierter Gradient mit „Live Demo" Text) einbauen, du lieferst später ein eigenes Screen-Recording.

**C)** einen **stockähnlichen Bewegt-Hintergrund** (z. B. Code/UI-Sequenz) einbinden bis du ein finales Demo hast.

Empfehlung: **A** — das ist genau der Moment wo „echt vs. mock" über Vertrauen entscheidet, und Remotion liefert exakt das Niveau.

