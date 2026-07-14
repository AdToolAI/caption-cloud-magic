## Ziel
Überall (Motion Studio, AI Video Studio, Composer, Mention-Library, Briefing-Apply) dürfen nur noch Charaktere abrufbar sein, die aus **Cast & World** stammen und eine echte `brand_characters.id` (UUID) besitzen. Alle Legacy-Avatar-Quellen werden entfernt.

## Legacy-Quellen (Ist-Zustand)
Aus der Analyse existieren drei parallele Quellen, die die „alte Avatar-Logik" tragen:

1. **`system_preset_avatars`** — Preset-Galerie auf `/brand-characters` (`PresetAvatarGallery` + `usePresetAvatars` + `clonePreset`).
2. **`motion_studio_characters`** — legacy Motion-Studio-Library (`useMotionStudioLibrary`), wird via `useUnifiedMentionLibrary` in Composer/AI-Video-Picker gemischt.
3. **`catalog:character:*`** Mentions ohne Brand-Bridge — erscheinen im @-Picker, führen zu `mentionToCastRef` warnings und Kling/Omni-Slots ohne resolvbare UUID.

Kanonisch bleibt: **`brand_characters`** (+ `avatar_outfit_looks` als Outfit-Layer darauf, weiterhin an dieselbe `brand_characters.id` gebunden).

## Änderungen

### 1) Preset-Avatar-Bibliothek entfernen
- `src/pages/BrandCharacters.tsx`: Import + Render von `PresetAvatarGallery` entfernen.
- Löschen: `src/components/brand-characters/PresetAvatarGallery.tsx`, `src/hooks/usePresetAvatars.ts`.
- Keine DB-Migration in diesem Schritt — die Tabelle `system_preset_avatars` bleibt (read-only Legacy) unangetastet, um Fremdschlüssel/Historie nicht zu brechen; sie ist danach von der UI nicht mehr erreichbar.

### 2) Motion-Studio-Legacy-Characters aus der Mention-Library werfen
- `src/hooks/useUnifiedMentionLibrary.ts`: `msChars` NICHT mehr in `characters` mergen. Locations (`msLocs`) bleiben unberührt (dies ist Cast & World / Motion Studio Location-Kanon, kein Charakter).
- `useMotionStudioLibrary` selbst bleibt bestehen, wird aber für Character-Nutzung stillgelegt: alle Consumer, die Characters lesen (siehe Grep), lesen ausschließlich aus `brand_characters` (`useBrandCharacters`).

### 3) Katalog-Charaktere ohne Brand-Bridge ausblenden
- `useUnifiedMentionLibrary.ts`: Bei `catalogChars` nur Rows aufnehmen, deren `adoptedId` (Brand-Bridge auf `brand_characters.id`) gesetzt ist. Katalog-Einträge ohne Adoption sind nicht mehr auswählbar (verhindert das bekannte `mentionToCastRef` "no brand bridge" Warning und leere Kling-Omni-Slots).
- `mentionToCastRef`: Kein Fallback mehr für `kind:'catalog'` ohne `baseCharacterId` — bereits vorhanden, wird durch (3) faktisch tot.

### 4) Cast-Picker im AI Video Studio konsolidieren
- `ToolkitCastPicker` / `ToolkitCastWorldPicker` / Kling-Omni Speaker-Dropdown (`ToolkitGenerator.tsx`): Quelle strikt auf `brand_characters` (via `useBrandCharacters`) umstellen. Character-Optionen aus `motion_studio_characters` fallen weg — Locations aus Motion Studio bleiben.

### 5) Guardrails
- `mentionToCastRef`: Warning zu Error-Log verschärfen, wenn eine Nicht-UUID durchkommt (defensive; sollte nach (2)+(3) nie feuern).
- `PLAN_UUID_RE`-Filter in `useApplyProductionPlan` bleibt aktiv.

## Nicht Teil dieses Plans
- Keine Änderungen an `brand_characters`, `avatar_outfit_looks`, `character_shots`.
- Keine DB-Migrationen (keine Drops auf `system_preset_avatars` / `motion_studio_characters`, um Datenhistorie und FKs unangetastet zu lassen).
- Keine Änderung an Backend-Edge-Functions — der Server erwartet bereits `brand_characters.id` (v201/v202).
- Cast & World Locations aus `motion_studio_locations` bleiben, da eigenständiger Kanon (nicht Teil der „Avatar"-Legacy).

## Betroffene Dateien
- `src/pages/BrandCharacters.tsx` (Preset-Sektion entfernen)
- `src/components/brand-characters/PresetAvatarGallery.tsx` (löschen)
- `src/hooks/usePresetAvatars.ts` (löschen)
- `src/hooks/useUnifiedMentionLibrary.ts` (msChars raus, catalog nur mit Bridge)
- `src/components/ai-video/ToolkitCastPicker.tsx` + `ToolkitCastWorldPicker.tsx` (Quelle vereinheitlichen)
- `src/components/ai-video/ToolkitGenerator.tsx` (Kling-Omni Speaker-Dropdown nur Brand)
- `src/lib/video-composer/mentionToCastRef.ts` (Guardrail verschärfen)

## Verifikation
- Mention-Picker in Composer + AI Video Studio zeigen ausschließlich Brand-Characters + deren Outfit-Looks.
- `/brand-characters` zeigt keine Preset-Galerie mehr.
- Kling-Omni Speaker-Dropdown enthält nur echte Brand-Character-UUIDs.
- Build grün; keine offenen Imports auf `usePresetAvatars` / `PresetAvatarGallery`.
