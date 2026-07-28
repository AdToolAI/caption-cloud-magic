## Plan v286 — Studio-Storyline-Slideshows

Jede Bento-Kachel (Cast, Motion, Video, Picture, Music, Voice) wird klickbar und öffnet ein Dialog-Modal mit 6-Slide-Autoplay-Storyline. Statt direkt zum Studio zu navigieren.

### Slide-Struktur pro Studio (Use-Case-driven, 6 Slides)

Jedes Studio bekommt 6 Slides mit je einem konkreten Anwendungsszenario:

**Cast & World** — Wiederkehrender CEO · Produkt-Maskottchen · Sprecher-Ensemble · Look-Varianten · Voice-Binding · Multi-Studio-Reuse
**Motion Studio** — 4-Sprecher-Dialog · Task-Blocking (Telefon/Drucker) · Emotions-Lippen-Sync · Kling Omni Native · Deutsche Stimmen-Lock · Ein-Take statt Schnitt
**AI Video Studio** — Provider-Wechsel per Klick · Vertikal/Horizontal/Square · Vergleich zweier Engines · Style-Presets · Batch-Renders · Kosten-Transparenz
**Picture Studio** — Produktshot · Editorial-Cover · Portrait-Serie · Brand-Anchor · Stilkonsistenz · Upscale/Retouch
**Music Studio** — Werbe-Jingle · Podcast-Intro · Stems-Export · SFX-Layer · Genre-Switch · Rechte-Klarheit
**Voice Studio** — Stimme klonen · Charakter-Binding · Deutsche VO · Emotion-Steuerung · Skript-Panel · Multi-Sprecher-Library

### Bild-Mix pro Studio (3 Cinematic + 3 UI)

- **Slides 1, 3, 6** — Cinematic Bond-Gold-Renders (via `imagegen--generate_image`, `src/assets/landing/storylines/{studio}/`)
- **Slides 2, 4, 5** — Studio-UI-Mockups (custom SVG-Kompositionen inline, im Stil der bestehenden CapabilityBento-Visuals — z.B. Timeline, Waveform, Card-Grid, Portrait-Chips)

Insgesamt 18 generierte Cinematic-Bilder (3 pro Studio × 6 Studios), horizontal 16:9, dunkles Set mit Gold-Akzenten.

### Modal-Verhalten

- Autoplay 4 Sekunden pro Slide
- Pause bei Hover / bei manueller Navigation
- Pfeil-Buttons + Dot-Indikator + Fortschritts-Balken (goldene Linie füllt sich in 4s)
- ESC schließt, Klick auf Overlay schließt
- CTA-Button in Slide 6: "Studio öffnen →" (Link zur bestehenden `tile.href`)
- Keyboard: ←/→ navigiert, Space pausiert
- `useReducedMotion`: bei reduzierter Motion kein Autoplay, nur manuelle Navigation

### Technische Umsetzung

**Neue Dateien:**
- `src/components/landing/StudioStorylineDialog.tsx` — Modal-Container mit shadcn `Dialog`, Autoplay-Logik, Bond-Gold-Styling (deep black glass, gold accents, Playfair Titles)
- `src/components/landing/storylines/storylineContent.ts` — Zentrale Definition aller 36 Slides (6 Studios × 6): `{ studio, slideIndex, kind: 'cinematic' | 'ui', imageSrc?, UIComponent?, kicker, title, body, tags[] }`
- `src/components/landing/storylines/uiVisuals/` — 18 kleine SVG-UI-Mockup-Komponenten (3 pro Studio), im Stil der CapabilityBento-Visuals wiederverwendbar
- 18 generierte Cinematic-Bilder unter `src/assets/landing/storylines/{cast,motion,video,picture,music,voice}/slide-{1,3,6}.jpg`

**Änderungen:**
- `src/components/landing/CapabilityBento.tsx` — `<Link>` durch `<button>` ersetzen, `onClick` öffnet `StudioStorylineDialog` mit `studio={tile.key}`. Bestehende Visual/Icon/Chip/Hover-Behandlung bleibt.
- `src/i18n/translations.ts` — DE/EN/ES Übersetzungen für alle 36 Slides (Kicker, Title, Body) unter `landing.mission.bento.storylines.{studio}.slides[0..5]`, plus Modal-Chrome (`playPause`, `openStudio`, `slideOf`).

### Design-Details (Bond-Gold, konsistent zum Rest)

- Modal-Größe: `max-w-4xl`, `aspect-video` Bildbereich oben, Text-Panel unten
- Backdrop: `bg-background/95 backdrop-blur-xl`
- Border: `border-primary/30`, Shadow: `shadow-[0_0_60px_hsl(var(--primary)/0.25)]`
- Titelfont: `font-display` (Playfair), Body: Inter
- Fortschritts-Leiste: dünne goldene Linie oben im Modal, füllt sich smooth über 4s
- Slide-Transition: Fade + slight scale (framer-motion `AnimatePresence`)

### Nicht im Scope

- Keine Änderung am `MissionFeatures`-Layout oder anderen Landing-Sektionen
- Keine Änderung an Studio-Seiten selbst
- Keine neuen Übersetzungen für nicht angezeigte Sprachen
- Keine Analytics/Tracking (kann später ergänzt werden)