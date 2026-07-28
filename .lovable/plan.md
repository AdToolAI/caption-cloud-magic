## Ziel

1. Der Bereich **„Planen · Optimieren · Skalieren"** (3 Outcome-Cockpits) soll **komplett klickbar** werden – nicht nur der versteckte „Mehr erfahren"-Link.
2. Die **Cast & World Storyline** im `StudioStorylineDialog` bekommt einen visuellen Deep-Dive: eine echte, animierte **Charakter-Erstellungs-Journey** statt statischer Slides.

---

## Teil 1 — Outcome-Cockpits klickbar (MissionFeatures.tsx)

Aktuell öffnet nur der kleine „Mehr erfahren"-Button den `FeatureGuideDialog`, und das auch nur beim Hover sichtbar. Änderungen:

- Die drei Karten (`Plane deinen Monat`, `Optimiere Performance`, `Skaliere Kampagnen`) werden zu vollflächigen `<button>`-Elementen (analog zum `CapabilityBento`-Pattern).
- Die ganze Karte triggert `setSelectedMission(mission.featureId)`.
- Cursor `pointer`, Fokus-Ring, dauerhaft sichtbarer `ArrowUpRight`-Indikator oben rechts (statt Opacity-0-Hover-Link unten).
- Hover-States (Border-Glow, gold-Underline, `-translate-y-1`) bleiben; wirken jetzt auf die ganze Karte.
- Keine Business-Logik-Änderungen — nur Präsentations-Layer.

---

## Teil 2 — Cast & World Storyline: Charakter-Creation-Journey

Momentan sind die 6 Slides für `cast` generische Text-Slides mit UI-Mockup-SVGs (`storylineContent.ts` + `uiVisuals.tsx`). Wir ersetzen die 6 Cast-Slides durch eine **narrative Journey**, die Schritt für Schritt zeigt, wie ein Charakter entsteht — mit echten, dedizierten Visuals.

### Neue 6-Slide-Journey (DE/EN/ES)

| # | Titel | Was passiert im Visual |
|---|-------|------------------------|
| 1 | **Brief** | Textarea-Mockup fließt in Tokens („25, blond, warmes Lächeln, Berlin") — Tokens animieren nach unten in einen Charakter-Slot |
| 2 | **Anchor Portrait** | Drei Provider-Chips (Nano Banana 2 · Seedream 4 · Gemini 3 Pro) rotieren, ein Porträt-Frame morpht in ein final gerendertes Face (Ken-Burns Reveal) |
| 3 | **Identity Lock** | AWS-Rekognition-Landmark-Overlay (Punkte auf Augen/Mund/Nase) mit „Face-ID 98% match"-Badge, Lock-Animation |
| 4 | **Wardrobe / Looks** | Karussell mit 4 Outfit-Cards („Look 01 – Studio", „Look 02 – Street" …), aktive Karte pulsiert in gold |
| 5 | **Voice Binding** | Charakter-Avatar links, Waveform-Bar mittig, Voice-Chip rechts snappen mit Linie zusammen → „Voice locked" |
| 6 | **Scene Cast** | Charakter-Chip wird in eine 3-Karten-Storyboard-Row gezogen; „Ready for Motion Studio"-CTA |

### Dateien

- `src/components/landing/storylines/castJourneyVisuals.tsx` **(neu)** — 6 dedizierte SVG/Motion-Komponenten (`BriefTokens`, `AnchorMorph`, `IdentityLock`, `WardrobeCarousel`, `VoiceBinding`, `SceneCastDrop`), reine SVG + Framer-Motion, keine externen Assets.
- `src/components/landing/storylines/storylineContent.ts` — Cast-Slides (Slot `cast`) auf die 6 neuen Titel/Copies (DE/EN/ES) umstellen und pro Slide `visual: 'castJourney:brief' | 'castJourney:anchor' | …` referenzieren.
- `src/components/landing/StudioStorylineDialog.tsx` — Visual-Renderer erweitern, sodass die neuen `castJourney:*`-Keys auf die entsprechenden Komponenten aus `castJourneyVisuals.tsx` mappen. Bestehende Studios (motion/video/picture/music/voice) unverändert.
- `StudioStorylineDialog`: Autoplay bleibt 4s, aber pro Cast-Slide leicht länger (5.5s) damit die Journey-Animationen sichtbar durchlaufen; Progress-Ring passt sich der Dauer an.

### Optional (nice-to-have, im Scope)

- Kleine „Step X/6"-Timeline unten im Dialog nur für den Cast-Storyline-Modus (visualisiert die Journey-Struktur explizit).

---

## Nicht im Scope

- Keine Änderungen an Backend, Edge Functions, Auth, Pricing.
- Keine neuen Bild-Generierungen — reines SVG/Motion.
- Motion/Video/Picture/Music/Voice-Storylines bleiben wie sie sind (können später gleich aufgewertet werden, falls gewünscht).
