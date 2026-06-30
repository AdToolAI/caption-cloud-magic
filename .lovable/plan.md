# Wave 3 — UI-Switch auf Catalog-IDs (Universal ID Contract)

Strikt Mapping/UI. **Keine Änderungen** an `compose-*`, `render-*`, `poll-dialog-shots`, `sync-so-*`, `dialog_shots`, `syncso_*`, `composer_scenes.dialog_voices`, `composer_scenes.character_voice_id`. v169.1 / v174 / v175 / v176 Invarianten bleiben unangetastet.

## Ziel

Wave 1 hat Schattenfelder produziert (`mimicId`, `gestureId`, `gazeId`, `cameraId`, `lightingId`, `framingId`, `angleId`, `movementId`). Wave 3 macht sie sichtbar und persistierbar: Jede vom User wählbare Achse bekommt eine geordnete, stabile ID im Storyboard — kein Free-Text-Drift mehr zwischen Briefing-Plan und Szene.

## Was sichtbar wird

Im **ProductionPlanSheet** (Briefing-Plan-Review) und in der **SceneCard** (Storyboard):

| Achse | Quelle | ID-Format |
|---|---|---|
| Mimik | `catalog/performance.ts` | `catalog:mimic:<slug>` |
| Gestik | `catalog/performance.ts` | `catalog:gesture:<slug>` |
| Blick | `catalog/performance.ts` | `catalog:gaze:<slug>` |
| Framing | `catalog/shot.ts` (49 Optionen) | `catalog:framing:<slug>` |
| Angle | `catalog/shot.ts` | `catalog:angle:<slug>` |
| Movement | `catalog/shot.ts` | `catalog:movement:<slug>` |
| Lighting | `catalog/shot.ts` | `catalog:lighting:<slug>` |
| Kamera/Lens | `catalog/shot.ts` | `catalog:lens:<slug>` |

Library-Felder (Character, Outfit, Location) bleiben wie in Wave 2 — UUID statt Catalog-Slug.

## Patch (5 Dateien)

### 1) `src/lib/video-composer/catalog/index.ts` — Single-Source-of-Truth
Export einer `CATALOG_REGISTRY` Map mit Label + Order + Group pro ID. Bereits in Wave 1 angelegt, hier nur konsolidiert + Sortierung verifiziert (Hook → Pain → Reveal → Proof → CTA Reihenfolge bleibt, innerhalb Achsen nach Häufigkeit/Cinematic-Logik).

### 2) `src/components/video-composer/briefing/ProductionPlanSheet.tsx`
- **ScenePerformancePanel** (`mimicId`/`gestureId`/`gazeId`): Dropdowns binden an `catalog:*` IDs aus Wave 1, zeigen Label aus Registry, behalten 3-State-Chip (`AI ⚡` / `manuell` / `leer`).
- **SceneShotDirectorPanel** (neu hinzufügen falls fehlt): Framing/Angle/Movement/Lighting/Lens als 5 Dropdowns mit derselben Logik.
- Persistenz: `onUpdateScenes` patcht **nur** die `*Id`-Felder, die Free-Text-Spiegel-Felder (`mimic`, `gesture`, ...) werden bei Save automatisch aus der Registry hydratisiert → SceneCard zeigt weiterhin Klartext.

### 3) `src/components/video-composer/SceneCard.tsx`
- Beim Render eine `useCatalogLabel(id)`-Helper-Hook nutzen, der den Label aus `CATALOG_REGISTRY` zieht. Fallback: bestehender Free-Text.
- Editor-Dropdowns (Mimik/Gestik/Blick/Shot-Director) lesen/schreiben jetzt IDs statt Strings.

### 4) `src/hooks/useApplyProductionPlan.ts`
- Bereits in Wave 2 gehärtet für Library-IDs. Hier ergänzen: Catalog-IDs werden **1:1** persistiert (nicht ge-stripped), `stripPrefix` greift nur bei `catalog:character|outfit|location:<uuid>`.
- Telemetrie: `console.info('[apply-plan] catalog_ids_persisted', { mimic, gesture, gaze, framing, angle, movement, lighting, lens })`.

### 5) `supabase/functions/briefing-deep-parse/index.ts`
- Pass-C Resolver (Wave 1) ergänzen: Wenn das Modell statt einer ID einen Free-Text liefert (`mimic: "freundlich"`), versuche Fuzzy-Match gegen `CATALOG_REGISTRY` Label/Alias. Bei Treffer `mimicId` setzen.
- Telemetrie in `parser_meta.catalog_resolution = { resolvedFromLabel, resolvedFromAlias, stillFreeText }`.

## Garantien (Pipeline 0-Impact)

- Keine Schreibzugriffe auf Render-/Lipsync-Tabellen.
- Keine Änderung der Prompt-Generierung in `compose-video-clips` oder `compose-scene-anchor` — die ziehen weiterhin die Free-Text-Spiegel-Felder. Wave 3 garantiert nur, dass diese Spiegel-Felder **konsistent** aus Registry-Labels stammen.
- Apply-Hook-Schutzfilter (clip_status / dialog_shots-Probe) bleibt bit-identisch.
- Catalog-Module (`src/lib/video-composer/catalog/*`) bekommen keine neuen Achsen — nur UI-Sichtbarkeit.

## Akzeptanz-Test

1. Briefing „Samuel lacht herzlich" → ScenePerformancePanel zeigt `Mimik: Lächeln (warm)` mit `⚡ AI`-Chip.
2. User wählt manuell `Mimik: Konzentriert` → Chip wechselt auf `manuell`, persistiert in DB als `catalog:mimic:focused`.
3. Render-Klick auf Szene → Prompt enthält weiterhin Free-Text `"focused expression"` (aus Registry-Label hydratisiert), Lipsync-Pipeline läuft identisch wie heute.
4. Plan-Re-Apply auf bestehende Szene mit gerendertem Clip → Szene bleibt unverändert (Schutzfilter greift).

## Telemetrie nach Deploy

- `parser_meta.catalog_resolution`
- `apply-plan catalog_ids_persisted`
- SceneCard-Chip-Counts via PostHog Event `composer_catalog_id_select`

## Rollback

Pro Datei isoliert revertierbar. Bei Issues: Dropdown-Bindings auf Free-Text zurück, Registry bleibt als Schattenfeld bestehen.

## Nicht in Wave 3

- Voice-Pool-Erweiterung (separater Plan)
- Performance-Achsen erweitern (neue Mimik-Optionen) — kommt in Wave 4 falls gewünscht
- Catalog-Übersetzungen (DE/EN/ES) — Wave 4
