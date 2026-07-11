# ID-Audit: Wo laufen Assets wirklich über IDs?

Kurzbefund pro Modul. „ID-only" heißt: Charaktere, Locations, Outfits werden intern per UUID referenziert, Namen sind nur Anzeige.

## 1) Briefing → Production Plan → Storyboard   ✅ ID-only

- `useApplyProductionPlan.ts`: `characterShots[].characterId`, `dialogTurns[].characterId`, `mentioned_character_ids`, `mentioned_location_ids`, `outfitLookId` — alle als geprüfte UUIDs (`PLAN_UUID_RE`, `stripPrefix`), Non-UUIDs werden verworfen.
- `SceneDialogStudio.tsx`: `canonicalDialogTurns` liest ausschließlich `turn.characterId`, resolved über `characters` → `brandCharacterId` → Avatar-Library; Namen sind rein UI.
- Persistenz: `dialog_turns` JSONB, `mentioned_character_ids`, `mentioned_location_ids` — alle ID-basiert.
- Voice-Auswahl: bewusst leer, manuell im Studio (v225).
- **Status:** vollständig ID-verdrahtet.

## 2) Motion Studio (`src/pages/MotionStudio/StudioMode.tsx`)   ⚠️ überwiegend ID, eine Lücke

- Charaktere: `selectedCharacters` mit `c.id`, wird als `mentioned_character_ids` gespeichert und in `briefing.characters[].id` mitgegeben. ✅
- Location: `selectedLocationId` → `mentioned_location_ids: [selectedLocationId]`. ✅
- Snippet-Import: übernimmt `snippet.location_id`. ✅
- **Lücke:** Outfits/Looks werden im Motion-Studio-Modus nicht als `outfitLookId` gesetzt — nur Charakter- und Location-ID gehen ins Scene-Row. Der Composer erzeugt Outfits dann per Fallback/Default. Für echte ID-Only-Parität sollte Motion Studio pro Character den ausgewählten `outfitLookId` mitschicken.

## 3) AI Video Studio / Universal Creator (`src/pages/UniversalCreator/UniversalCreator.tsx`)   ➖ nicht relevant

- Kein Cast/Location-Konzept. Arbeitet mit `BackgroundAsset`, `background_music_id`, Scene-Timings, Subtitles. Es gibt keine Charaktere/Outfits, die per ID verdrahtet werden müssten.
- `background_music_id`, Asset-IDs, Projekt-ID werden konsistent verwendet. ✅
- **Status:** ID-Frage nicht anwendbar; das Modul ist asset-basiert und sauber.

## 4) Picture Studio (`src/pages/PictureStudio.tsx`)   ➖ nicht anwendbar

- Reine Bildgenerierung (`ImageGenerator`, `MagicEditPanel`, `BatchGeneratePanel`, `BackgroundReplacer`). Keine Cast/Location/Outfit-Referenzen im Page-Root.
- Bilder werden aktuell **nicht** aus der Brand-Library gepickt (bekannter, bewusst geskippter Punkt aus früherer Runde). Das ist ein Feature-Gap, keine ID-Verdrahtungslücke.

## Empfehlung (falls du willst, dass ich fixe)

Nur eine echte Lücke:

**A. Motion Studio: `outfitLookId` pro Charakter mitschicken**
- In `StudioMode.tsx` beim Insert von `composer_scenes` zusätzlich ein `character_shots`-JSON mit `{ characterId, outfitLookId }` schreiben (oder in `briefing.characters[].outfitLookId`), damit der Composer die exakt gewählten Looks übernimmt statt Default-Presets zu ziehen.
- Danach zieht `useApplyProductionPlan` den Look automatisch, da die Kette schon ID-basiert ist.

**Optional B. Picture Studio ↔ Brand Library** (früher geskippt): eigener kleiner Punkt, kein ID-Bug.

Sag Bescheid, ob ich (A) umsetzen soll — dann läuft die komplette Composer-Pipeline durchgängig ID-only.
