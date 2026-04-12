

## Plan: Universal Content Creator — Full Localization

### Safety Guarantee
All current German strings will be preserved exactly as the `de` translation values. The English UI will get proper English translations, and Spanish will get Spanish. Each language is strictly separated — no cross-contamination.

### Files to Edit (13 files)

**1. `src/lib/translations.ts`** — Add ~100 new keys under `uc_*` prefix for all 3 languages (EN/DE/ES)
- Every current hardcoded German string becomes the `de` value verbatim
- English and Spanish get proper translations

**2. `src/pages/UniversalCreator/index.tsx`** — Localize Helmet title/meta

**3. `src/pages/UniversalCreator/UniversalCreator.tsx`** — Wizard step descriptions, preview panel labels, navigation buttons

**4-7. Step components** — `FormatSelectionStep.tsx`, `ContentVoiceStep.tsx`, `SubtitleTimingStep.tsx`, `PreviewExportStep.tsx` — All labels, toasts, placeholders

**8-10. Supporting components** — `BackgroundAssetSelector.tsx`, `AudioAssetSelector.tsx`, `SceneTimeline.tsx` — Tabs, upload text, search states, toasts

**11. `VoiceoverScriptGenerator.tsx`** — Dialog text, tone options; pass active app language instead of hardcoded `'de'`

**12. `SubtitleStyleEditor.tsx`** — Style labels, animation/outline names

**13. `generate-voiceover-script/index.ts`** — Accept language parameter, generate script/tips in requested language (with German as default fallback)

### How German UI stays safe
- Pattern: `t('uc_choose_platform')` → DE returns `"Plattform wählen"`, EN returns `"Choose Platform"`
- The German values are the exact strings currently hardcoded — no rewording
- The edge function defaults to German if no language is passed, preserving current behavior

