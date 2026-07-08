# Cast & World IDs — Status

**Gesamtbild:** Die v211-Verdrahtung ist end-to-end intakt. Pass B von `briefing-deep-parse` liefert UUIDs, `ProductionPlanSheet` erhält sie bei User-Edits, `useApplyProductionPlan` schreibt `characterShots[]` + `sceneAssets[]` in die Szene, `buildSceneAssetsForRender` reicht sie an `compose-video-clips`. Der Audit fand **eine echte Lücke** und **eine Aufräumsache** — beide klein, nur Client, kein Edge-Function-Redeploy.

## Was zu tun ist

### Fix 1 — Non-UUID Katalog-Chars in `characterShots[]` blocken (Bug)
`useApplyProductionPlan.ts:279–293` mappt `plan.cast[]` → `CharacterShot[]` und schleust die ID nur durch `stripPlanId` (Prefix-Strip). Bei einem `catalog:character:<non-uuid-slug>` (Katalog-Char ohne Brand-Adoption) landet ein Nicht-UUID-String in `characterShots[].characterId`. Das ist genau der Fall den v211 verbietet: der Anchor-Resolver matched strict gegen `brand_characters.id`, kein Silent-Drift.

`scene_assets[]`-Zweig (Zeile 477) hat bereits einen `PLAN_UUID_RE.test(cid)`-Guard — der fehlt beim `characterShots[]`-Zweig.

**Fix:** Nach `stripPlanId` prüfen, ob das Ergebnis eine UUID ist. Wenn nicht → Slot verwerfen (nicht in `characterShots[]` aufnehmen). Gleiche Logik wie beim `scene_assets`-Filter, ein Guard reicht.

### Fix 2 — Kanonischen Resolver statt lokaler Kopie nutzen (Cleanup)
`useApplyProductionPlan.ts` hat eine lokale `stripPlanId`-Funktion (Zeile 60–65), die funktional identisch mit `resolveCharacterId` (`src/lib/video-composer/resolveCharacterId.ts`) ist. Die Memory `mem://features/cast-world/id-integration.md` nennt `resolveCharacterId` als Single Source of Truth für die Normalisierung — der Apply-Hook ist der letzte Callsite der noch die lokale Kopie nutzt.

**Fix:** `stripPlanId` durch Import von `resolveCharacterId` ersetzen. Die Look-Map wird im Apply-Hook nicht gebaut, aber `resolveCharacterId` funktioniert auch ohne Map für `lib:`-Prefixe und für reine UUIDs — für `outfit:`/`catalog:`-Fälle liefert es dann `null`, was in Kombination mit dem neuen UUID-Guard aus Fix 1 sauber ist. Alternativ: `stripPlanId` beibehalten, aber mit Kommentar auf `resolveCharacterId` verweisen (weniger Risiko).

Empfehlung: **Kommentar-Verweis** statt Ersetzung — das reduziert das Risiko einer Regression zu null und markiert die Duplikation dokumentarisch. Falls du das saubere Refactor willst, sag Bescheid.

## Was NICHT angefasst wird
- `briefing-deep-parse` (Edge Function) — Pass B emittiert UUIDs korrekt.
- `ProductionPlanSheet.tsx` — User-Edits erhalten UUIDs sauber.
- `ensurePlanEnsemble.ts` — spreadet UUIDs korrekt weiter.
- `buildSceneAssetsForRender` + `compose-video-clips` — v202-Registry funktioniert, hat sogar eine Late-Resolve-Safetynet für `outfit:`-Prefixe.
- Lipsync-Pipeline, `dialog_shots`, Render-Payload.

## Betroffene Dateien
- `src/hooks/useApplyProductionPlan.ts` — UUID-Guard beim `characterShots`-Build hinzufügen (+ optionaler Kommentar-Verweis auf `resolveCharacterId`).

## Technische Details
- Guard-Ausdruck: `PLAN_UUID_RE.test(id)` — die Regex existiert bereits in der Datei und wird eine Zeile weiter unten für `scene_assets` verwendet.
- Verwerfungs-Verhalten: Slot komplett droppen (nicht in `characterShots[]` aufnehmen). Alternative wäre `characterId: null` + `shotType: 'absent'`, aber Drop ist konsistent mit dem existierenden `scene_assets`-Filter.
- Kein Migration nötig, keine DB-Änderung, keine Edge-Function.
