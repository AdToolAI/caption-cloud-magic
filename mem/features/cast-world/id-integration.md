---
name: Cast & World ID-Integration (v211)
description: Canonical UUID flow for Cast and World assets across Motion Studio + AI Video Studio, prompt injection contract, render-payload schema, and legacy repair path.
type: architecture
---

# Cast & World ID-Integration — v211

## Ziel
Cast (`brand_characters`) und World-Assets (`brand_locations`, `brand_buildings`, `brand_props`) fließen als UUID-Referenzen durch die gesamte Video-Pipeline. Slug-basiertes Prompt-Marker-Format bleibt für LLM-Lesbarkeit erhalten, aber jeder Resolver bevorzugt UUIDs.

## Datenfluss

```
[UnifiedAssetPicker / CharacterCastPicker]
        ↓ writes {id, type, name}
[SceneAssetMention[] + CharacterShot[]]
        ↓ applySceneAssetsToPrompt / applyCastToPrompt
[scene.aiPrompt] — slug block + [Cast:...] marker (LLM readable)
        ↓
[buildSceneAssetsForRender(scene, worldLib)]
        ↓ emits SceneAssetRef[] = { type, id, variantId, role, displayName }
[useGenerateAllClips / ClipsTab scenesPayload.scene_assets]
        ↓
[compose-video-clips edge fn]  → reference_image_url via UUID lookup
```

## Kanonische Datentypen

**`SceneAssetMention`** (`src/lib/motion-studio/applySceneAssetsToPrompt.ts`)
```ts
{ name: string; id?: string; type?: 'location'|'building'|'prop' }
```
Prompt-Marker bleibt slug-basiert (`<!--scene-assets-->@slug<!--/scene-assets-->`), aber Callers geben UUIDs mit → Resolver locken UUID-first.

**`SceneAssetRef`** (`src/lib/motion-studio/buildSceneAssetsForRender.ts`, spiegelt v202 Schema von `useApplyProductionPlan`)
```ts
{ type: 'character'|'location'|'building'|'prop'|'style';
  id: string; variantId?: string|null; role?: string|null; displayName?: string|null }
```
Wird pro Render-Batch aus Szene-State frisch gebaut und im Payload an `compose-video-clips` mitgesendet. `composer_scenes.scene_assets`-DB-Spalte bleibt v202 Kanon (Plan-Apply schreibt sie; `buildSceneAssetsForRender` liest sie durch, falls vorhanden).

## Resolver-Reihenfolge

**Cast** (`resolveSceneCharacterAnchor.ts`)
1. Explicit `characterShots[]` (UUID) — pflichtig
2. Legacy `characterShot` (UUID) — Kompat
3. ~~cast-name-match~~ — hinter `MOTION_STUDIO_STRICT_IDS=true` (v211 default hard-off)
4. ~~brand-name-match~~ — dito

**World** (`prepareSceneAnchor.resolveSceneWorldRefs`)
1. `scene.scene_assets[]` UUID-Kanon
2. `@`-Mentions im Prompt (UUID via mention library)
3. Slug-Fallback aus `<!--scene-assets-->`-Block (nur Legacy-Szenen)

## Feature-Flags (`src/lib/motion-studio/featureFlags.ts`)
- `MOTION_STUDIO_STRICT_IDS` (default `true`) — Cast-Name-Fallback deaktiviert.
- `SCENE_ASSETS_REQUIRED` (default `false`) — spiegelt Server-Flag; UI kann Render blocken.
- `FACE_TRACK_PRECLIP` — nur Info.

## Legacy-Repair
- `CastConsistencyMap` normalisiert `outfit:`/`catalog:`/`lib:`-Prefixe → `brand_characters.id`.
- `mentionToCastRef` bei Catalog-Character ohne Brand-Backing: gibt `null` zurück + Console-Warn (früher: gab Katalog-ID zurück, silently drift).
- `applyCastToPrompt`-`findCharacter`: UUID-strict, Console-Warn bei Miss (v211).

## Callsites nach v211

**Motion Studio (ID-clean)**
- `UnifiedAssetPicker` — `writeSelection` emittiert `{id, type, name}`
- `SceneDirectorBox` — matched assets werden mit `{id, type}` angereichert
- `useGenerateAllClips` + `ClipsTab.handleGenerateAll` — Payload trägt `scene_assets`
- `resolveSceneCharacterAnchor` — Name-Match hinter Flag
- `applyCastToPrompt` — UUID-strict `findCharacter`
- `useUnifiedMentionLibrary` — Katalog-Chars bekommen `meta.baseCharacterId` wenn Brand-Adoption vorliegt

**AI Video Studio**
- `ToolkitGenerator` — World-Mentions mit `{id, type}`, `applySceneAssetsToPrompt` bereits genutzt
- **Offen (out-of-scope in v211)**:
  - `UniversalCreator/*` — kein Cast/World-Picker integriert. Braucht `CharacterCastPicker` + `UnifiedAssetPicker` + `scene_assets` als flat job-metadata am `universal_video_renders`-Job.
  - `PictureStudio/ImageGenerator` — kein `CharacterCastPicker`; Bild-Generierung nutzt Cast-Portraits nicht. Braucht `applyCastToPrompt`-Aufruf und `characterId` an image-gen-Endpoint.

## Bekannte Grenzen
- `composer_scenes.scene_assets`-DB-Spalte wird bei manuellen Storyboard-Edits **nicht live** geschrieben. `buildSceneAssetsForRender` reproduziert die Struktur aus dem aktuellen Szenen-State jedes Mal beim Render, sodass die Edge Function sie im Payload sieht.
- `UnifiedAssetPicker` bietet keinen `onSceneAssetsChange`-Konsumer im `SceneCard`-Wrapper — der Callback existiert (Prop optional), wird aber noch nicht in `useComposerPersistence` geleitet. Persistenz erfolgt derzeit über den Prompt-String (Slug-Block).
- Inline-Asset-Creation im Composer bleibt ausgeklammert; Empty-State-CTA öffnet weiterhin `/library` in neuem Tab.
