# Brand Kit: manual override, website refresh, Motion Studio brand context

## 1. Manual edits always win

Today the extraction result is sent along to the server a second time at save, and the server
prefers it over the form for tone, mood, values, keywords and fonts. That is why a hand-edited
tone can be silently replaced.

New rule, applied to every editable field:

```text
form value (what the user sees and edited)  ->  wins
extracted value                             ->  only prefills the form
AI / default                                ->  only when the form field is empty
```

Changes:
- Extraction applies once into the form (as now) and is marked as "applied". At save, only the
  fields that have **no form counterpart** still travel with the extraction: full color palette,
  fonts, emoji suggestions, extraction comment.
- The Brand Kit function stops preferring the extraction for: brand name, description, primary
  and secondary color, target audience, values, tone, mood/style direction, keywords. It uses the
  submitted form value, then the AI suggestion, then the default.
- Fields that are only extractable today (tone, style direction, keywords, values) get visible,
  editable inputs in the create form, so a user can actually correct them before saving.

## 2. Refresh an existing Brand Kit from the website

New action on each kit in "Manage": **Re-analyze website**.

Flow: pick kit -> enter/confirm URL -> extract -> comparison dialog -> user picks per field ->
update the same row.

Comparison dialog lists, side by side, current vs. newly detected: brand name, description,
primary/secondary color, palette, fonts, tone, mood/style, keywords, values. Each row has
"Keep current" / "Use new", defaulting to keep. Only chosen fields are written.

Persistence: a single `update` on the existing `brand_kits` row by id. No insert, no delete.
`id`, `created_at`, `is_active`, share links, uploaded assets and every `brand_kit_id`
reference from posts, projects, calendar, characters and locations therefore stay untouched.
Nothing about the archive or active-kit logic changes.

## 3. Motion Studio brand context

A new helper builds a small, purposeful brand-context object and the AI Director sends it to
`motion-studio-director` when brand use is switched on (toggle in the brief dialog, on by
default when an active kit exists).

Sent to scene/script generation:
brand name, style direction, tone, mood, target audience, keywords, brand values, and the
primary/secondary/accent colors as soft visual guidance.

Not sent: fonts, logo URL, hashtags, captions, emojis, full asset list.

Unchanged and still deterministic: colors, fonts, logo/watermark and overlays applied by the
composer and templates.

## 4. Palette and fonts usage

- Fonts stay out of image and video prompts; they keep driving overlays, templates and UI.
- Picture Studio, only when Brand Kit Lock is on, adds the palette as soft guidance:
  "Preferred brand palette: #.., #.., #.. — use where naturally appropriate." No requirement
  that every image contains every color.
- Brandboard, Carousel and Motion Studio deterministic design keep using the palette as today.

## 5. Confidence

No change. No hardcoded confidence, no score shown.

## 6. Tests (no paid provider calls)

- Typecheck and build.
- Update path: refresh an existing kit and assert the row id, created_at, active flag and all
  referencing rows are unchanged, and that no second kit appears.
- Precedence: edit tone/mood/keywords after applying extraction, save, reload, assert the edited
  values persisted.
- Create path still works with and without an extraction.

Afterwards I report results and propose the live end-to-end test separately, naming provider,
model, exact number of paid generations and estimated cost, for your approval before running it.

## Technical notes

- `src/pages/BrandKit.tsx`: form fields for tone/style/keywords/values, extraction payload
  narrowed to non-form fields, refresh action and comparison dialog.
- `supabase/functions/generate-brand-kit/index.ts`: form-first precedence, plus an optional
  `brandKitId` + `applyFields` path that updates instead of inserts.
- New `src/lib/brandContext.ts` (Motion Studio brand-context builder), used by
  `AIDirectorBriefDialog.tsx`; `supabase/functions/motion-studio-director/index.ts` consumes it.
- Picture Studio palette guidance in `supabase/functions/_shared/picturePromptBuilder.ts`.
