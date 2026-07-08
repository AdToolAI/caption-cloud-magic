# Cast/Outfit/Location ID-Verdrahtung — Audit & Fix

## Befund

**Location-IDs: OK.**
- `briefing-deep-parse` resolved Slug / Catalog-UUID / Substring → schreibt `scene.location.locationId` (UUID).
- `useApplyProductionPlan` strippt `outfit:`/`catalog:`/`lib:` Prefixe, validiert UUID (`PLAN_UUID_RE`), reicht `locationId` an Composer weiter. Kein Dedup nötig (max. 1 Location pro Szene).

**Character-IDs: OK.**
- Nach v211 UUID-first; Pass-B + Local-Fill + Ensemble-Repair setzen `characterId`. Der neue `dedupePlanSceneCast` verhindert Doppel-Rows pro `characterId`.

**Outfit-IDs (`outfitLookId`): 2 Lücken.**

### Lücke A — Dedup verwirft `outfitLookId`
`src/lib/video-composer/briefing/planCastDedup.ts` deklariert im `PlanCastSlot`-Interface nur ein Legacy-`outfit: string` Feld. `mergeInto` merged nur `outfit`, nie `outfitLookId`. Wenn zwei Slots denselben `characterId` haben und nur der *zweite* ein `outfitLookId` trägt (typisch: erster Slot aus Pass-B ohne Look, zweiter Slot aus Local-Fill/Manuell mit Look), wird `outfitLookId` beim Dedup verworfen. `useApplyProductionPlan` (Zeile 292/320) findet dann kein Outfit → falscher Portrait-Anchor.

### Lücke B — Ensemble-Injection erbt kein Outfit
`ensureProductionPlanEnsemble` (`ensurePlanEnsemble.ts`) baut `required[]` aus `briefingCast()`, das nur `{characterId, characterName, mentionKey, referenceImageUrl, voiceId}` liefert — **kein `outfitLookId`**. Wenn Szene 1 für „Sarah" bereits `outfitLookId=<uuid>` gewählt hat und die Ensemble-Szene Sarah nachträglich einfügt, bekommt sie kein Outfit → Anchor rendert Sarah im Default-Portrait statt im gewählten Look.

## Fix

### 1. `src/lib/video-composer/briefing/planCastDedup.ts`
- `PlanCastSlot`: `outfitLookId?: string | null` ergänzen.
- `mergeInto`: `if (!merged.outfitLookId && extra.outfitLookId) merged.outfitLookId = extra.outfitLookId;`
- Analog defensiv `locationId` nicht anfassen (nicht Teil des Slots).

### 2. `src/lib/video-composer/briefing/ensurePlanEnsemble.ts`
- `resolvedPlanCast`-Map zusätzlich `outfitLookId` je `characterId` sammeln (erster Fund gewinnt, über alle Szenen hinweg).
- Beim Injizieren in `cast.push({ ...c, shotType: 'full', outfitLookId: resolvedOutfit.get(c.characterId) ?? null })` das Outfit aus der Map übernehmen.

### 3. `supabase/functions/briefing-deep-parse/index.ts`
- Serverseitiges `dedupeSceneCast`-Helper analog erweitern: `outfitLookId`-Merge (identische Regel wie Client) — Server-Dedup läuft an drei Stellen (nach Pass-B, nach Local-Fill, in Ensemble-Repair).

## Nicht angefasst

- Lip-Sync / Render-Payload / `compose-video-clips` / `scene_assets` UUID-Kanon (v211).
- `resolveCharacterId` (Prefix-Normalisierung) — greift downstream weiterhin.
- Location-Pfad, Voice-ID-Pfad — bereits korrekt.

## Validierung

Briefing mit 3 Avataren, je einem gewählten Outfit-Look, 5 Szenen:
- Nach Deep-Parse: jede `cast[]` Zeile trägt `characterId` **und** `outfitLookId` durch alle drei Dedup-Stufen.
- Ensemble-Szene enthält alle 3 Avatare, jeder mit seinem `outfitLookId` aus einer anderen Szene übernommen.
- `useApplyProductionPlan` → `characterShots[]` propagiert `outfitLookId`; `prepareSceneAnchor` nutzt Outfit-Cover statt Default-Portrait.
