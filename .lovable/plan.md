

## Plan: Fix Missing Translations in Universal Video Creator

### Problem
The localization has two categories of issues visible in the screenshots:

1. **Key mismatches** — Components reference translation keys that don't exist. The translations were added with different names than what the components use (e.g., component uses `uvc.finetuning` but translation defines `uvc.moodFinetuning`).

2. **German interview questions in English UI** — The initial consultant welcome message includes `firstPhase?.question` from the local config file (`universal-video-interviews.ts`), which is entirely in German. The edge function returns localized questions, but the very first message bypasses it.

### Fix (2 files)

**File 1: `src/lib/translations.ts`**
Add the missing alias keys to all three languages so the component references resolve. These are simple additions that point to the same values already defined under different names:

| Component uses | Add as alias (EN / DE / ES) |
|---|---|
| `chooseCategoryHeading` | "What kind of video do you want to create?" / "Welche Art von Video..." / "¿Qué tipo..." |
| `chooseCategoryDesc` | Same as `categoryOptimizedInterview` |
| `questionsLabel` | "Questions" / "Fragen" / "Preguntas" |
| `finetuning` | Same as `moodFinetuning` |
| `textAmount` | Same as `moodTextAmount` |
| `densityLow/Medium/High` | Same as `moodTextLow/Medium/High` |
| `animIntensity` | Same as `moodAnimIntensity` |
| `intensitySubtle/Normal/Dynamic` | Same as `moodAnimSubtle/Normal/Dynamic` |
| `sceneBadges` | Same as `moodSceneBadges` |
| `deepQuestions` | Same as `fullServiceQ` |
| `readyIn` | Same as `fullServiceTime` |
| `noManualWork` | "No manual work required" / "Kein manueller Aufwand nötig" / "Sin trabajo manual necesario" |
| `premiumVisuals` | "Premium AI visuals" / "Premium KI-Visuals" / "Visuales premium con IA" |
| `filmTypesHint` | Same as `filmTypesDesc` |
| `designStylesHint` | Same as `styleDirectionsDesc` |

**File 2: `src/components/universal-video-creator/UniversalVideoConsultant.tsx`**
Change the initial message to NOT embed `firstPhase?.question` from the German config file. Instead, use a localized first-question string from the translations, or omit the question from the welcome message entirely (since the edge function will send the first real question in the correct language on the first API call).

### Result
All raw `uvc.*` keys will resolve to proper translated strings. The consultant interview will start fully in the user's language.

