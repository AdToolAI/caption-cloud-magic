

# Phase 8: Text-Kürzung + Roadmap zu 95% Loft-Film

## Phase 8a: Sofort-Fix (jetzt umsetzen)

### 1. Text aggressiver kürzen
**Datei:** `supabase/functions/auto-generate-universal-video/index.ts`
- `smartTruncateToSentences` Aufruf: `maxWords: 20` → **15**, `maxSentences: 2` → **1**
- Ergebnis: Jede Szene hat max 1 Satz / 15 Wörter → passt immer einzeilig oder knapp zweizeilig ins Glass-Panel

### 2. Hintergrundbild-Sättigung absichern
**Datei:** `src/remotion/templates/UniversalCreatorVideo.tsx` — `SceneBackground`
- CSS-Filter `saturate(1.15) contrast(1.05)` auf alle Szenen-Hintergrundbilder anwenden
- Verhindert blasse/graue Bilder (wie die Feature-Szene im letzten Test)

### 3. Bundle-Canary
`UCV_BUNDLE_CANARY` → `2026-03-18-r58-phase8-textdensity`

| Datei | Änderung |
|-------|----------|
| `auto-generate-universal-video/index.ts` | maxWords 20→15, maxSentences 2→1 |
| `UniversalCreatorVideo.tsx` | Saturation+Contrast Filter auf Hintergrundbilder |

---

## Phase 8b–10: Roadmap zu 95% (nach diesem Fix)

| Phase | Thema | Gap schließt | Aufwand |
|-------|-------|-------------|---------|
| **8b** | **Szenen-Übergänge verfeinern** — Crossfade-Dauer von 10→20 Frames, Slide-Transition mit Easing statt linear | Harter Schnitt → flüssig | Klein |
| **9** | **Visuelles Prompt-Engineering** — "No QR codes, no logos, no text" explizit im Prompt verstärken; Negative-Prompt-Pattern für Gemini Image Gen | Artefakte im Hintergrundbild | Mittel |
| **10** | **Cinematische Overlays** — Subtiler Film-Grain (2%), Vignette (15% Opacity), leichter Color-Grade (Warm-Shift für Storytelling, Cool für Corporate) | "Stock-Look" → "Kino-Look" | Mittel |

S3-Bundle-Redeploy erforderlich nach Phase 8a.

