# Phase 2 — Cast & World ID-Registry + Briefing-Bindung

Nach v201 (Lip-Sync ID-only) ist der nächste Schritt: **jedes Asset in Cast & World bekommt eine kanonische ID**, und alles nachgelagerte (Motion Studio, AI Video Studio, Briefing-Analyse, Composer-Szenen) referenziert **ausschließlich** diese IDs. Keine Frontend-Änderung — nur Datenmodell, Resolver und Edge-Function-Bindings.

## Ziele
1. Eine einheitliche Referenz für alle Assets: `{ type, id, role? }`.
2. Motion Studio, Composer, Storyboard und AI Video Studio nutzen dieselben IDs (Kein Slug-Matching, kein Name-Fuzzy).
3. Briefing-Analyse mappt Personen/Orte/Produkte deterministisch auf existierende Cast&World-IDs — oder erzeugt neue Assets mit sofort gültigen IDs.
4. Guardrails: Dispatch/Persistenz **hart fehlschlagen**, wenn eine Referenz nicht auflösbar ist. Kein stiller Fallback.

## Umfang (dieser Schritt)
Nur **Backend + Datenmodell + Resolver**. Frontend bleibt unangetastet (User-Direktive).

### 1. Kanonisches Asset-Referenzformat
Ein einziger Value-Type `AssetRef` in `_shared/asset-ref.ts`:
```
{ type: 'character' | 'location' | 'building' | 'prop' | 'style',
  id: string,           // UUID (brand_characters.id, brand_locations.id, …)
  variantId?: string,   // outfit_look_id / location_variant_id / …
  role?: string,        // "protagonist", "hero product", "backdrop"
  displayName?: string  // nur für Logs, nie für Matching
}
```
Ein Resolver `resolveAssetRef(ref)` liefert `{ referenceImageUrl, voiceId?, canonicalName, sourceTable }`.

### 2. Composer-Szenen: Referenzen ID-basiert speichern
- `composer_scenes` bekommt neben `dialog_turns` (v200) auch `scene_assets jsonb` (Array von `AssetRef`) — Location, Props, Buildings, Style.
- Bereits vorhandene Felder (`characterShots`, `location_id`, …) bleiben, werden aber nur noch **gelesen** um `scene_assets` beim ersten Zugriff zu backfillen (analog zu v201 JIT-Backfill für `dialog_turns`).
- Neuer Shared-Helper `ensureSceneAssetsForScene(scene)` — hard-fail wenn Namen nicht eindeutig auflösbar sind und keine ID vorhanden.

### 3. Migration
- `ALTER TABLE composer_scenes ADD COLUMN scene_assets jsonb NOT NULL DEFAULT '[]'`.
- Backfill-Query: aus `location_id`, `building_id`, `prop_ids`, `style_preset_id` → `scene_assets`.
- Feature-Flag `composer.feature.scene_assets_required` in `system_config` (default `false` bis Verifikation).

### 4. Briefing-Analyse an IDs binden
`briefing-deep-parse` Pass B (Resolver) wird umgestellt:
- Für jede erkannte Person/Ort/Produkt: erst gegen `brand_characters` / `brand_locations` / `brand_props` per ID nachschlagen (wenn ID im Briefing verlinkt), sonst per Slug, sonst per unambiguous name-match.
- Kein Match ⇒ Vorschlag zum Anlegen (unverändert), aber Output enthält **immer** entweder eine bestehende ID oder ein `pendingAsset: { draft }`-Objekt — nie einen freien Namen.
- Der `useApplyProductionPlan`-Hook (unverändert, nur Datenkontrakt) erzeugt zuerst fehlende Assets, dann schreibt er `scene_assets` mit den finalen IDs.

### 5. Edge-Function-Bindings (nachziehen)
- `compose-video-clips`: liest `scene_assets` statt `location_id` etc. und resolved Bild-URLs per `resolveAssetRef`. Fallback auf alte Felder nur wenn `scene_assets=[]`.
- `compose-dialog-segments`: unverändert (v201), aber `logMetadata` bekommt zusätzlich die aufgelösten Cast-Asset-IDs pro Pass, damit Dispatch-Log vollständig ist.
- `render-directors-cut`: liest Locations/Props aus `scene_assets` (falls vorhanden), sonst Legacy-Pfad.

### 6. Guardrails / Logging
- Neuer Log-Marker `v202_asset_registry_bound` mit Zählern (`scene_assets_count`, `resolved_count`, `pending_count`).
- Dispatch-Assertion in `compose-video-clips`: alle in `dialog_turns` referenzierten `characterId` müssen als `AssetRef(type=character)` in `scene_assets` auffindbar sein — sonst hard-fail `v202_asset_registry_mismatch`.

## Nicht in diesem Schritt (Teil B, später)
- Face-Track-Preclip (`scene_face_tracks` Producer/Consumer) für Auto-fahrende / kämpfende Charaktere. Bleibt hinter `composer.feature.face_track_preclip=false` gated bis Registry stabil ist.
- Frontend-Cast&World-UI, Marketplace-Anpassungen, Mention-Library-Umbauten.
- Motion-Studio-eigene Snippets bekommen eigenen `scene_assets`-Layer erst nachdem Composer verifiziert läuft.

## Verifikation
1. Neue Szene aus Briefing generieren → `composer_scenes.scene_assets` enthält Character-, Location- und Prop-IDs.
2. Compose-video-clips-Log zeigt `v202_asset_registry_bound` mit `pending_count=0`.
3. Compose-dialog-segments (v201) läuft unverändert, aber Dispatch-Metadata enthält `scene_assets_summary`.
4. Legacy-Szene ohne `scene_assets` → JIT-Backfill füllt sie, keine Regression.
5. Bewusst kaputter Fall (Location gelöscht) → hard-fail mit klarer Fehlermeldung, kein stiller Weiter-Render.

## Technische Details
- Neue Datei: `supabase/functions/_shared/asset-ref.ts` (Resolver, Types, `ensureSceneAssetsForScene`).
- Migration: `composer_scenes.scene_assets` + Backfill + Index `GIN (scene_assets jsonb_path_ops)`.
- Edits: `compose-video-clips/index.ts`, `compose-dialog-segments/index.ts` (nur Logging), `briefing-deep-parse/index.ts`, `render-directors-cut/index.ts`.
- Memory: neue Datei `mem/architecture/video-composer/v202-asset-registry.md` + `mem/index.md` Update.
- Kein Frontend-Code angefasst.
