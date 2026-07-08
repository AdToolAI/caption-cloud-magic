# Full Motion Studio ID-Clean + AI Video Studio Cast/World-Integration

## Ziel
Cast & World-Assets über die gesamte Video-Pipeline UUID-strict. World-Assets bekommen die gleiche ID-Bridge wie Cast. Universal Creator / ToolkitGenerator / PictureStudio erhalten die gleichen Picker wie Motion Studio.

## Scope
- Motion Studio (Composer): World-UUID-Bridge + Legacy-Name-Match hart abschalten
- AI Video Studio (UniversalCreator, ToolkitGenerator, PictureStudio): Cast- und World-Picker einbauen, `characterShots[]` + `scene_assets` schreiben
- Kein Inline-Create im Composer (später separater Scope)
- Keine Schema-Änderung nötig — `composer_scenes.scene_assets` (v202) und `brand_characters`/`brand_locations`/`brand_buildings`/`brand_props` existieren

---

## Phase A — Motion Studio World-UUID-Bridge

**A.1 SceneAssetMention um UUID erweitern**
- `src/lib/motion-studio/applySceneAssetsToPrompt.ts`: Typ auf `{ type, id, name }` erweitern; Prompt-Marker weiter slug-basiert (rein textuell für LLM), aber Struktur trägt UUID.
- `src/components/video-composer/UnifiedAssetPicker.tsx:168`: Selection schreibt `{ type: 'location'|'building'|'prop', id: <uuid>, name }`.
- `src/components/video-composer/SceneDirectorBox.tsx:123`: Callsite an neue Signatur anpassen.

**A.2 scene_assets Live-Persistenz**
- Neuer Helper `src/lib/motion-studio/persistSceneAssets.ts` — mappt gewählte World-Assets + `characterShots` zu `SceneAssetRef[]` und schreibt in `composer_scenes.scene_assets` via `useComposerPersistence`.
- Hook in `UnifiedAssetPicker` onChange, `CharacterCastPicker` onChange, `BriefingTab` character-shot-Edits.
- Debounced Save (500ms) analog zur bestehenden Scene-Autosave-Logik.

**A.3 Render-Payload erweitern**
- `src/hooks/useGenerateAllClips.ts:252` + `src/components/video-composer/ClipsTab.tsx:656`: `scenesPayload` um `scene_assets: SceneAssetRef[]` erweitern (aus DB-Snapshot der Szene).
- Edge Function `compose-video-clips` (kurzer Check): liest heute `scene_assets` bereits per JIT aus DB? Falls ja → Client-Payload optional; falls nein → Payload-Feld ist die Bridge.

**A.4 World-Anchor UUID-Tiebreak**
- `src/lib/motion-studio/prepareSceneAnchor.ts:101–112` (`resolveSceneWorldRefs`): Wenn `mention.id` vorhanden → per UUID matchen; nur Fallback auf Slug-Match wenn UUID fehlt (Legacy-Szenen).

---

## Phase B — Legacy-Name-Match hart abschalten (Cast)

**B.1 UUID-strict Resolver**
- `src/lib/motion-studio/resolveSceneCharacterAnchor.ts:34,197`: Sources `cast-name-match` und `brand-name-match` entfernen bzw. hinter Feature-Flag `MOTION_STUDIO_STRICT_IDS=true` (default an).
- `src/lib/motion-studio/applyCastToPrompt.ts:56–69`: `findCharacter` auf exakten UUID-Match reduzieren; Fuzzy-First-Name-Substring entfernen.
- Fehlender Match → sichtbarer Warning-Toast + Console-Warnung mit Repair-Hint auf `CastConsistencyMap`.

**B.2 Katalog-baseCharacterId Fix**
- `src/hooks/useUnifiedMentionLibrary.ts:150–166`: Katalog-Entries bekommen `meta.baseCharacterId` = zugehörige `brand_characters.id` (Lookup über bereits geladene brand_characters-Query, falls Katalog-Character bereits als brand_character existiert; sonst `null` → mentionToCastRef muss diesen Fall werfen, nicht stillschweigend katalog-ID zurückgeben).
- `src/lib/video-composer/mentionToCastRef.ts`: Wenn `catalog:` ohne `meta.baseCharacterId` → Error werfen (heute fällt es auf `stripLegacyCastIdPrefix` zurück).

---

## Phase C — AI Video Studio Cast/World-Integration

**C.1 ToolkitGenerator vollständig verdrahten**
- `src/components/ai-video/ToolkitGenerator.tsx`: Neben Character-Mention-Extraction (bereits vorhanden) `UnifiedAssetPicker` einbauen (Locations/Buildings/Props).
- `characterShots[]` schreiben (nicht nur Text-Mentions), Payload an render-Endpoint um `characterShots` + `scene_assets` erweitern.
- Verwendet dieselben Prompt-Helper wie Motion Studio (`applyCastToPrompt`, `applySceneAssetsToPrompt`).

