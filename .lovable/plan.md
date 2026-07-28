## Plan v291 — Instant Avatar Demo: Compact & Cinematic Upgrade

Ziel: Demo optisch **kompakter** und gleichzeitig **hochwertiger** machen (Level-Up statt Level-Down). Nur Frontend/Presentation — kein Backend-Change.

### A · Kompakter Footprint

- Section-Padding: `py-20` → `py-12 md:py-16`.
- Container-Breite: `max-w-6xl` → `max-w-5xl`.
- Bildboxen (Upload + Turntable): Aspect-Ratio `3/4` → **`4/5`** und zusätzlich `max-h-[520px]` mit `object-contain`, damit die Karten auf Desktop nicht mehr die halbe Bildschirmhöhe fressen.
- Header: H2 `text-4xl md:text-5xl` → `text-3xl md:text-4xl`, Subline `text-lg` → `text-base`, `mb-10` → `mb-8`.
- Style-Chips: 4-Spalten-Grid bleibt, aber Padding `py-2.5` → `py-2`, kompaktere Typografie.
- Proof-Strip (unten): Karten von `aspect-[4/5]`-artig auf `aspect-[16/10]` mit fixer `max-h-[280px]`, damit die drei Szenen als eine ruhige Zeile wirken statt als drei Riesenkacheln.

### B · Visuelles Level-Up (Bond-Gold-Editorial)

1. **Cinematic Frame um den Turntable**
   - Doppelrahmen: äußerer `border-primary/20` + innerer 1 px `ring-primary/10 ring-offset-2 ring-offset-background`.
   - Ecken-Marker (4 goldene L-Corner-Ticks, 12 px, absolut positioniert) — Kamera-Sucher-Ästhetik.
   - Subtile Vignette + Film-Grain-Overlay (SVG-Noise, `opacity-[0.04]`, `mix-blend-overlay`).

2. **Gold-Aurora-Backdrop hinter Turntable**
   - Radialer Gradient `from-primary/25 via-primary/5 to-transparent` + zweiter Off-Axis-Blob, beide `blur-3xl`, langsam via `animate-pulse-slow` (neuer Keyframe, 8s).

3. **Turntable-Interaktion aufwerten**
   - Beim Winkel-Wechsel: 200 ms Crossfade + micro-parallax (`translate-x` ±4 px je nach Winkel-Vorzeichen) statt hartem Bild-Swap.
   - Scanline-Sweep-Effekt (bereits im Design-System vorhandenes `scanline`-Keyframe) läuft einmal nach Fertigstellung über das Bild.

4. **Scrubber-Redesign**
   - Track: von flachem Pill zu einer feinen `h-[2px]` Gold-Linie mit 5 „Notches" (Kamera-Iris-Look).
   - Handle: goldener Diamant mit rotierendem Glow-Ring, statt Kreis.
   - Winkel-Label (`+30°`) folgt dem Handle, nicht statisch oben links.

5. **HUD-Overlay auf Bild** (nur wenn Ergebnis vorhanden)
   - Oben rechts: mono-typografisches Mini-HUD („IDENTITY LOCK · 98%", „STYLE · CINEMATIC", „ANGLE · +30°") — Bond/Camera-UI-Feeling.
   - Unten mittig: zarter „POWERED BY ADTOOL AI"-Wortmark in `tracking-[0.3em] text-[10px] text-primary/50`.

6. **Style-Chips als Filmklappen-Buttons**
   - Aktiver Chip bekommt einen 1 px goldenen Top-Streifen + `shadow-[inset_0_0_0_1px]` — wirkt wie eine gedrückte Aufnahmetaste.

7. **Proof-Strip Editorial-Redesign**
   - Statt drei gleichgroßen Kacheln: **Bento 2-1** (eine breite Hero-Szene links, zwei gestapelt rechts).
   - Overlay-Titel bottom-left, feine Trennlinie in Gold, Hover: leichter Zoom + Gold-Vignette.

8. **Micro-Copy schärfer**
   - Badge: „Live-Demo · Kein Login nötig" → „Live · 10 s · Kein Login".
   - CTA nach Rendering: „In Cast & World speichern" bekommt Pfeil-Icon + Ripple-Hover.

### Nicht enthalten (bleibt wie ist)

- Edge Function `instant-avatar-demo` (Prompt, 5-Winkel-Logik, Rate-Limit) — unverändert.
- Upload-Flow, Style-Optionen, Download-Aktionen (PNG/ZIP) — unverändert.
- Proof-Scene-Assets — vorhandene 3 Bilder werden nur neu arrangiert.

### Technische Notizen

- Neue Keyframes `pulse-slow` (8s) + `sweep-once` (1.2s) in `tailwind.config.ts`.
- Ecken-Marker & HUD als kleine Sub-Components inline in `InstantAvatarDemo.tsx` — keine neuen Files nötig.
- Alle Farben bleiben Design-Tokens (`primary`, `background`, `muted-foreground`) — kein Hardcoding.
- Größenreduktion erfolgt primär über Container + Aspect-Ratio + `max-h`, sodass Layout auf Mobile weiterhin voll stackt.

### Deliverable

Eine einzige, überarbeitete `src/components/landing/InstantAvatarDemo.tsx` + minimaler Tailwind-Config-Zusatz. Ergebnis: **~30 % kleinere Section-Höhe** und ein Look, der sich vom SaaS-Standard klar abhebt (Kamera-Sucher + HUD + Bento-Proof).
