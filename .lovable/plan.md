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
- Stage 3 ✅ — `generate-world-asset` Edge Function (Nano Banana 2 → brand-locations Bucket → `extract-location-identity` → Insert in `brand_locations`/`brand_buildings`/`brand_props` mit Identity-Card). „Generate with AI" Button im Library-Hub für alle drei Kinds; Assets erscheinen automatisch via `useUnifiedMentionLibrary` in Toolkit + Composer + Vidu/Hailuo i2v.

- Stage 4 ✅ — `@-Mention` System voll integriert: `mentionParser` matcht jetzt slugifizierte Namen (`@gothic-cathedral` → "Gothic Cathedral"), Buildings/Props bekommen eigene Sections im resolved Prompt (`Architecture:`, `Props:`), Autocomplete-Dropdown zeigt Building/Prop-Badges + Icons. Reference-Image wird automatisch in Toolkit + Composer (via `composePromptLayers`) injiziert.

### Open
- Stage 5: `<UnifiedAssetPicker />` im Composer-Storyboard ersetzt `<CharacterCastPicker />`.
- Sidebar: „Avatars" / „Locations" auf einen einzigen „Library" Eintrag konsolidieren.

