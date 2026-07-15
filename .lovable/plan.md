
# Music Studio — Visual Upgrade zur „Mastering Suite"

Aktuell wirkt das Studio wie ein Formular mit Karten. Wir heben es auf ein Level, das sich anfühlt wie ein echtes Producer-Tool (Ableton / Logic / Splice) — dunkel, taktil, mit Waveform-Energie und James-Bond-2028-Gold-Akzenten.

## Ziel-Aesthetik

- **Sensory Metaphor**: Studio-Konsole bei Nacht — Glas, gebürstetes Metall, glühende VU-Meter.
- **Energy**: Fokussiert und premium, nicht verspielt-neon. Gold pulsiert nur, wenn etwas passiert.
- **Not this**: Keine generischen Cards mit Emoji-Icons, keine flachen Gradients.

## Konkrete Moves

### 1. Hero-Zone: „Now Playing"-Konsole statt Titel-Block
- Großer Bond-Titel bleibt, aber **darunter** ein liegendes Waveform-Panel (SVG animiert, Idle = sanft atmend, Playing = reactive) über die volle Breite.
- Wallet + „Neues Projekt" wandern in eine schmale Statusleiste rechts oben mit Live-Dot.

### 2. Engine-Selector: Fader-Rack statt Card-Grid
- Aktuell 5 Karten in Grid → neu: **horizontales Rack** mit vertikalen „Kanalzügen" pro Engine.
- Jeder Kanalzug: Icon, Name, kleiner Preis-LED, animierter Level-Meter-Bar (rein dekorativ, aber alive).
- Aktiver Kanal: Gold-Glow-Rand + Pulsierender Meter.
- Auf Mobile: horizontal scrollbar mit Snap.

### 3. Prompt + Lyrics: Glass-Panels mit Corner-Details
- Prompt-Textarea bekommt geätzte Ecken-Markierungen (wie Kamera-Sucher), Focus = Gold-Corner-Animation.
- Lyrics-Editor: monospace bleibt, aber mit Zeilen-Nummern-Gutter und farbcodierten `[Verse]`-Tags (nicht mehr Pill-Buttons oben, sondern klickbare Inline-Marker die im Text erscheinen).

### 4. Right Rail: „Master-Bus"-Panel
- Aktuelle rechte Karte (Engine-Info + Kosten + Button) wird zum **fixierten Master-Bus** mit:
  - Engine-Portrait oben (großes Icon + Name in Playfair)
  - Cost-Display als LCD-Style-Ziffer (gold, mono, mit „$" prefix in dünner)
  - „Track generieren"-Button als physischer Knopf (Depth, Bevel, Press-Animation)
  - Darunter: kleine „Session Info" (BPM, Key, Duration-Cap) als Meta-Reihe.

### 5. Micro-Details überall
- **Typography**: Playfair Display für alle Section-Header (statt sans), Inter für Body, JetBrains Mono für Zahlen/Preise/Tags.
- **Farb-Rhythmus**: 90% Deep-Black-Ebenen (`#050816`/`#0a0f1e`/`#0f1628`), Gold `#F5C76A` nur für aktive Zustände, Cyan-Akzent nur für „Live/Recording"-Signale.
- **Animation**: Framer-Motion Waveform (siehe Hero), Number-Ticker beim Cost-Update, Ripple-Feedback beim Engine-Wechsel.
- **Texturen**: Sehr subtiles Grain-Overlay (SVG noise 3% opacity) über den Studio-Hintergrund für Film-Feel.

### 6. „Meine Tracks" / Stock / Beat-Sync / Lizenziert Tabs
- Statt normaler Tabs → **Segmented Control als Konsolen-Reiter** mit dünner Gold-Unterlinie beim aktiven Reiter und leichtem Slide-Übergang.

## Technische Umsetzung

- Betroffene Dateien (nur Frontend/Presentation):
  - `src/pages/MusicStudio.tsx` (Hero + Layout-Grid)
  - `src/components/music-studio/ProviderSelector.tsx` (→ Fader-Rack)
  - `src/components/music-studio/PromptEditor` / `LyricsEditor` (Glass-Panels)
  - `src/components/music-studio/EngineSummaryPanel` (→ Master-Bus)
  - Neue Komponente: `src/components/music-studio/StudioWaveform.tsx` (dekorativ, framer-motion + SVG)
  - Neue Komponente: `src/components/music-studio/ChannelStrip.tsx`
- Design-Tokens: nur bestehende `--primary`/`--background`/`--card` verwenden, keine hardcoded Farben.
- Motion: framer-motion (bereits im Projekt).
- Keine Business-Logik-Änderungen — alle Props, Handler, Preise, Engine-Katalog bleiben identisch.

## Was NICHT geändert wird

- Engine-Katalog, Pricing, Generation-Logik, Custom-Voices-Wiring, Replicate-Anbindung, i18n.

---

Soll ich das so bauen, oder willst du vorher 2–3 **gerenderte Design-Richtungen als Klick-Prototypen** sehen, aus denen du eine aussuchst? (empfohlen für so einen Look-Level-Up)
