

## Plan: Universal Video Creator — Full Localization

### Scope
The entire Universal Video Creator flow contains ~500+ hardcoded German strings across frontend components, type definitions, configuration files, and backend edge functions. This covers UI labels, interview questions, quick replies, error messages, toasts, and AI-generated content.

### Safety Guarantee
All current German strings become the `de` translation values verbatim. English and Spanish get proper translations. The edge functions default to German if no language is passed.

### Implementation (4 phases)

---

**Phase 1: Translation keys + Type/Config data** (3 files)

**`src/lib/translations.ts`** — Add ~200 new keys under `uvc` namespace for all 3 languages:
- Category names/descriptions (Werbevideo → Advertisement, etc.)
- Step labels/descriptions for both wizard modes
- All UI strings from wizard, consultant, progress, export, mode selector, category selector, mood selector, film style selector
- Error/status messages, toasts, dialog text
- Mood preset names/descriptions, film style descriptions

**`src/types/universal-video-creator.ts`** — Make `VIDEO_CATEGORIES` language-aware:
- Either convert to a function that accepts language, or use translation keys instead of hardcoded German names/descriptions/features

**`src/config/universal-video-interviews.ts`** — Not changed directly; the interview questions come from the edge function, not this config (this file is only used for question counts)

---

**Phase 2: Frontend components** (10 files)

**`src/pages/UniversalVideoCreator/index.tsx`** — Localize Helmet title/meta

**`src/components/universal-video-creator/UniversalVideoWizard.tsx`** — ~60 strings:
- STEPS_MANUAL / STEPS_FULL_SERVICE labels and descriptions
- Draft recovery dialog text
- Reset confirmation dialog
- Error state buttons and messages
- Category confirm button, preview header, export toast
- Manual mode placeholder text
- Auth required message

**`src/components/universal-video-creator/CategorySelector.tsx`** — ~6 strings:
- "12 Videokategorien verfügbar", heading, description, "Fragen", "Interview-Phasen"

**`src/components/universal-video-creator/MoodPresetSelector.tsx`** — ~20 strings:
- Preset names (Energetisch → Energetic), descriptions, slider labels, heading

**`src/components/universal-video-creator/FilmStyleSelector.tsx`** — ~25 strings:
- All style descriptions (German), section headers, confirm button

**`src/components/universal-video-creator/UniversalModeSelector.tsx`** — ~25 strings:
- Mode titles, descriptions, feature lists, badges, buttons, compare note

**`src/components/universal-video-creator/UniversalVideoConsultant.tsx`** — ~15 strings:
- Initial messages, error messages, quick replies, badges, placeholder, progress text, skip button

**`src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`** — ~40 strings:
- Step labels/descriptions, status messages, error messages, capacity cooldown text, retry labels, debug labels

**`src/components/universal-video-creator/UniversalExportStep.tsx`** — ~15 strings:
- Export header, format labels, render status labels, download/action buttons, completion state

**`src/components/universal-video-creator/UniversalPreviewPlayer.tsx`** — Check for any German labels (likely minimal)

---

**Phase 3: Edge function — Consultant** (1 file)

**`supabase/functions/universal-video-consultant/index.ts`** — ~400 lines of German:
- Accept `language` parameter from frontend
- Create EN/DE/ES versions of:
  - `UNIVERSAL_PHASES_BLOCK1` (4 questions)
  - `UNIVERSAL_PHASES_BLOCK3` (6 questions)
  - `CATEGORY_SPECIFIC_PHASES` (12 categories × 12 questions each)
  - `UNIVERSAL_QUICK_REPLIES_BLOCK1/3`
  - `CATEGORY_QUICK_REPLIES` (all categories)
  - System prompt text
- Default to German when no language is passed

---

**Phase 4: Frontend language passthrough**

- **`UniversalVideoConsultant.tsx`** — Pass `language` to `universal-video-consultant` edge function call
- **`UniversalVideoWizard.tsx`** — Pass `language` through consultation flow so generated video scripts are in the correct language
- The `auto-generate-universal-video` edge function may also need a `language` parameter so the AI-generated script/voiceover matches the UI language

---

### How the generated videos become English

The consultant edge function generates the interview in the user's language. The consultation result (product description, CTA text, key messages) will be in that language. When this flows into `auto-generate-universal-video` → `generate-universal-script`, the script will naturally be in the interview language. The `generate-voiceover-script` function was already updated in the previous round to accept a language parameter.

### Files affected (13+)
- `src/lib/translations.ts`
- `src/types/universal-video-creator.ts`
- `src/pages/UniversalVideoCreator/index.tsx`
- `src/components/universal-video-creator/UniversalVideoWizard.tsx`
- `src/components/universal-video-creator/CategorySelector.tsx`
- `src/components/universal-video-creator/MoodPresetSelector.tsx`
- `src/components/universal-video-creator/FilmStyleSelector.tsx`
- `src/components/universal-video-creator/UniversalModeSelector.tsx`
- `src/components/universal-video-creator/UniversalVideoConsultant.tsx`
- `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`
- `src/components/universal-video-creator/UniversalExportStep.tsx`
- `supabase/functions/universal-video-consultant/index.ts`
- Possibly `supabase/functions/auto-generate-universal-video/index.ts`

### Important notes
- No changes to Trend Radar, Universal Content Creator (already localized), or any other feature
- The edge function is the biggest piece (~900 lines) — it needs full EN/DE/ES question sets
- Due to the massive scope, implementation will likely need 2-3 messages

