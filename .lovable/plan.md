# Cast & World Storyline — Character-Showcase im Videospiel-Stil

## Problem
Die Storyline funktioniert erzählerisch, aber die Visuals sind zu abstrakt: Schritt 04 (Wardrobe) zeigt nur farbige Flächen mit „Studio · Street · Executive · Editorial"-Labels — man sieht keinen Charakter, keinen Look. Der Nutzer möchte mindestens einen Slide im Stil eines Videospiel-Character-Selection-Screens (Charakter mit sichtbarem Outfit).

## Lösung

### 1. Neuer Hero-Slide: „Character Sheet" (Videospiel-Stil)
Ersetze den Wardrobe-Slide (Schritt 04) durch einen echten Character-Sheet-Visual — kein abstraktes SVG, sondern echtes generiertes Bildmaterial.

**Visual-Konzept** (Character-Selection-Screen):
- Zentral: ein Charakter (Halbporträt, gold-schwarzes Bond-Aesthetic) mit sichtbarem Outfit
- Vier Outfit-Slots als Thumbnails unten (Studio / Street / Executive / Editorial) — jeweils **derselbe Charakter** in unterschiedlicher Kleidung, aktiver Slot mit Gold-Glow
- HUD-Overlays: Identity-Match-Score (98%), Landmark-Punkte, Wardrobe-Preset-Name
- Grid-Linien, Gold-Corner-Brackets, „SELECT LOOK"-Chrome

**Umsetzung**: 5 generierte Bilder (`imagegen premium`, 1920×1080, Bond-Aesthetic):
- `cast-character-sheet-hero.jpg` — Character-Selection-Screen mit 4 Outfit-Thumbnails
- `cast-look-studio.jpg`, `cast-look-street.jpg`, `cast-look-executive.jpg`, `cast-look-editorial.jpg` — 4 Outfit-Varianten desselben Charakters (Kacheln)

Der Slide bekommt `kind: "cinematic"` (statt `"ui"`) mit dem Hero-Bild + zusätzlichem SVG-Overlay (Corner-Brackets, HUD-Chrome, aktiver Look-Indicator, Match-Score-Pill) für Interaktivitäts-Feel.

### 2. Zusätzlicher neuer Slide: „Character Loadout" (Schritt 07)
Neuer 7. Slide direkt vor Scene Cast — zeigt den Charakter im vollen „Loadout"-View wie in einem RPG:
- Charakter zentral
- Slot-Panels links/rechts (Face-Lock · Voice · Wardrobe · Prompt-Tokens · Scene-Ready)
- Stat-Bars: Identity-Match, Voice-Match, Wardrobe-Presets, Scene-Count
- Gold-Chrome, Bond-Glass

Komponente: neuer `CharacterLoadoutVisual` in `castJourneyVisuals.tsx` — SVG-Layer über Charakterbild.

### 3. Andere Cast-Slides visuell verdichten
Kleine, gezielte Upgrades (keine kompletten Neubauten):
- `AnchorMorphVisual` (Schritt 02): drei Anker-Portrait-Thumbnails mit echten generierten Face-Bildern statt reinem SVG-Kreis-Morph.
- `IdentityLockVisual` (Schritt 03): Charakter-Portrait im Hintergrund mit Landmark-Punkten drüber statt abstrakter Landmarks.
- `SceneCastDropVisual` (Schritt 06): echte Storyboard-Thumbnails + Drag-Ghost mit Charakterbild.

Dafür 2 zusätzliche Bilder:
- `cast-anchor-portrait.jpg` — Nahaufnahme Anker-Portrait
- `cast-storyboard-tile.jpg` — Storyboard-Szenen-Kachel

Gesamt: **7 neue Bilder** in `src/assets/landing/storylines/cast/`.

## Technische Details

**Neue/geänderte Dateien:**
- `src/assets/landing/storylines/cast/` (neu) — 7 generierte Cast-Assets
- `src/components/landing/storylines/castJourneyVisuals.tsx` — neue `CharacterSheetVisual` + `CharacterLoadoutVisual`, Upgrade von `AnchorMorphVisual` / `IdentityLockVisual` / `SceneCastDropVisual` mit `<image>`-Layern
- `src/components/landing/storylines/storylineContent.ts` — Wardrobe-Slide → CharacterSheet, +1 neuer Loadout-Slide (7 statt 6 Slides), DE/EN/ES-Copy angepasst

**Design-Prinzipien:**
- Bond-Aesthetic: `#050816` Background, `#F5C76A` Gold-Akzente, Playfair-Chrome
- Bilder als Layer, SVG-Chrome/HUD drüber → wirkt wie interaktives Game-UI, nicht wie Marketing-Stock
- Charakter bleibt derselbe (fiktive Frau „Anna", Mitte 30, professionell) — verstärkt die „One cast, many looks"-Story visuell
- Keine echten Personen, keine IP — reine KI-Generierung mit generischer Beschreibung
