

## Befund
Der User hat recht — im AI Video Studio Hub (`/ai-video-studio`) sind die offiziellen, beworbenen Preise pro Modell:

| Modell | Beworbener Preis |
|---|---|
| Sora 2 | €0.25–0.53/s |
| Kling 3.0 | €0.10–0.21/s |
| Seedance 2.0 | €0.10–0.21/s |
| Wan 2.5 | €0.10–0.15/s |
| **Hailuo 2.3** | **€0.15–0.20/s** |
| Luma Ray 2 | €0.18–0.25/s |

Im Motion Studio (`BriefingTab.tsx`) sind dagegen die `CLIP_SOURCE_COSTS` viel zu hoch:
- `ai-hailuo`: **1.20 €/s** (statt €0.15–0.20)
- `ai-kling`: **1.50 €/s** (statt €0.10–0.21)
- `ai-sora`: **2.00 €/s** (statt €0.25–0.53)

→ Das sind ~6–10× zu hohe Werte. Daher €36 für 30s Hailuo statt korrekt **€4.50–€6.00**.

## Untersuchung nötig
- `src/types/video-composer.ts` lesen (wo `CLIP_SOURCE_COSTS` definiert ist)
- AI Video Studio Hub-Seite lesen, um Preise als Single Source of Truth zu identifizieren
- `BriefingTab.tsx`, `ClipsTab.tsx`, `StoryboardTab.tsx`, `SceneCard.tsx`, `AssemblyTab.tsx`, `VideoComposerDashboard.tsx` für Anzeige

## Plan — Preise an offizielle AI Video Studio Tarife angleichen

### 1. `CLIP_SOURCE_COSTS` korrigieren (`src/types/video-composer.ts`)
Wir nehmen die **obere Grenze** (worst case, ehrlich) der offiziellen Preise als Default:

| Quelle | Alt | Neu |
|---|---|---|
| `ai-hailuo` | 1.20 €/s | **0.20 €/s** |
| `ai-kling` | 1.50 €/s | **0.21 €/s** |
| `ai-sora` | 2.00 €/s | **0.53 €/s** |
| `stock` | 0 | 0 |
| `upload` | 0 | 0 |

→ 30s Hailuo = **€6.00** (statt €36). 30s Kling = €6.30. 30s Sora = €15.90.

### 2. EUR-Anzeige beibehalten (kein Wechsel auf Credits)
Der User hat im AI Video Studio Hub bewusst EUR-Pricing etabliert. Konsistenz ist wichtiger als Credit-Umstellung. Daher:
- Anzeige bleibt in **€**
- Format: `€X.XX` (zwei Dezimalstellen statt vier)
- Optionaler Hinweis "ab €0.15/s" per Tooltip oder Untertitel an der Quelle-Auswahl, damit der User Range vs. Worst-Case versteht

### 3. UI-Cleanups (kleine Änderungen)
- `ClipsTab.tsx`, `StoryboardTab.tsx`, `SceneCard.tsx`, `AssemblyTab.tsx`, `VideoComposerDashboard.tsx`: Formatierung von `toFixed(2)` (statt `.toFixed(4)` falls vorhanden) für saubere Cent-Beträge
- Briefing-Tab: bei der Quellen-Auswahl die neuen Preise pro Sekunde anzeigen

### 4. Lokalisierung
Keine neuen Strings nötig — bestehende `videoComposer.estimatedCost` etc. bleiben.

### 5. Verify
30s Hailuo briefen → Header sollte **€6.00** zeigen (statt €36). Sora-Quelle wechseln → **€15.90**. Stock → €0.00.

### Was unverändert bleibt
- Datenmodell `ComposerBriefing`, DB-Schema, Edge Functions
- Briefing-Tab Kategorie-Logik (gerade fertiggestellt)
- Universal Video Creator
- Tab-Struktur

