

## Plan: Localize Universal Director's Cut (EN/DE/ES)

### Problem
The entire Director's Cut module (57 files, ~31K lines of code) has all UI strings hardcoded in German. None of these components use the `useTranslation` hook. When the UI language is set to English or Spanish, every label, toast, error message, and description still appears in German.

### Scope
~169 unique German string patterns across these file groups:

| Group | Files | Examples |
|---|---|---|
| **Main page** | `DirectorsCut.tsx`, `UniversalDirectorsCut.tsx` | "Importiere ein Video", "Zur Mediathek", "Projekt zurückgesetzt" |
| **Import step** | `VideoImportStep.tsx` | "Aus Mediathek", "Hochladen", "Unbenanntes Video", "Video hochladen" |
| **Studio core** | `CapCutEditor.tsx`, `CapCutSidebar.tsx`, `CapCutTimeline.tsx`, `CapCutPreviewPlayer.tsx`, `CapCutPropertiesPanel.tsx` | Tab labels, analysis toasts, reset messages |
| **Sidebar panels** | `CutPanel.tsx`, `LookPanel.tsx`, `FXPanel.tsx`, `ExportPanel.tsx` | Filter names, effect descriptions, export labels |
| **AI features** (18 files) | `AIAutoCut.tsx`, `AITransitions.tsx`, `AIVoiceOver.tsx`, `AISoundDesign.tsx`, etc. | "KI-Überarbeitung", "Nicht genügend Credits", voice descriptions |
| **Timeline** | `MultiTrackTimeline.tsx`, `TimelineStudio.tsx`, etc. | Track labels, context menus |
| **UI dialogs** | `TransitionPicker.tsx`, `SmartTemplates.tsx`, `AddMediaDialog.tsx`, etc. | Transition names/descriptions, template names |
| **Export** | `ExportRenderStep.tsx`, `ExportDialog.tsx`, `RenderOverlay.tsx` | Resolution labels, progress messages |

### Approach

**Phase 1 — Translation keys** (`src/lib/translations.ts`)
- Add a `dc` namespace with ~200 keys covering all Director's Cut strings for EN, DE, and ES
- Organize by sub-section: `dc.import.*`, `dc.studio.*`, `dc.ai.*`, `dc.export.*`, `dc.timeline.*`, `dc.effects.*`

**Phase 2 — High-visibility pages** (5 files)
- `DirectorsCut.tsx` — page title, subtitle, toasts, "Zur Mediathek"
- `UniversalDirectorsCut.tsx` — landing page title and descriptions
- `VideoImportStep.tsx` — tabs, toasts, empty state, upload messages
- `CapCutEditor.tsx` — studio header, analysis button
- `CapCutSidebar.tsx` — tab labels

**Phase 3 — Sidebar panels + Export** (6 files)
- `CutPanel.tsx`, `LookPanel.tsx`, `FXPanel.tsx`, `ExportPanel.tsx`
- `ExportDialog.tsx`, `ExportRenderStep.tsx`, `RenderOverlay.tsx`

**Phase 4 — AI features** (18 files)
- All `AI*.tsx` files in `features/`
- Toast messages, credit errors, generation status, voice/sound descriptions

**Phase 5 — Timeline + UI dialogs** (~15 files)
- Timeline components, `TransitionPicker`, `SmartTemplates`, `AddMediaDialog`, etc.

### Safety
- German translations will be set to the **existing hardcoded values** — zero visible change for DE users
- EN and ES get new translated strings
- Date formatting will use locale-aware `toLocaleDateString()` based on language

### Estimated effort
This is comparable to the UVC localization (~4 implementation messages due to the 57-file scope). I recommend proceeding phase by phase with confirmation between phases.

### Technical details
- Each file gets `import { useTranslation } from '@/hooks/useTranslation'` and `const { t } = useTranslation()` 
- All hardcoded German strings replaced with `t('dc.keyName')`
- Toast calls like `toast.success('Projekt zurückgesetzt')` become `toast.success(t('dc.projectReset'))`
- Static arrays (filter lists, transition presets) will use `useMemo` with `t()` to stay reactive to language changes

