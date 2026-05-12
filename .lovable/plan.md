## Ziel

Locations, Architecture und Props sollen — wie die **Preset Avatars** — sofort mit echten Vorschau-Bildern sichtbar sein und **direkt** in jede Szene/jeden Prompt übernommen werden können, **ohne sie vorher in die persönliche Library speichern zu müssen**. Charaktere bleiben "save-first" (wegen Identity-Card / Voice / Outfit-Looks). Pro Kategorie bleibt zusätzlich die eigene Library für hochgeladene oder selbst KI-generierte Items.

## Was es schon gibt (nicht neu bauen)

- `system_preset_avatars` + `clone-preset-avatar` + `PresetAvatarGallery` — Muster für Charaktere
- `location_catalog_previews`, `building_catalog_previews`, `prop_catalog_previews` (Tabellen sind da)
- `seed-world-catalog` Edge Function (Admin-only, generiert Vorschau-Bilder)
- `CatalogBrowser` Komponente (zeigt Vorschau-Grid, ruft `onPick`)
- `/library` mit Tabs People · Locations (Environments/Architecture) · Props
- `brand_locations`, `brand_buildings`, `brand_props` + Hooks/Pages für eigene Items
- `UnifiedAssetPicker` in jeder SceneCard (Composer) + `useUnifiedMentionLibrary` (@-Mentions)

## Was fehlt (genau das wird gebaut)

### Stage A — Katalog mit echten Bildern befüllen (alle Nutzer sehen sie sofort)

1. **Specs erweitern** in `seed-world-catalog/index.ts` auf eine breite, kuratierte Auswahl analog Wardrobe-Theme-Packs:
   - **Locations / Environments** (theme_pack:item-pattern):
     `nature:wheat-field`, `nature:beach-sunset`, `nature:forest-path`, `nature:mountain-vista`, `urban:neon-alley`, `urban:rooftop-night`, `urban:cafe-interior`, `urban:subway-platform`, `studio:white-cyc`, `studio:black-stage`, `interior:modern-office`, `interior:loft-apartment`, `interior:warehouse`, `historical:medieval-village`, `historical:ww2-bridge`, `desert:dunes-dawn`, `arctic:icefield`, `tropical:jungle-river`
   - **Locations / Architecture**: `historical:gothic-cathedral`, `historical:roman-temple`, `historical:samurai-castle`, `modern:glass-tower`, `modern:minimal-villa`, `industrial:steel-bridge`, `religious:mosque`, `religious:hindu-temple`, `infrastructure:airport-terminal`, `infrastructure:train-station`
   - **Props**: `vehicle:vintage-car`, `vehicle:motorbike`, `vehicle:leopard-tank`, `vehicle:fighter-jet`, `tech:vintage-camera`, `tech:laptop`, `tech:smartphone`, `furniture:leather-armchair`, `furniture:wooden-desk`, `instrument:electric-guitar`, `instrument:grand-piano`, `weapon:katana`, `weapon:bow`, `tool:hammer`, `tool:typewriter`, `food:espresso-cup`, `food:pizza`, `lifestyle:vinyl-record`, `lifestyle:leather-suitcase`
   - jeweils mit englischem Visual-Prompt (Core-Rule)
2. **Seed ausführen** für `location`, `building`, `prop`. Kein Schema-Change, nur Specs + Lauf.
3. **Architecture-Sub-Tab** im `/library` Locations-Tab pickt jetzt aus `building_catalog_previews` (heute zeigt der Tab nur eigene Buildings) — `CatalogBrowser kind="building"` einbinden.

### Stage B — Direkt in Szenen einsetzen, ohne Library-Save

Heute persistiert `applySceneAssetsToPrompt` die Auswahl als slugifizierte `@mentions`, die `useUnifiedMentionLibrary` auf gespeicherte Brand-Items auflöst. Katalog-Items sind nicht in der Library → würden ins Leere zeigen.

1. **Neue Tabelle `scene_catalog_refs`** (pro Szene/Workspace, leichtgewichtig):
   - `id`, `user_id`, `scene_id` (composer scene), `kind` (`location|building|prop`), `catalog_id` (FK auf `*_catalog_previews`), `slug` (slug aus label), `created_at`
   - RLS: nur Owner (Standard-Pattern)
   - Zweck: erlaubt der Resolver-Pipeline, eine Mention wie `@gothic-cathedral` ohne Library-Eintrag aufzulösen
