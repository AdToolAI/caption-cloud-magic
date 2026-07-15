
# AI Arsenal Redesign — "Cinema-Reel" + Katalog-Sync

Der `AIArsenalShowcase` auf der öffentlichen Startseite bekommt eine cinematische Aufwertung mit per-Genre Auto-Slide-Signaturen — und wird gleichzeitig auf den aktuellen Modell-Stand (Stand 15.07.2026) synchronisiert. Aktuell zeigt die Section 20 hartcodierte Modelle; die echte Plattform betreibt inzwischen deutlich mehr.

## Katalog-Sync (neu)

Single Source of Truth: `src/config/aiVideoModelRegistry.ts` (Video) + `videoPricingCatalog.ts`, plus Music-Studio-Engines und Voice-Studio.

### Neu aufzunehmen (aktueller Stand)

**Video** (aktuell 20 Modelle in Registry, Showcase zeigt nur 11):
- Kling 2.5 Turbo, Kling 2.6, Kling 3, **Kling Omni** (Native Lip-Sync)
- Veo 3.1 Lite / Fast / **Pro**
- Grok Imagine
- LTX Standard / Pro
- Wan 2.6 Standard / Pro, Wan Standard
- Hailuo Standard / Pro
- Luma Standard / Pro
- **Seedance 2.0 Mini**, Seedance Standard, Seedance Pro
- Runway Gen-4 Aleph
- Pika 2.2 / Pika 2.2 Pro
- Vidu Q2 Reference / I2V / T2V
- HappyHorse Standard / Pro
- **OpenAI Sora 2** (bereits im Screenshot als "Featured" sichtbar)

**Bild**: Nano Banana (Gemini 2.5 Flash Image), Flux Fill, Clarity Upscale 4×, Style Reference — plus jetzt **Gemini 3 Pro Image**, **Gemini 3.1 Flash Image**.

**Audio (Music Studio)**: MiniMax 1.5, Stable Audio 2.5, Google Lyria 3 Pro, ElevenLabs Music v2.

**Audio (Voice)**: ElevenLabs TTS, **Voice Studio Custom-Clones** (neu — eigenes Feature).

**Avatar**: Kling Omni (Native Lip-Sync), Brand-Character-Lock, Cast & World.

Der Showcase liest die Liste aus einem **neuen leichten Adapter** `src/components/landing/ai-arsenal/arsenalCatalog.ts`, der die relevanten Felder (id, name, category, tagline-key, capabilities, hero/recommended, cover) aus den echten Registries mappt — damit ein neues Modell künftig automatisch auftaucht, sobald es im Registry landet.

## Cinema-Reel Redesign

1. **Hero-Stage** (2/3 Breite, links) — zeigt immer ein Modell des aktiven Genres als Kino-Kachel. Auto-Advance alle ~4 s, pausiert bei Hover und `prefers-reduced-motion`, pausiert wenn Section nicht im Viewport (IntersectionObserver).
2. **Model-Rail** (1/3 Breite, rechts) — die restlichen Modelle als vertikale Mini-Cards. Aktives Modell leuchtet auf, goldene Verbindungslinie zum Hero.
3. **Signature-Transitions pro Genre** — der "abnormal kreative" Kern:
   - **Video** → *Filmstreifen-Wipe*: alter Frame wird als Filmnegativ mit Perforationslöchern nach oben durchgezogen, Lichtblitz beim Übergang.
   - **Bild** → *Diffusion-Reveal*: neues Bild "denoised" aus SVG-`feTurbulence`-Rauschen (baseFrequency 0.9 → 0).
   - **Audio** → *Waveform-Morph*: Cover als Waveform-Bars zerlegt, alte Bars kollabieren, neue "singen" gestaffelt hoch.
   - **Avatar** → *Face-Swap-Grid*: 8×8-Kachel-Flip in 3D um Y-Achse, staggered pro Kachel.
   - **Alle** → rotiert durch alle vier Signaturen (jeder Wechsel ein anderer Move).
4. **Reel-Timer** unter der Hero-Stage: dünne goldene Progress-Line + klickbare Punkte pro Modell.
5. **Ambient**: 3 % Filmkorn-Overlay, zwei diagonale goldene Volumetric-Light-Streifen, subtile CRT-Scanline im Video-Modus.

## Layout

```text
┌──────────────────────────────────────────────┬─────────────────┐
│         HERO-STAGE (Auto-Slide)              │  ▸ Kling Omni ● │
│         + Signature-Transition               │  ▸ Sora 2       │
│         + Cover, Titel, Tagline, Caps        │  ▸ Veo 3.1 Pro  │
│                                              │  ▸ Wan 2.6 Pro  │
│                                              │  ▸ Seedance 2.0 │
│                                              │  ▸ …            │
│  ●━━━━━━━●━━━━━━━●━━━━━━━●  (Reel-Timer)     │                 │
└──────────────────────────────────────────────┴─────────────────┘
```

Beim Wechsel Video → Bild etc. läuft der komplette Stage-Übergang mit der Signature-Transition des **Ziel-Genres**.

## Was bleibt

- James-Bond-2028-Palette (Deep Black / Gold `#F5C76A` / Cyan), Fonts (Playfair Display + Inter).
- i18n-Keys `landing.aiArsenal.*` — neue Modelle bekommen neue `models.<key>.name/tagline`-Einträge in DE/EN/ES.
- Category-Filter-Pills und Counter-Strip (nur visuell aufgefrischt, Counts kommen aus dem Adapter).

## Technische Umsetzung

**Neue Dateien**
- `src/components/landing/ai-arsenal/arsenalCatalog.ts` — mapt Registries → Showcase-Daten.
- `src/components/landing/ai-arsenal/ArsenalHeroStage.tsx`
- `src/components/landing/ai-arsenal/ArsenalModelRail.tsx`
- `src/components/landing/ai-arsenal/useAutoAdvance.ts` (Timer + reduced-motion + IntersectionObserver + Pause-on-Hover)
- `src/components/landing/ai-arsenal/transitions/FilmstripWipe.tsx`
- `src/components/landing/ai-arsenal/transitions/DiffusionReveal.tsx` (SVG `feTurbulence` animiert)
- `src/components/landing/ai-arsenal/transitions/WaveformMorph.tsx`
- `src/components/landing/ai-arsenal/transitions/FaceSwapGrid.tsx` (CSS 3D flips)

**Angepasst**
- `src/components/landing/AIArsenalShowcase.tsx` — Bento-Grid entfernt, Hero-Stage + Rail eingesetzt.
- `src/locales/{de,en,es}/landing.json` (bzw. äquivalenter i18n-Store) — neue Modell-Einträge.
- `src/assets/landing/ai-arsenal/` — 3–4 neue Cover für Sora 2, Kling Omni, Seedance 2.0, Veo 3.1 Pro (falls nicht vorhanden).

**Motion**: framer-motion (schon im Projekt), keine neuen Dependencies. Transitions ausschließlich auf `transform`/`opacity` bzw. SVG-Filter → GPU-freundlich.

**A11y**
- `prefers-reduced-motion` → Auto-Advance aus, harter Cross-Fade statt Signature-Transition.
- Rail-Einträge sind `<button>` mit ARIA-Labels.
- Hero-Stage `aria-live="polite"` mit aktuellem Modellnamen.

**Scope**
- Frontend/Presentation only. Keine Backend-, DB- oder Pricing-Änderungen.
- Section bleibt öffentlich unter `/`, testbar ohne Login.
