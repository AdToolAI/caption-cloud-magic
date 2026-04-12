

## Plan: Fix Director's Cut Translation Key Overwrites

### Problem
The `dc` translation namespace is defined **twice** — once inside the main `translations` object (inline, ~300 keys per language) and again via `translations.en.dc = {...}` appended at the bottom of the file (~100 keys). The appended assignment **completely overwrites** the inline block, destroying ~200 keys. This is why the UI shows raw keys like `dc.cutTitle`, `dc.lookTitle`, `dc.fxTitle`, `dc.exportTitle`, etc.

Additionally, the Spanish `dc` block at line 11590 is **outside** the `es` object entirely (the `es` object closes at line 11046), making it dead code.

### Fix

1. **Merge the appended blocks into the inline blocks** — take every key from `translations.en.dc` (line 13943), `translations.de.dc` (line 14043), and `translations.es.dc` (line 14143) that isn't already in the inline blocks and add them there.

2. **Delete the appended `translations.*.dc = {...}` blocks** (lines 13940-14248) to eliminate the overwrite.

3. **Move the orphaned Spanish `dc` block** (line 11590) into the `es` object before its closing `}` at line 11045, merging it with any keys from the appended ES block.

4. **Deduplicate** — where both inline and appended blocks define the same key (e.g. `splitAtPlayhead`, `durationLabel`), keep the inline version (which has the correct translations) and discard duplicates from the appended block.

### Scope
- Single file: `src/lib/translations.ts`
- No component changes needed — all components already reference the correct `t('dc.xxx')` keys
- All three languages (EN/DE/ES) affected

### Technical detail
- The inline EN block (lines 3653-3975) has keys like `cutTitle`, `lookTitle`, `fxTitle`, `exportTitle`, `qualityLabel`, `format`, `fps`, `aspectRatio`, `filterClassic`, `filterMood`, `colorGrading`, `scenesCount`, `noScenesYet`, `autoCutAI`, `autoCutDesc`, `playheadInfo`, `emptyScene`, `addVideo`, `fromMediaLibrary`, `upload`, `untitledVideo`, etc.
- The appended EN block (lines 13943-14041) has keys like `back`, `backToImport`, `openSidebar`, `closeSidebar`, `originalSubsRemoved`, `burnedSubsRemoved`, `masterVolumeLabel`, `subtitleStyleStandard`, `sceneOverlay`, etc.
- After merging, each language's `dc` block will have all ~350+ keys in one place inside the main object.

