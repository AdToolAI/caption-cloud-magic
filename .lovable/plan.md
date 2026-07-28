# Plan v287 — Outcome-Storylines & Proof-Strip Interaktion

Zwei Baustellen im Abschnitt „Planen · Optimieren · Skalieren" auf `/` (Datei: `src/components/landing/MissionFeatures.tsx`):

1. „Mehr erfahren" der 3 Cockpit-Karten öffnet aktuell den generischen `FeatureGuideDialog` (Timeline-Look). Der User will hier denselben Bond-Storyline-Effekt wie bei den Studio-Kacheln (`StudioStorylineDialog`) — animierte SVG-UI-Slides, 4-6 Sekunden Autoplay, Dots/Arrows, CTA.
2. Die 4 Chips darunter (Multi-Provider Stack, Cinematic Lip-Sync, Cast & World Lock, Beta-Preisgarantie) sind pure `<div>`s ohne Interaktion. „Cast & World Lock" sollte die Cast-Storyline öffnen, die anderen drei jeweils passende Storylines/Ziele.

## Umsetzung

### A) Outcome-Storylines (Plan · Optimize · Scale)

- Neue Datei `src/components/landing/storylines/outcomeContent.ts`
  - Typ `OutcomeKey = "planMonth" | "optimizePerformance" | "scaleCampaigns"`
  - Je 5 Slides in DE/EN/ES, gleiches `StorylineSlide`-Schema wie `storylineContent.ts` (title, body, caption, visual, durationMs).
- Neue Datei `src/components/landing/storylines/outcomeVisuals.tsx` — 15 animierte SVG-Komponenten im Bond-Gold-Stil:
  - Plan: `HeatmapBuild`, `SlotAutoPick`, `ChannelMatrix`, `RecurrenceLoop`, `MonthLocked`
  - Optimize: `SignalStream`, `CtrDeltaBar`, `WatchtimeCurve`, `ABDuel`, `InsightCards`
  - Scale: `ChannelRingsFill`, `AutoPublishRail`, `CloneMultiplier`, `QueueRocket`, `GlobalReachMap`
- Neue Datei `src/components/landing/OutcomeStorylineDialog.tsx`
  - Kopiert die UX von `StudioStorylineDialog.tsx` (Glass, Playfair, Fortschritts-Dots, Pause/Play, „Studio öffnen"-CTA), nutzt aber `OUTCOMES` statt `STORYLINES` und einen dynamischen CTA (`href` + Label pro Outcome, z. B. Planer, Analytics, Publish-Queue).
- `MissionFeatures.tsx`
  - `FeatureGuideDialog` entfernen.
  - State `selectedOutcome: OutcomeKey | null`.
  - Cockpit-Buttons öffnen `OutcomeStorylineDialog` statt Guide.

### B) Proof-Strip klickbar mit Storylines

- `storylineContent.ts` um zwei neue Studio-Keys erweitern: `multiProvider` und `priceGuarantee` (je 6 Slides DE/EN/ES).
- `src/components/landing/storylines/proofVisuals.tsx` — 12 animierte SVG-Mockups:
  - Multi-Provider: `ProviderConstellation`, `RouteBestPick`, `FallbackChain`, `CostGuardMeter`, `LatencyDuel`, `UnifiedOutput`
  - Preisgarantie: `FoundersSeatCounter`, `PriceLock24m`, `DiscountShield`, `TimelineGuarantee`, `SeatMap1000`, `SavingsCurve`
- Proof-Strip in `MissionFeatures.tsx` von `<div>` auf `<button>` umbauen (gleicher Bond-Gold-Hover), Zuordnung:
  - Multi-Provider Stack → `StudioStorylineDialog` (studio="multiProvider", CTA → `/pricing` bzw. Arsenal-Section)
  - Cinematic Lip-Sync → `StudioStorylineDialog` (studio="motion", CTA → `/motion-studio`)
  - Cast & World Lock → `StudioStorylineDialog` (studio="cast", CTA → `/cast-and-world`)
  - Beta-Preisgarantie → `StudioStorylineDialog` (studio="priceGuarantee", CTA → öffnet `FoundersBenefitsDialog` oder scrollt zu `#pricing`)

### C) i18n

- Keys `landing.mission.outcomeStory.*` (15 Slides × 3 Sprachen) in `useTranslation`-Quelle ergänzen.
- Keys `landing.storyline.multiProvider.*` und `landing.storyline.priceGuarantee.*` (je 6 Slides × 3 Sprachen).

## Technische Details

- Keine neuen Dependencies.
- Wiederverwendung des bestehenden `StorylineSlide`-Schemas → Autoplay/Pause/Dots-Logik unverändert.
- `OutcomeStorylineDialog` ist eine schlanke Kopie von `StudioStorylineDialog` mit separatem Content-Map, damit die bestehende Studio-Slideshow (CapabilityBento) unangetastet bleibt.
- Kein Backend-, DB- oder Edge-Function-Change.
- Bilder rein SVG/CSS-animiert (kein `imagegen` nötig, konsistent mit `castJourneyVisuals.tsx`).

## Nicht im Scope

- Änderungen am AI-Arsenal, CommandDeck, CapabilityBento.
- Neue Landingpage-Sektionen.
- Änderungen an `FeatureGuideDialog` (bleibt für andere Aufrufer erhalten).
