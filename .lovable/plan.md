

## Findings: Landing/Marketing-Page ist bereits größtenteils sauber

Nach gründlicher Suche durch alle Landing-Komponenten und Marketing-Surfaces:

### Was öffentlich (unauthentifiziert sichtbar) ist
- **Landing-Page** (`/` → `BlackTieHero`, `MissionFeatures`, `FeatureGrid`, `PricingSection`, `BlackTieFooter`, `FAQ`): **0 Sora-Erwähnungen** ✅
- **Pricing-Page** (`/pricing`): **0 Sora-Erwähnungen** ✅
- **SEO-Meta-Tags** auf `Index.tsx`: **0 Sora-Erwähnungen** ✅
- **`index.html`**: **0 Sora-Erwähnungen** ✅

### Wo Sora noch erscheint (nur intern, hinter Login)
1. **`featureGuide.descriptions.soraLongForm`** (Zeilen 1773 / 6109 / 10397) — Tooltip im internen Feature-Guide-Dialog
2. **In-App Toasts/Dialoge** (videoStillGenerating, toastBackgroundGeneration, minimizeMsg) — nur sichtbar während Video-Generierung
3. **`soraLf.*` Namespace** — die komplette interne UI für `/sora2-longform` (durch das Coming-Soon-Gate für neue User abgeschirmt)
4. **`sora2Gate.*` Namespace** — explizit für das Coming-Soon-Modal (gewollt)

## Was wir konkret bereinigen sollten

### 1. Internal Feature-Guide-Texte entschärfen
Die `featureGuide.descriptions.soraLongForm`-Texte sehen ungrandfathered User potenziell, wenn sie das Feature in der Hub-Übersicht antippen. Umformulierung:
- **EN:** „Generate long-form cinematic video content" (statt „with Sora 2")
- **DE:** „Generiere Long-Form Cinematic Videocontent"
- **ES:** „Genera contenido de video largo y cinematográfico"

### 2. Generic Toast-Texte (3 Sprachen × 3 Strings = 9 Stellen)
Diese erscheinen während laufender Generierung — auch bei Kling/Wan/Hailuo-Renders sieht der User aktuell „You'll find it under **Sora AI Videos**". Ändern zu:
- **EN:** „You'll find it under **AI Videos**" / „Generation continues in the background. You'll find the finished video under **AI Videos**."
- **DE:** „Du findest es unter **KI-Videos**"
- **ES:** „Lo encontrarás en **Videos de IA**"

Das ist neutraler und korrekter (gilt für alle Modelle).

### 3. Was wir NICHT anfassen
- `soraLf.*` Namespace (interne Studio-UI — nur Grandfathered-User sehen das Studio überhaupt)
- `sora2Gate.*` Namespace (gewollt, erklärt explizit den Coming-Soon-Status)
- `soraVideoStudio` interne UI (durch Gate geschützt)

## Optional: Marketing-Story aktiv stärken (Bonus)

Falls du möchtest, ergänzen wir parallel auf der **Landing-Page** in `MissionFeatures` oder `FeatureGrid` einen neuen USP-Block:

> **„6 lizensierte Premium-KI-Modelle"**  
> Kling 3 Omni · Wan 2.5 · Luma Ray 2 · Hailuo 2.3 · Seedance 2 · Veo

Damit bauen wir aktiv die neue Erzählung auf, die Sora 2 ersetzt.

## Geplante Änderungen

| Datei | Änderung |
|---|---|
| `src/lib/translations.ts` | 3× `soraLongForm` Description (EN/DE/ES) — „Sora 2" entfernt |
| `src/lib/translations.ts` | 9× generische Toast-Strings — „Sora AI Videos" → „AI Videos" / „KI-Videos" / „Videos de IA" |
| **Optional:** `src/components/landing/MissionFeatures.tsx` oder `FeatureGrid.tsx` | Neuer „6 lizensierte Modelle"-USP-Block |
| **Optional:** `src/lib/translations.ts` | Neue Keys für USP-Block (DE/EN/ES) |

## Aufwand
- **Pflicht-Cleanup:** ~10 Min
- **Mit optionalem USP-Block:** ~25 Min

## Frage an dich

Zwei Entscheidungen, dann lege ich los:

1. **Nur Cleanup** (Pflicht-Punkte 1+2) **oder Cleanup + USP-Block** auf der Landing-Page?
2. Falls USP-Block: in **`MissionFeatures`** (passt thematisch — "Why this tool wins") oder **`FeatureGrid`** (visueller Showcase)?