2. **`useUnifiedMentionLibrary` erweitern**: zusätzlich `location_catalog_previews` / `building_catalog_previews` / `prop_catalog_previews` als virtuelle Locations einlesen (mit `image_url` als `reference_image_url` und Tag `catalog`). Dadurch funktionieren `@catalog-slugs` automatisch in **Composer + Toolkit** ohne weitere Änderungen am Resolver.
3. **`UnifiedAssetPicker` (SceneCard)**: pro Family (Location, Architecture, Props) einen **"Browse Catalog"**-Button neben "Add" → öffnet `CatalogBrowser` als Popover/Dialog. `onPick` slugifiziert das Label und ruft `applySceneAssetsToPrompt` mit dem neuen Slug → identische Persistenz wie heute.
4. **Composer Scene Director Box**: matched jetzt zusätzlich gegen Katalog-Pool, nicht nur User-Library. So findet "ein Soldat fährt mit einem Leopard Panzer über eine Brücke" automatisch `@leopard-tank` + `@steel-bridge` aus dem Katalog.

### Stage C — Library-Seite: Katalog-Kacheln direkt nutzbar

In `/library` (Locations/Architecture/Props Tabs) bekommen die `CatalogBrowser`-Tiles eine sichtbare **"In nächste Szene übernehmen"**-Quick-Action (analog zum bestehenden `composer:incoming-stock-video` sessionStorage-Handoff): legt einen Eintrag in `sessionStorage` ab, den der Composer beim Mount aufnimmt und auf die aktive/neue Szene anwendet. So muss man nichts speichern — ein Klick reicht.

Optional pro Tile bleibt **"Save to my Library"** als sekundäre Aktion (klont in `brand_locations/buildings/props` mit Identity-Extraktion) — für Power-User, die später Variants generieren wollen.

### Stage D — Charakter-Verhalten unverändert

Charaktere bleiben "Save-first" (wegen Identity-Card, Voice, Wardrobe/Pose-Variants, Outfit-Looks). `PresetAvatarGallery` zeigt sie weiter mit "Use this Avatar"-Klon. Keine Änderung.

## Technische Details

```text
Datenfluss (neu für Locations/Buildings/Props):

  Catalog Tile  ──pick──▶  applySceneAssetsToPrompt(@slug)
                            │
                            ▼
                 scene.aiPrompt mit <!--scene-assets-->@slug<!--/-->
                            │
                            ▼
   useUnifiedMentionLibrary  (jetzt auch Katalog-Pool)
                            │
                            ▼
     resolveMentions ──▶ image_url als reference
                            │
                            ▼
       Vidu Q2 / Hailuo i2v / Nano Banana scene anchor
```

- **Keine** Änderung an `resolveMentions`, render-pipeline oder edge-functions außer `seed-world-catalog` (specs).
- **Cache**: Katalog-Query in `useUnifiedMentionLibrary` mit `staleTime: 5min` (Daten ändern sich selten).
- **Slug-Kollisionen**: Library-Items gewinnen über Katalog (selbe Dedupe-Regel wie heute Brand vs Motion-Studio).

## Dateien

**Neu**
- `supabase/migrations/<ts>_scene_catalog_refs.sql` — Tabelle + RLS *(nur falls Stage B.1 wirklich nötig; Stage B.2 allein reicht meist, dann entfällt diese Migration)*
- ggf. `src/components/library-hubs/CatalogPickAction.tsx` — Quick-Action Wrapper

**Editiert**
- `supabase/functions/seed-world-catalog/index.ts` — Specs erweitern (Locations / Architecture / Props)
- `src/hooks/useUnifiedMentionLibrary.ts` — Katalog-Pool als virtuelle Locations einlesen
- `src/components/video-composer/UnifiedAssetPicker.tsx` — "Browse Catalog"-Button pro Family
- `src/pages/Library.tsx` — Architecture-Sub-Tab nutzt `CatalogBrowser kind="building"`; Quick-Action pro Tile
- `src/components/library-hubs/CatalogBrowser.tsx` — `onPick` Default = sessionStorage-Handoff zum Composer
- `supabase/functions/scene-director/index.ts` — Katalog-Pool zusätzlich an `resolveAssets` übergeben

## Out of Scope

- Kein Marketplace, keine 70/30-Revenue-Share Erweiterung auf Locations/Props
- Keine Identity-Extraktion für Katalog-Items (das passiert nur, wenn man "Save to my Library" klickt)
- Keine Variants (Vibes/Props) auf Katalog-Items — die bleiben Library-only
