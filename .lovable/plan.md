

# Phase 7: Layout-Fix & Kompositions-Verfeinerung

## Analyse der neuen Screenshots

**Was funktioniert:**
- Stats sauber (80%, 50%, 40% — keine Hex-Codes mehr) ✅
- Keine Emojis mehr ✅
- Scene-Badges sauber farbcodiert (HOOK/PROBLEM/LÖSUNG/FEATURE) ✅
- Character-Rotation funktioniert (presenter/user/expert) ✅
- 30fps läuft ✅

**Was noch nicht stimmt:**

| # | Problem | Ursache | Fix |
|---|---------|---------|-----|
| 1 | **Body-Text wird am unteren Rand abgeschnitten** — Problem, Solution, Feature Szenen | Glass-Panel sitzt bei `bottom: 0` + `paddingBottom: 40`, aber Panel hat kein `maxHeight` und der Container kein `overflow: visible`. Text wird vom Frame-Rand abgeschnitten. | Panel von `bottom: 0` auf `bottom: 60` setzen + `maxHeight: 45%` + `overflow: hidden` auf dem Glass-Panel |
| 2 | **Glass-Panel zu schmal** (75% maxWidth) — Text bricht zu oft um | `maxWidth: '75%'` für non-hook Szenen | Auf `80%` erhöhen |
| 3 | **CTA-Szene: QR-Codes und überblendete Gold-Kreise im Hintergrund** | KI-generiertes Hintergrundbild enthält Artefakte (QR-Codes, Overlays). Template kann das nicht verhindern, aber die CTA-Szene sollte einen stärkeren Overlay haben, damit der Hintergrund weniger dominant ist. | CTA-Overlay von `0.35` auf `0.55` Opacity erhöhen für sauberere Lesbarkeit |
| 4 | **Body-Text ist zu lang** — Edge Function trunciert nicht aggressiv genug | `smartTruncateToSentences` lässt zu viel Text durch (3+ Zeilen) | Edge Function: Limit auf 2 Sätze ODER max 20 Wörter (was kürzer ist) |

## Geplante Änderungen

### 1. TextOverlay: Panel höher + begrenzt (`UniversalCreatorVideo.tsx`)
- Non-hook `positionStyle`: `bottom: 0` → `bottom: 60px`
- Glass-Panel: `maxWidth: 75%` → `80%` für problem/solution/feature/proof/default
- Hinzufügen: `maxHeight: '42%'` und `overflow: 'hidden'` auf dem Glass-Panel

### 2. CTA-Overlay stärker (`UniversalCreatorVideo.tsx`)
- Hook/CTA Glass-Background: `rgba(0,0,0,0.35)` → `rgba(0,0,0,0.55)` für bessere Lesbarkeit über Artefakt-reichen Hintergründen

### 3. Body-Text Kürzung (`auto-generate-universal-video/index.ts`)
- `smartTruncateToSentences` Limit verschärfen: max 20 Wörter oder 2 Sätze

### 4. Bundle-Canary
`UCV_BUNDLE_CANARY` → `2026-03-18-r57-phase7-layout-fix`

## Dateien

| Datei | Änderung |
|-------|----------|
| `UniversalCreatorVideo.tsx` | Panel-Position, maxWidth, CTA-Overlay |
| `auto-generate-universal-video/index.ts` | Aggressivere Text-Kürzung |

S3-Bundle-Redeploy erforderlich für Template-Änderungen.

