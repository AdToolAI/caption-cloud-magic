---
name: v369 HappyHorse Prompt-Rejection & Repair-Retry
description: InvalidParameter/"Could not process with this prompt" zählt wie Green Net als Prompt-Rejection; einmaliger Auto-Repair-Retry mit hartem Sanitizer statt Sofort-Fail
type: feature
---

# v369 — HappyHorse Prompt-Rejection

HappyHorse lehnt Prompts über zwei Kanäle ab:
- Green Net: `DataInspectionFailed - Green net check failed for text (input)`
- Parametervalidierung: `InvalidParameter - Could not process with this prompt.`
  (kommt als `Prediction failed: … Happy Horse I2V failed: …` an)

## Regeln
- `classifyProviderRejection()` in `_shared/happyhorse-green-net.ts` ist die
  einzige Autorität: `none | greennet | invalid_prompt`. `isGreenNetRejection`
  ist nur noch ein Wrapper.
- `isRetryableTransientError` in `compose-clip-webhook` MUSS Rejections
  ausschließen — der Wrapper-Text enthält „prediction failed" und hat vorher
  zwei identische Retries verbrannt.
- Genau EIN Prompt-Repair-Retry pro Szene: harter Sanitizer
  (`hardSanitizeForHappyHorse`) + Re-Dispatch. Markiert über
  `clip_error = '[prompt_repair_retry] …'`; ein zweiter Fehlschlag wird als
  `[prompt_repair_exhausted]` getaggt → Fail + Refund.
- Cinematic-Sync-Plates gehen bereits beim Erstversuch durch den harten
  Sanitizer (Lippenbewegung kommt von Sync.so, nicht vom Plate-Prompt).
- Provider wird NIE automatisch migriert (v176 bleibt gültig).

Tests: `supabase/functions/_shared/happyhorse-rejection.test.ts`.
