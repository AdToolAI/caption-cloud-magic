## Status heute (was der Coach kann)

- **Trigger-Engine** (`useCompanionCoach`): Persona-basierte Cooldowns (Espresso / Balanced / Guided / Playful), Daily-Cap, Session-Guard, 90-Tage-Historie in `companion_triggers`.
- **13 Trigger vor-definiert**: 6 Route-Tips (Cast&World, Motion, AI-Video, Audio, Picture, Composer), 2 Intent (Wallet-Low, Error-Streak), 5 Milestones (First-Render, Cast-Master, Voice-Pioneer …).
- **UI**: `ConciergeTipHost` — dezente Karte unten links, Persona-Akzentfarbe, CTA-Navigation, Dismiss/Later, `prefers-reduced-motion`-aware.
- **Was fehlt** (Grund für den Upgrade-Plan): keine „Kino-Signatur", keine Milestone-Feier, keine Persona-Öffnungssequenz, keine Sound-Option, kein Concierge-Onboarding-Screen.

## Ziel

Der Coach soll sich anfühlen wie ein Regisseur, der kurz ins Bild tritt — nicht wie eine Push-Benachrichtigung. Ein **Cinema-Concierge** mit Signature-Reveals wie Motion Studio, aber **kompakt, GPU-billig, komplett stumm im Idle**.

## Neue Bausteine

### 1. `ConciergeStage` — cinematischer Reveal-Container
Ersetzt den aktuellen simplen Fade. Drei Reveal-Modi je nach Trigger-Kategorie:

- **`whisper`** (Route-Tips, Intent) — 320ms Slide+Blur-Off, weiche Gold-Aura, keine Fanfare.
- **`spotlight`** (Wallet-Low, Error-Streak) — 480ms Curtain-Wipe von unten, subtile Vignette pulst 2× auf Karte, dann Stille.
- **`ovation`** (Milestones — First-Render, Cast-Master, Voice-Pioneer) — 900ms:
  1. Zentraler „Iris-Open" (SVG-Mask, GPU-only)
  2. Confetti-Streaks aus 4 Gold-Punkten (Framer-Motion staggered, 8 Partikel gesamt — bewusst reduziert)
  3. Karte landet mit weichem Bounce, Persona-Farbe pulsiert 1× im Border
  4. Optional 400ms „Success-Sting" (nur wenn Voice-Output an, sonst stumm)

Alle Reveals: `will-change: transform, opacity` nur während der Animation, danach entfernt. Bei `prefers-reduced-motion` fällt alles auf 200ms Fade zurück.

### 2. `PersonaSignature` — 40×40 Signet oben links auf der Karte
Kleines animiertes Symbol pro Persona (Lottie-frei, reines SVG + Framer):
- **Espresso** — pulsierende Cyan-Linie (Metronom-Rhythmus)
- **Balanced** — 4-Zack-Stern mit langsamer Rotation (Signatur-Logo)
- **Guided Tour** — Amber-Kompassnadel, dreht 1× beim Reveal
- **Playful** — Violet-Sparkle mit dezentem Micro-Bounce

Animiert nur einmal beim Reveal, danach statisch — kein Dauerloop.

### 3. `ConciergeIntroScreen` — Full-Screen-Willkommen (nur First-Login)
Einmalig bei erstem Companion-Kontakt oder wenn User „Concierge starten" klickt:
- 1200ms Curtain-Open über die ganze Seite (Backdrop-Blur 8px → 0, dunkle Vignette lichtet sich)
- Zentrale Karte mit 3 Fragen (Lernstil, Sprache-Bestätigung, primäres Ziel: „schneller Spot" / „Ensemble" / „Nur erkunden")
- Nach Speichern: Vignette schließt sich elegant, Persona-Signatur "landet" in der Ecke → daraus wird der laufende Coach.
- **Ausgang-Guard**: State in `companion_user_preferences.preferences.concierge_completed`, damit nie wieder erscheint.

### 4. Milestone-Overlay (`OvationOverlay`)
Für **First-Render**, **Cast-Master**, **Voice-Pioneer**:
- Kurze goldene Light-Sweep-Linie oben (300ms diagonal)
- Achievement-Titel als Kerning-Animation (Buchstaben stagger 30ms)
- Kein Blocking — User kann sofort weiterklicken.
- Persistiert Badge in `companion_triggers.metadata.badge_shown = true`, damit im Companion-History-Tab später als Trophäe auftaucht.

### 5. Sound-Layer (opt-in, standardmäßig aus)
- 2 kurze Web-Audio-Sines (kein File-Load): "whisper" (200Hz→400Hz, 120ms) und "ovation" (Gold-Perfect-Fifth-Chord, 400ms).
- Nur aktiv wenn `companion_user_preferences.preferences.coach_sound = true`.
- Toggle in CompanionSettings.

## Performance-Budget (nicht verhandelbar)

- **Idle-Kosten**: 0 — Komponenten sind mounted-lazy, kein Framer bis `activeTip` gesetzt wird.
- **Reveal-Kosten**: max 8 gleichzeitig animierte DOM-Nodes, alle GPU-transformiert (`transform`, `opacity`, `filter`), keine Layout-Reflows.
- **Kein Lottie**, **keine Videos**, **keine großen Assets** — alles Inline-SVG + Framer-Motion (bereits im Bundle).
- **Bundle-Zuwachs**: <8 KB gzip (drei neue TSX, ein SVG-Set).
- **Reduced-Motion**: alle Reveals kollabieren auf 200ms Fade.

## Wiring

- `ConciergeTipHost` refaktoriert → nutzt `ConciergeStage` mit `revealMode` aus `trigger.category` gemapped.
- `useCompanionCoach.fire()` erweitert um optionales `revealOverride` (für Milestones).
- `App.tsx` mountet zusätzlich `ConciergeIntroScreen` (nur wenn `!concierge_completed`).
- `CompanionSettings.tsx` bekommt zwei neue Zeilen: „Lernstil" (Persona-Select) + „Coach-Sound" (Toggle).

## Explizit NICHT dabei

- Kein Full-Screen-Video-Intro (zu schwer, langsam auf Mobile).
- Keine dauerhaften Loop-Animationen (frisst Battery).
- Keine Sound-Autoplay ohne Opt-in.
- Keine Third-Party-Confetti-Lib (bringt eigene RAF-Loop mit).

## Reihenfolge der Umsetzung

1. `ConciergeStage` + Reveal-Modi (whisper/spotlight/ovation)
2. `PersonaSignature`-SVG-Set (4 Signets)
3. `OvationOverlay` für Milestones
4. `ConciergeIntroScreen` (First-Login-Concierge)
5. `CompanionSettings` — Persona-Select + Sound-Toggle
6. Optionaler Sound-Layer (WebAudio, opt-in)

**Nutzen**: Der User merkt beim ersten Trigger sofort „das ist eine Regie", beim ersten Render eine kurze Feier, ohne dass die Seite je auch nur 1 ms Idle-Cost hat.

Soll ich so umsetzen?