## Academy Leader Countdown — Nach der Welcome Sequence

Verstanden! Macht auch mehr Sinn: Welcome-Sequenz baut die Stimmung auf (Clapperboard + Bars), dann der klassische 3-2-1 Academy Leader als finaler Übergang ins Briefing — wie im echten Kino.

### Reihenfolge

```text
[Welcome Moment ~2.6s]
   Black → Clapperboard → "MOTION STUDIO" Type-in → Bars open
            │
            ▼
[Academy Countdown ~3.6s]   ← NEU
   ┌─────────────┐
   │   ╱──╲      │
   │  │ 3  │     │  ← Sweep rotiert 1s
   │   ╲──╱      │     dann 3 → 2 → 1
   └─────────────┘     dann kurzer Weiß-Flash
            │
            ▼
[Briefing fadet ein]
```

Kein Cut zwischen Welcome und Countdown — Welcome endet, Bars öffnen, dahinter erscheint **nahtlos** die Countdown-Scheibe (kein erneuter Black-Cut). Nach der "1" gibt's einen kurzen Weiß-Flash (klassisches Academy-Leader-Ende), dann fadet das Briefing rein.

### Visual Design (Old-Film Clock)

- **Scheibe**: Kreis Ø ~280px, tief-schwarz `#050505`, konzentrische Ringe in `rgba(245,199,106,0.15)`
- **Ziffer**: Große Playfair-Display-Zahl mittig (Bone-White), mit subtilem Film-Korn-Overlay
- **Sweep-Linie**: Gold-glühende Linie rotiert in **genau 1s** um den Kreis (wie Stoppuhr-Sekundenzeiger)
- **12 Tick-Marker** am Rand wie Uhrenzifferblatt, aktiver pulsiert in Gold
- **Diagonales ✕** im Hintergrund (8% Opazität) — das ikonische Academy-Leader-Kreuz
- **Film-Korn**: SVG-noise overlay, 25% Opazität, leicht flackernd (echter 16mm-Look)
- **Vignette** außen für Fokus

### Choreografie

| Zeit (nach Welcome) | Beat                                                  |
| ------------------- | ----------------------------------------------------- |
| 0 – 200ms           | Clock-Scheibe fadet ein (scale 0.9 → 1.0)             |
| 200ms               | "3" pop-in, Sweep startet 1s-Rotation                 |
| 1200ms              | "3" zoom-out + blur, "2" pop-in, neuer Sweep          |
| 2200ms              | "2" zoom-out, "1" pop-in, neuer Sweep                 |
| 3200ms              | "1" zoom-out, **Weiß-Flash** (200ms)                  |
| 3400ms              | Clock kollabiert, Briefing erscheint                  |

Skip-Button rechts unten überspringt Welcome + Countdown sofort. Reduced-motion: Countdown wird auf 400ms statischen Fade reduziert (zeigt nur "3·2·1" nebeneinander, kein Spin).

### Integration

- Neue Komponente: `src/components/video-composer/stage/StageCountdown.tsx`
- `StageWelcomeMoment.tsx` wird erweitert: nach dem letzten Welcome-Beat rendert es `<StageCountdown onComplete={onDone} />` statt direkt `onDone()` aufzurufen
- Skip-Button verschoben in den Welcome-Wrapper, deckt beide Phasen ab
- Keine Änderung am Briefing oder den Mode-Cards

### Neue Keyframes (`index.css`)

```text
countdownSweep    → rotate(0deg → 360deg), 1s linear infinite (3 Loops)
countdownDigitIn  → scale(0.4) blur(20px) → scale(1) blur(0), 200ms
countdownDigitOut → scale(1) → scale(1.8) blur(12px) opacity:0, 300ms
countdownGrain    → translate noise pattern, 0.15s steps infinite
countdownFlash    → opacity 0 → 1 → 0 weiß, 200ms
countdownTick     → tick-marker gold pulse, 1s linear
```

### Scope

**In scope:**
- Neue `StageCountdown.tsx` Komponente
- Integration nach Welcome in `StageWelcomeMoment.tsx`
- 6 neue Keyframes in `index.css`
- Skip + reduced-motion Pfad

**Out of scope:**
- Audio / Tick-Sounds (Web Audio Setup — auf Wunsch separat)
- Briefing-, Mode-Card-, oder Layout-Änderungen
- Backend / edge / schema

Reiner Frontend-Polish, ~0.3 Tag. Soll ich's so bauen?
