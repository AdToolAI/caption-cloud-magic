## Cast & World — Unified Library (live)

### Done
- Migration: `brand_buildings`, `brand_props` + 3 catalog tables.
- Hooks: `useBrandBuildings`, `useBrandProps`.
- `useUnifiedMentionLibrary` aggregiert Buildings + Props.
- `/library` Hub mit 3 Top-Tabs **People / Locations / Props**.
- **Locations** hat Sub-Toggle **Environments | Architecture** — Architecture nutzt `brand_buildings` + Building-Catalog (Sacred / Residential / Historical / Fortified [Castles + Bridges] / Modern).
- World-Themes: Buildings erweitert um `fortified:castles` (4) + `fortified:bridges` (4) → ~32 Architecture-Slots.
- Resumable `seed-world-catalog` Edge-Function + `CatalogBrowser` (Admin-Seeder).

### Open
- Stage 3: Zentrale `generate-brand-asset` Edge Function (eigene Hintergründe/Gebäude/Props per Prompt via Nano Banana 2).
- Stage 5: `<UnifiedAssetPicker />` im Composer-Storyboard ersetzt `<CharacterCastPicker />`.
- Sidebar: „Avatars" / „Locations" auf einen einzigen „Library" Eintrag konsolidieren.

