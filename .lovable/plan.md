# Phase 4 — Cinematic Welcome & Briefing Soundstage

Du hast Recht: Der bisherige `StageWelcomeMoment` ist nur ein ~700ms Clapper-Snap — viel zu kurz und nicht "krass" genug. Und das Briefing selbst sieht noch aus wie ein normales Formular auf dunklem Background. Wir bringen beides auf Bond-meets-Apple-Niveau.

## 1. Cinematic Welcome Sequence (`StageWelcomeMoment` v2)

Ersetzt den aktuellen 700ms-Clap durch eine ~3.8s Sequenz in 5 Beats, skippable per Klick/ESC, einmal pro Session (`sessionStorage`).

```text
0.0s ─ Deep black, faint gold particles drifting
0.6s ─ Letterbox bars slide in (2.39:1, gold hairline)
1.0s ─ Clapper SVG snaps shut (existing) + Action-Cue
1.4s ─ "ADTOOL AI" wordmark fades up, gold gradient sweep L→R
2.0s ─ "MOTION STUDIO" sub-line types in (mono, letterspaced)
2.6s ─ Tagline "Where stories become cinema." fade-in
3.2s ─ Spotlight iris-open reveals the briefing underneath
3.8s ─ Overlay removed, ambient hush loop starts
```

Neue Komponente: `src/components/video-composer/stage/StageWelcomeMoment.tsx` (refactor, gleicher Export).
- Reine CSS/Framer-Motion-Animation, keine neuen Assets nötig.
- Partikel via 24 absolut positionierte `motion.span` mit `animate` (drift + opacity).
- Letterbox-Bars wiederverwenden das `CinemascopeOverlay`-Styling.
- Wordmark nutzt `Playfair Display` (bereits geladen), gold gradient via `bg-clip-text`.
- Iris-Reveal via `clip-path: circle()` 0% → 150%.
- "Skip Intro"-Pill unten rechts (erscheint ab 0.8s).
- Audio: ruft `playCue('action')` bei 1.0s und `startAmbient()` bei 3.6s via bestehenden `useStageAudio` Hook.

## 2. Briefing Soundstage Skin

Aktuell ist die Briefing-Seite generisch. Wir geben ihr eine eigene cinematic Identität, ohne Felder/Logik anzufassen.

### 2a. Stage Backdrop Layer (global im `MotionStudioStage`)
- Animated radial gold spotlight (oben mitte), langsam atmend (8s ease-in-out loop).
- Zweiter, schwächerer Spot unten rechts (counterbalance).
- Existierende Film-Grain-Layer behalten, leicht verstärken.
- Subtile horizontale "scanlines" (1px every 4px, opacity 0.015) als CSS-Repeat.

### 2b. Briefing Section Cards
Datei: `src/components/video-composer/briefing/BriefingSection.tsx` (oder äquivalent — vor Edit per `code--view` finden).
- Cards bekommen `backdrop-blur-xl`, glas-effekt mit `bg-white/[0.02]`, gold hairline border (`border-primary/20`), inner shadow.
- Section-Header mit Take-Slate-Stil: kleine Slate-Nummer ("SC 01", "SC 02", …) links neben dem Titel, Mono-Font, gold.
- Hover: border glow auf `border-primary/40` + leichter lift (`translate-y -1px`).

### 2c. Step-Indicator (Briefing / Storyboard / Voiceover / Musik / Export)
- Statt Standard-Progressbar: 5 Slate-Marker mit Verbindungslinie, aktiver Step pulsiert gold.
- Fortschritt-% rechts in Mono-Font, vor der Zahl ein winziges Reel-Icon.

### 2d. "Pro-Tipp Sherlock-Holmes-Effekt"-Banner
- Aus dem aktuellen Listing-Look in ein "Director's Note"-Banner umwandeln: linke gold-Linie 2px, leicht kursive Serif für den Titel, kleines Filmrollen-Icon.

## 3. Files

**Edit:**
- `src/components/video-composer/stage/StageWelcomeMoment.tsx` — komplette Neuimplementierung der Sequenz
- `src/components/video-composer/stage/MotionStudioStage.tsx` — Backdrop-Layer (spotlights, scanlines) erweitern
- `src/index.css` — neue Keyframes: `stageSpotlightBreath`, `stageWordmarkSweep`, `stageIrisOpen`, `stageScanlines`
- Briefing-Container (genauer Pfad nach `code--view` von `src/pages/VideoComposer/index.tsx` und dem Briefing-Tab) — Card-/Header-/Tip-Styling

**Keine neuen Dependencies, keine neuen Assets, keine Backend-Änderungen.** Lipsync/Render/Edge-Functions bleiben unberührt.

## 4. Persistence & Accessibility
- Welcome läuft 1× pro Browser-Session (`sessionStorage['motion-studio:welcome-seen']`).
- "Skip Intro" + ESC-Key skippt sofort, setzt Flag.
- `prefers-reduced-motion`: Sequenz kollabiert zu 400ms Fade ohne Bewegung.
- Mute-Toggle in der DirectorBar respektiert (kein Action-Cue wenn muted).

## 5. Estimate
~1 Tag. Phase 5 (Storyboard-Strip Polaroids, AI-Co-Pilot pro Szene) wie geplant danach.
