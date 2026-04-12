

## Plan: Localize AI Video Studio (EN/DE/ES)

### Problem
The AI Video Studio page and its 3 sub-components have ~150 hardcoded German strings visible when the UI is set to English. Currency also needs to show `$` for EN.

### Files to edit (4 files)

| File | Hardcoded strings (~count) |
|------|---------------------------|
| `src/pages/AIVideoStudio.tsx` | ~40 — page title, subtitle, wallet label, tab labels, form labels, placeholders, toasts, error messages, info banners, buttons |
| `src/components/ai-video/VideoGenerationHistory.tsx` | ~35 — status badges, error messages, info banner, action buttons, toasts, date locale |
| `src/components/ai-video/AIVideoCreditPurchase.tsx` | ~15 — "gesamt", "Beispiele mit Sora 2 Standard", "Sek Videos", "Jetzt kaufen", "Lädt...", "Sora 2 Pro kostet doppelt", toast |
| `src/components/ai-video/VideoPromptOptimizer.tsx` | ~20 — dialog title, labels, placeholders, toasts, buttons |

### Approach

1. **Add `aiVid.*` namespace** to `translations.ts` with ~110 keys × 3 languages (EN/DE/ES). German values = current hardcoded strings (no visual change for DE users).

2. **Refactor all 4 files** to use `useTranslation` hook, replacing every hardcoded string with `t('aiVid.xxx')`.

3. **Currency-aware display**: Use `getCurrencyForLanguage(language)` so EN shows `$`, DE/ES shows `€`. Already partially done in `AIVideoCreditPurchase` but missing in the main page and history.

4. **Date locale**: `VideoGenerationHistory.tsx` hardcodes `locale: de` for `formatDistanceToNow` — switch to language-aware locale (`en` → English, `de` → German, `es` → Spanish) using existing `date-fns/locale` imports.

5. **No changes to German UI** — all DE translation values will be exact copies of the current hardcoded strings.

### Key strings being localized

- **Page**: "AI Video Studio", "Generiere professionelle Videos mit Sora 2", "Dein Guthaben", "Credits kaufen", "Generieren", "Verlauf"
- **Form**: "Video-Beschreibung", "Prompt optimieren", "Referenzbild (Optional)", "Video-Dauer", "Seitenverhältnis", "Kosten", "Video generieren"
- **History**: "Warteschlange", "Wird generiert...", "Fertig", "Fehlgeschlagen", "Abspielen", "Download", "In Mediathek speichern", info banner text
- **Credits**: "gesamt", "Beispiele mit Sora 2 Standard", "Jetzt kaufen", "Sora 2 Pro kostet doppelt"
- **Optimizer**: "Prompt optimieren", "Deine Video-Idee", "Stil (optional)", "Stimmung (optional)", "Optimierter Prompt"
- **Toasts/Errors**: All error messages, success messages, validation messages

### Single batch
All 5 files (translations.ts + 4 components) edited together.

