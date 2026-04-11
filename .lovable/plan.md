

## Plan: KI-Post-Generator v2 — Full Localization

### Problem
The entire KI-Post-Generator v2 page and its 3 sub-components contain ~80 hardcoded German strings that don't react to the language setting. Translation keys (`aipost_*`) already exist in `translations.ts` for EN/DE/ES but are not used.

### Changes

**1. `src/lib/translations.ts` — Add ~40 missing keys (all 3 languages)**

New keys needed for strings not yet covered by existing `aipost_*` keys:
- PostGeneratorHeroHeader: badge, title, subtitle
- PostInputPanel: "Post erstellen", "Lade ein Bild hoch...", "Bild/Video hochladen (optional)", "Klicken zum Hochladen", "Bilder: max 10MB...", video limits, "Kurzbeschreibung / Briefing", placeholder, characters count, "Plattform(en)", "Stil-Vorlage", "Sprache(n)", "Tonfall" + options (Freundlich/Professionell/Locker/Inspirierend), "CTA (optional)", placeholder, "Erweiterte Optionen", all option labels, "Generiere Post...", "Post generieren", "Aktives Brand-Set"
- PreviewTabs: tab labels (Vorschau/Varianten/Plattform/Bild/Scores), "Hook-Varianten", "Zeichen", "Hauptcaption", "Caption B (A/B-Test)", "Hashtag-Sets", "Alt-Text (Barrierefreiheit)", "Plattform-Limits", hashtag warnings, "Zeichen übrig", "Compliance-Hinweise", video upload note, empty states, action buttons (An Composer/Kopieren/Kalender/Freigabe), score labels
- AIPostGenerator page: all toast messages, error messages, dialog texts ("Post erfolgreich generiert!", "Möchtest du...", "Zukünftig automatisch speichern", "Nicht speichern", "In Media Library speichern"), breadcrumb feature name
- MediaLibrary toast references ("An KI-Post-Generator senden")

**2. `src/components/post-generator/PostGeneratorHeroHeader.tsx`**
- Add `useTranslation` hook
- Replace badge, h1, subtitle with `t('aipost_...')` keys

**3. `src/components/post-generator/PostInputPanel.tsx`**
- Add `useTranslation` hook
- Replace all ~30 hardcoded labels, placeholders, option texts, and button text

**4. `src/components/post-generator/PreviewTabs.tsx`**
- Add `useTranslation` hook
- Replace all ~25 tab labels, section headers, action buttons, empty states, and toast messages

**5. `src/pages/AIPostGenerator.tsx`**
- Replace all ~15 toast messages, error strings, dialog texts, and breadcrumb label with `t(...)` calls

**6. `src/pages/MediaLibrary.tsx`** (minor)
- Replace 3 tooltip/toast strings referencing "KI-Post-Generator"

### Files affected (6)
- `src/lib/translations.ts`
- `src/components/post-generator/PostGeneratorHeroHeader.tsx`
- `src/components/post-generator/PostInputPanel.tsx`
- `src/components/post-generator/PreviewTabs.tsx`
- `src/pages/AIPostGenerator.tsx`
- `src/pages/MediaLibrary.tsx`

