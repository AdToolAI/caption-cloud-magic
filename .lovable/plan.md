
Problem:
The remaining German text in the English UI is coming from the KI-Textstudio/Generator area, not just one label. I found hardcoded German strings in the page component, the hero header, the prompt assistant dialog, and even shared AI status messages.

What I found:
- `src/components/generator/GeneratorHeroHeader.tsx`
  - hardcoded: `KI Text-Studio`, `KI-Generiert`, `Sofort einsatzbereit`, `Multi-Plattform`
- `src/pages/Generator.tsx`
  - hardcoded: `Prompt-Assistent öffnen`, `Prompt-Assistent`
  - `Content-Länge`, `Kurz/Mittel/Lang`
  - `Anzahl Hashtags`
  - `Generating...`
  - result labels: `(editierbar)`, `Caption bearbeiten...`
  - toasts: `Caption generated!`, `Copied to clipboard!`, `Generiere zuerst eine Caption`, calendar success message
  - CTA: `Zum Kalender hinzufügen`
- `src/components/generator/PromptAssistantDialog.tsx`
  - hardcoded toast: `Prompt übernommen!`
  - hardcoded button text: `In Generator übernehmen`
- `src/hooks/useAICall.ts`
  - shared German status/toast text:
    - `Prüfe Credits...`
    - `Generiere...`
    - `Wiederhole...`
    - `Erfolgreich!`
    - insufficient credits / rate-limit / server error messages

Important design note:
- The base translation file already has good generator and prompt assistant keys in EN/DE/ES.
- So this is mostly a cleanup of hardcoded literals plus a small translation expansion.
- `nav.textStudio` is already correct in English (`AI Text Studio`), so the remaining issue is component-level strings.

Implementation plan:
1. Extend `src/lib/translations.ts`
- Add missing generator keys for:
  - hero badge/title/highlights
  - prompt assistant trigger text/tooltip
  - content length label + short/medium/long options
  - hashtag count label
  - generating state
  - editable/result labels and placeholders
  - send-to-calendar CTA
  - generator success/copy/prefill/calendar toasts
- Add prompt assistant action/success keys for:
  - `useInGenerator`
  - `applied`
- Add shared AI call status/error keys under a safe namespace (for example `aiCall.*`) to avoid collisions.

2. Localize `src/components/generator/GeneratorHeroHeader.tsx`
- Use `useTranslation()`
- Replace hero badge/title and feature chips with translation keys
- Keep layout/animation unchanged.

3. Localize `src/pages/Generator.tsx`
- Replace all remaining hardcoded German/English literals with `t(...)`
- Use translated labels for content length options and result section
- Replace all generator toasts with translated messages
- Keep platform names as-is unless already centralized elsewhere.

4. Localize `src/components/generator/PromptAssistantDialog.tsx`
- Replace `Prompt übernommen!` and `In Generator übernehmen` with translation keys
- Reuse existing `wizard.useInGenerator` where possible.

5. Localize shared AI status copy in `src/hooks/useAICall.ts`
- Inject translation support into the hook
- Replace German status messages and generic error toasts with translated keys
- This will also improve language consistency anywhere else `useAICall()` is used.

Files to update:
- `src/lib/translations.ts`
- `src/components/generator/GeneratorHeroHeader.tsx`
- `src/pages/Generator.tsx`
- `src/components/generator/PromptAssistantDialog.tsx`
- `src/hooks/useAICall.ts`

Expected result:
- The KI-Textstudio / AI Text Studio page will be fully language-consistent in EN/DE/ES.
- No German hero text, chips, CTA labels, assistant text, or AI status messages will remain in the English UI.
- Shared AI loading/error badges will also match the selected language across affected tools.
