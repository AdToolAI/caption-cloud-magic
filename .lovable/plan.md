

## Plan: Localize Sora 2 Long-Form Creator + Fix EN Flag to US

Two issues to fix:

### 1. Change English flag from 🇬🇧 to 🇺🇸
- **File**: `src/components/LanguageSwitcher.tsx` line 13
- Change `'🇬🇧'` → `'🇺🇸'` and label to `'English (US)'`

### 2. Localize all 8 Sora Long-Form files (EN/DE/ES)

**~200 hardcoded German strings** across 8 files. All prices must show `$` in EN, `€` in DE/ES using `formatPriceForLanguage` / `getCurrencyForLanguage`.

**Files to edit:**

| File | Strings |
|------|---------|
| `translations.ts` | Add ~120 `soraLf.*` keys (EN/DE/ES) |
| `LongFormWizard.tsx` | Step labels (Skript→Script, Szenen→Scenes, etc.) |
| `FormatStep.tsx` | "Videolänge wählen", "Sek.", "Szenen", "Geschätzte Kosten", model descriptions, "Zusammenfassung", "Weiter zum Skript", € → $ |
| `ScriptGeneratorStep.tsx` | Toast messages, tone labels, placeholders, "Szene hinzufügen", duration/transition labels, € → $ |
| `SceneConfigurator.tsx` | Frame-chain info, upload labels, toasts, "Generierung starten", € → $ |
| `SceneGenerationProgress.tsx` | Wallet labels, resume/chain/beta alerts, progress text, status badges, toasts, action buttons |
| `TransitionEditor.tsx` | Section titles, quick action buttons, "Zurück"/"Zum Export" |
| `FinalExport.tsx` | Summary labels, render status messages, success/error toasts, "Video rendern", "Download", "Zur Mediathek" |
| `Sora2LongFormCreator.tsx` | Page title, subtitle, loading text, toasts |
| `sora-long-form.ts` | `TRANSITION_OPTIONS` labels moved to components via `useMemo` |

**Approach:**
- Add `soraLf` namespace to `translations.ts` with all keys
- Each component gets `useTranslation` hook
- Static arrays (STEPS, DURATION_OPTIONS, MODEL_OPTIONS, TONE_OPTIONS, TRANSITION_OPTIONS) wrapped in `useMemo` for language reactivity
- Currency formatting uses `getCurrencyForLanguage(language)` — EN shows `$`, DE/ES shows `€`
- German UI remains identical (DE translations = current hardcoded strings)

