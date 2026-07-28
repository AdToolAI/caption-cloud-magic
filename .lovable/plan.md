## Ziel

Die Sektion „Why this tool wins the game" transformieren von 3 generischen Karten (Plan/Optimize/Scale) in ein **„Mission Command Deck"** — eine erlebbare Landkarte der gesamten Plattform-Power. Der Besucher soll in 20 Sekunden begreifen: *Das ist keine App. Das ist ein komplettes Media-Studio.*

## Warum die aktuelle Fassung nicht reicht

Plan/Optimize/Scale ist Standard-SaaS-Rhetorik. Sie versteckt die eigentlichen Waffen:
- Persistente Charaktere (Cast & World)
- 4-Sprecher Cinematic Lip-Sync in einer Einstellung
- 32 KI-Modelle in einem Workflow (Nano Banana 2, Seedream 4, Gemini 3 Pro, Kling Omni, Hailuo, Sora, Suno v5, Udio v2, ElevenLabs Music v2, Stable Audio, Sync.so, AWS Rekognition)
- Voice Cloning + Voice-Zuordnung zu Charakteren
- Music Studio mit 4 Engines
- Multi-Kanal Auto-Publish
- Beta-Preisgarantie

Diese Story muss die Sektion tragen.

## Struktur: „Mission Command Deck"

Neue Section-Architektur, drei Ebenen:

```text
┌─────────────────────────────────────────────────────────────┐
│  ● WARUM ADTOOL                                             │
│  Why this tool wins the game (Playfair, Gold-Split)         │
│  Sub: "Nicht ein Tool. Ein komplettes Studio."              │
└─────────────────────────────────────────────────────────────┘

╔══ EBENE 1 — HERO-COCKPIT (volle Breite) ══════════════════╗
║  Live "Production Pipeline" Visualisierung:                ║
║  Briefing → Cast → Script → Anchor → Motion → Music →      ║
║  Publish. Gold-Linie animiert von links nach rechts,       ║
║  jede Station mit pulsierendem Node + Mini-Icon.           ║
║  Rechts: rotierende Kennzahl-Ticker (32 Modelle, 4         ║
║  Sprecher, 3 Sprachen, ∞ Charaktere) — als "Capabilities", ║
║  nicht als erfundene Nutzerzahlen.                         ║
╚═══════════════════════════════════════════════════════════╝

╔══ EBENE 2 — 6 CAPABILITY-KACHELN (Bento 3×2) ═════════════╗
║ ┌──────────────┬──────────────┬──────────────┐            ║
║ │ Cast & World │ Motion       │ AI Video     │            ║
║ │ (Character   │ Studio       │ Studio       │            ║
║ │  Lock Demo)  │ (4-Speaker   │ (Multi-      │            ║
║ │              │  Lip-Sync)   │  Provider)   │            ║
║ ├──────────────┼──────────────┼──────────────┤            ║
║ │ Picture      │ Music        │ Voice        │            ║
║ │ Studio       │ Studio       │ Studio       │            ║
║ │ (Nano Banana │ (4 Engines)  │ (Klonen +    │            ║
║ │  2 / Seedream│              │  Cast-Link)  │            ║
║ └──────────────┴──────────────┴──────────────┘            ║
╚═══════════════════════════════════════════════════════════╝

╔══ EBENE 3 — 3 WORKFLOW-COCKPITS (bestehend, überarbeitet)═╗
║  Plan · Optimize · Scale (die aktuellen Cockpits bleiben, ║
║  werden aber als "Outcome-Ebene" positioniert, nicht als  ║
║  Kernnutzen)                                              ║
╚═══════════════════════════════════════════════════════════╝

╔══ EBENE 4 — PROOF-STRIP (bestehend, gekürzt) ═════════════╗
║  Multi-Provider · Cinematic Lip-Sync · Cast Lock · Preis  ║
╚═══════════════════════════════════════════════════════════╝
```

## Die 6 neuen Capability-Kacheln (Ebene 2)

Jede Kachel: Bond-Glass, Playfair-Titel, ein Live-Visual, ein Satz Nutzen, Chip mit den beteiligten Modellen. **Keine erfundenen Zahlen.**

1. **Cast & World — „Ein Cast. Unendlich Szenen."**
   Visual: 3 Portrait-Chips in Gold-Ring, verbunden mit Linien zu 4 Miniatur-Szenen. Chip: "Nano Banana 2 · Seedream 4 · Gemini 3 Pro".

