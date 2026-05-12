## Cast & World — Unified Library (live)

### Done in this iteration
- **Migration**: `brand_buildings`, `brand_props` + 3 catalog tables (`location_/building_/prop_catalog_previews`) mit RLS.
- **Hooks**: `useBrandBuildings`, `useBrandProps` (Klone von `useBrandLocations`).
- **`useUnifiedMentionLibrary`** aggregiert jetzt zusätzlich Buildings + Props (mit Tag `building` / `prop`).
- **Neue Page `/library`** mit 4 Tabs (People / Locations / Buildings / Props), Upload-Dialog, Identity-Card-Extraktion via existierender `extract-location-identity`-Edge-Function.
- **Routen**: `/avatars`, `/avatars/:id`, `/locations` bleiben funktional; `/library` ist die neue Hub-Page.

### Open for next stages
- **Stage 2**: Theme-Pack-Catalog-Seeder (`seed-location-catalog`, `seed-building-catalog`, `seed-prop-catalog`) — analog Wardrobe.
- **Stage 3**: „Generate your own"-Flow via Nano Banana 2 (zentrale `generate-brand-asset` Edge Function).
- **Stage 5**: `<UnifiedAssetPicker />` im Composer-Storyboard ersetzt heutigen `<CharacterCastPicker />` mit 4 Tabs.
- **Sidebar**: „Avatars" / „Locations" Einträge auf einen einzigen „Library" Eintrag konsolidieren.
