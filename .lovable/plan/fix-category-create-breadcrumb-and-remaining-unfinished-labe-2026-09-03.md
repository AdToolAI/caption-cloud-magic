# Fix "category.Create" breadcrumb and remaining unfinished labels

## What's wrong (verified in code)

`src/components/Breadcrumbs.tsx` builds its category label with `t("category." + category)`. The available keys are only `category.create | optimize | analyze | design` (EN/DE/ES in `src/lib/translations.ts`).

Two callers break that contract:

- `src/pages/PictureStudio.tsx` passes an already **translated** label (`t('picStudio.breadcrumbCategory')` → "Create"), so the component looks up `category.Create`, which does not exist and the raw key is printed — exactly what the screenshot shows.
- `src/pages/Composer.tsx` passes `category="publish"`, and `category.publish` does not exist either, so that page shows `category.publish`.

The other three callers (Calendar, BioOptimizer, BackgroundReplacer) pass valid keys and are fine.

## Changes

1. **Picture Studio breadcrumb**: pass the key `category="create"` instead of the translated string, so the breadcrumb reads "Create" / "Erstellen" / "Crear".
2. **Composer breadcrumb**: add a `category.publish` key in EN/DE/ES ("Publish" / "Veröffentlichen" / "Publicar"), so the Composer breadcrumb renders properly.
3. **Make the component tolerant**: if a category key is missing, `Breadcrumbs` renders the passed text as-is instead of printing `category.<x>`. This prevents the same raw-key leak from reappearing with future pages.

## Other unfinished labels found

A scan of all `t('…')` keys used in `src/` against `translations.ts` + `translationsFill.ts` found **42 keys with no translation entry**, which render as raw keys wherever they appear. They will be added in EN/DE/ES in the same pass:

- Dashboard: `dashboard.loadingRecommendations`, `personalizedRecs`, `preferredContentType`, `projectsCreated`, `templateSelections`, `topTemplates`
- Calendar: `calendar.advancedFilters`, `blackoutDates`, `resetFilters`, `kanban.confirmUnpublish`
- Universal Creator: `uc.libraryEmpty`, `libraryPickerDesc`, `libraryPickerSearch`, `libraryPickerTitle`, `newProjectStarted`, `originalAudioMute`, `originalAudioUnmute`, `videoImportedFromLibrary`
- Video Composer / stock: `videoComposer.resetSuccessTitle`, `videoComposer.stock.creditAttribution`, `favorite`, `libraryEmpty`, `startSearchHint`, `composer.stockImported`
- Director's Cut: `dc.detectingScenes`, `dc.reorderScene`, `dc.voiceoverGenerationFailed`
- Roles/Team: `roles.grantedAt`, `noPermission`, `roleRemoved`, `roleRemovedDescription`, `roleUpdated`, `roleUpdatedDescription`, `team.reject`
- Misc: `advisor.limitMessage`, `advisor.whyWorks`, `generator.btn_upgrade`, `generator.limit_reached_title`

(`__missing__.key.that.does.not.exist` is a test fixture and stays.)

## Verification

- Open Picture Studio in EN/DE/ES: breadcrumb reads Create / Erstellen / Crear.
- Open Composer: breadcrumb reads Publish / Veröffentlichen / Publicar.
- Re-run the key scan: zero missing keys (excluding the test fixture).
- Existing i18n purity/parity tests must stay green.

Nothing outside labels and the breadcrumb component is touched — no routing, pricing, video or lip-sync logic.