**C.2 UniversalCreator Cast/World**
- `src/pages/UniversalCreator/UniversalCreator.tsx` (+ Sub-Panels unter `src/pages/UniversalCreator/`): Einbau
  - `CharacterCastPicker` neben Prompt-Feld
  - `UnifiedAssetPicker` (Locations/Buildings/Props)
  - `characterShots` + `scene_assets` an render-Endpoint (`generate-video`/`universal-video-*`)
- Falls UniversalCreator scenes-los ist (single-shot): `scene_assets` als flat array am Job persistieren (via existing `universal_video_renders`-Feld oder Job-Metadata).

**C.3 PictureStudio Cast**
- `src/pages/PictureStudio.tsx`: `CharacterCastPicker` einbauen (Bild-Generierung), `applyCastToPrompt` auf Prompt anwenden, `characterId` an Bild-Generierungs-Endpoint (portrait-Referenz).
- World-Picker optional (Location als Setting-Referenz) — als Nice-to-have.

**C.4 Shared Prompt-Composer**
- `src/lib/ai-video/composePrompt.ts` (neu) oder gemeinsame Nutzung von `src/lib/motion-studio/composeFinalPrompt.ts`: Zentrale Funktion für Cast+World-Prompt-Aufbau, damit Motion Studio und AI Video Studio dieselbe Boundary teilen.

---

## Phase D — Consistency & Validation

**D.1 Client-Feature-Flag-Awareness**
- Neue Konstanten in `src/lib/motion-studio/featureFlags.ts`:
  - `SCENE_ASSETS_REQUIRED` (aus Env / Cloud-Config lesen; fallback false)
  - `FACE_TRACK_PRECLIP` (info-only)
- Wenn `SCENE_ASSETS_REQUIRED` und `scene_assets` fehlt → Render-Button in `ClipsTab` / `useGenerateAllClips` blockieren mit klarem Fehler.

**D.2 CastConsistencyMap erweitern**
- `src/components/video-composer/CastConsistencyMap.tsx`: Panel um World-Assets erweitern (zeigt Slugs an, die kein UUID-Backing haben → Repair-Button, matcht Slug → UUID via Brand-Library, schreibt UUID in Szene).

**D.3 Memory-Dokument**
- `mem/features/cast-world/id-integration.md`: Vollständiger Datenfluss (Picker → CastRef/SceneAssetRef → DB → Edge Function → Renderer).
- `mem/index.md`: Eintrag „Cast & World ID-Integration v211".

---

## Betroffene Dateien (Übersicht)

**Motion Studio**
- `src/lib/motion-studio/applySceneAssetsToPrompt.ts` (Typ + UUID)
- `src/lib/motion-studio/prepareSceneAnchor.ts` (UUID-Match)
- `src/lib/motion-studio/resolveSceneCharacterAnchor.ts` (Name-Match raus)
- `src/lib/motion-studio/applyCastToPrompt.ts` (Fuzzy raus)
- `src/lib/motion-studio/persistSceneAssets.ts` (neu)
- `src/lib/motion-studio/featureFlags.ts` (neu)
- `src/components/video-composer/UnifiedAssetPicker.tsx`
- `src/components/video-composer/CharacterCastPicker.tsx` (onChange schreibt scene_assets)
- `src/components/video-composer/SceneDirectorBox.tsx`
- `src/components/video-composer/CastConsistencyMap.tsx` (World-Panel)
- `src/components/video-composer/BriefingTab.tsx`
- `src/components/video-composer/ClipsTab.tsx`
- `src/hooks/useGenerateAllClips.ts`
- `src/hooks/useUnifiedMentionLibrary.ts` (Katalog-baseCharacterId)
- `src/lib/video-composer/mentionToCastRef.ts` (Hard-Fail für Katalog ohne baseCharacterId)

**AI Video Studio**
- `src/components/ai-video/ToolkitGenerator.tsx` (World-Picker + characterShots + scene_assets)
- `src/pages/UniversalCreator/UniversalCreator.tsx` (+ Sub-Panels)
- `src/pages/PictureStudio.tsx` (Cast-Picker)
- `src/lib/ai-video/composePrompt.ts` (neu, oder Shared-Import)

**Memory**
- `mem/features/cast-world/id-integration.md` (neu)
- `mem/index.md`

## Nicht enthalten
- Kein Inline-Create (Quick-Add-Sheets) im Composer — separater Scope
- Keine Schema-Migration (alle Spalten existieren)
- Keine Edge-Function-Änderungen außer minimalem Payload-Consumer, falls `compose-video-clips` `scene_assets` heute nur DB-JIT liest

## Risiken
- **Legacy-Szenen ohne UUIDs**: `CastConsistencyMap` muss vor erstem Strict-Render laufen — bei Bestandsprojekten Migrations-Toast anzeigen.
- **Katalog-Chars ohne brand_characters-Backing**: mentionToCastRef wirft neu → UI muss den Fehler abfangen und Repair-CTA anzeigen (Katalog-Char zuerst in brand_characters "adopten").
- **Universal Creator ohne Scene-Modell**: `scene_assets` als flat job-metadata statt pro Szene.