2. **Motion Studio — „Vier Sprecher. Eine Einstellung."**
   Visual: 4 animierte Mund-Wellenformen, synchron pulsierend über einer Timeline-Leiste. Chip: "Kling Omni · Hailuo · Sync.so · AWS Rekognition".

3. **AI Video Studio — „Alle Engines. Ein Prompt."**
   Visual: rotierendes Karussell mit Logo-Chips (Sora, Kling, Hailuo, Veo, Runway…) die in ein zentrales Play-Icon zusammenlaufen. Chip: "32 Modelle · 1 Interface".

4. **Picture Studio — „Vom Briefing zum Frame."**
   Visual: Vier Style-Frames in Bento (Editorial, Cinematic, Portrait, Product), Gold-Rahmen wandert. Chip: "Nano Banana 2 · Seedream 4 · Flux Ultra".

5. **Music Studio — „Score auf Knopfdruck."**
   Visual: animierte Gold-Waveform mit 4 Engine-Chips darunter, die aufleuchten. Chip: "Suno v5 · Udio v2 · ElevenLabs Music v2 · Stable Audio 2".

6. **Voice Studio — „Deine Stimme. Dein Cast."**
   Visual: Mikro-Icon → Waveform → 3 Character-Portraits (Voice-Link). Chip: "ElevenLabs · Cast-Binding".

Alle Kacheln:
- Hover: 3D-Tilt (bestehendes Muster aus `MissionFeatures.tsx`)
- Gold-Glow im Hover, „BETA VORSCHAU"-Chip unten
- Click → öffnet `FeatureGuideDialog` (bereits im Bond-Look v285) mit passendem Content pro Capability

## Umsetzung (technisch)

**Neue Dateien:**
- `src/components/landing/CommandDeck.tsx` — Hero-Cockpit (Ebene 1) mit animierter Pipeline-SVG + Capability-Ticker
- `src/components/landing/CapabilityBento.tsx` — 6-Kachel Bento-Grid (Ebene 2)
- `src/components/landing/cockpits/CastLockVisual.tsx`
- `src/components/landing/cockpits/LipSyncWaveVisual.tsx`
- `src/components/landing/cockpits/EngineOrbitVisual.tsx`
- `src/components/landing/cockpits/StyleFramesVisual.tsx`
- `src/components/landing/cockpits/MusicWaveVisual.tsx`
- `src/components/landing/cockpits/VoiceLinkVisual.tsx`

**Angepasste Dateien:**
- `src/components/landing/MissionFeatures.tsx` — Section-Wrapper reorganisieren: Hero-Cockpit → Bento → bestehende 3 Cockpits → Proof-Strip. Sub-Headline anpassen.
- `src/lib/translations.ts` — neue Keys für 6 Kacheln, Hero-Cockpit-Labels, Pipeline-Stationen (DE/EN/ES)
- `src/lib/featureGuideContent.ts` (falls existierend, sonst neu) — Guide-Content für die 6 neuen Capabilities

**Design-Tokens:** Nur `bg-card`, `text-foreground`, `text-primary` (Gold), `border-primary/20`, `shadow-[0_0_...]` mit `hsl(var(--primary)/...)`. Keine Hex-Codes in Komponenten. Playfair (`font-display`) für Titel, Inter für Body. Keine erfundenen Nutzerzahlen — nur nachweisbare Capabilities.

**Motion:** Bestehende `motion/react` Muster aus `MissionFeatures.tsx` wiederverwenden (whileHover-Tilt, animierte SVG-Pfade via `strokeDasharray`).

**Ehrlichkeit / Beta-Rahmen:** Jede Kachel trägt „BETA VORSCHAU". Der Ticker im Hero zeigt Capabilities (32 Modelle, 3 Sprachen), keine Nutzer/Umsatz-Zahlen.

## Ergebnis für den Nutzer

Statt „Plan / Optimize / Scale" sieht der Besucher:
1. **Was passiert unter der Haube** (Pipeline-Cockpit)
2. **Welche 6 Studios ihm gehören** (Bento)
3. **Welche Outcomes er erreicht** (bestehende Cockpits)
4. **Warum er es glauben kann** (Proof-Strip)

Kein Wort zu viel, jede Kachel ein sichtbares Versprechen, alles im Bond-Gold-Look.