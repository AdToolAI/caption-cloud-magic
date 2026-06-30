# Stand heute (ehrlich)

Das Catalog-ID-System ist **teilweise** integriert, aber noch **nicht vollständig verdrahtet**:

| Ebene | Status |
|---|---|
| Catalog-Registry (`src/lib/video-composer/catalog/index.ts`) | ✅ vorhanden |
| Pass-C Resolver im Parser (`briefing-deep-parse`) | ✅ produziert `mimicId/gestureId/gazeId/framingId/angleId/movementId/lightingId/stylePresetId` |
| Apply-Hook (`useApplyProductionPlan`) | ✅ persistiert Shadow-Fields 1:1 |
| Briefing-Plan-Review (`ProductionPlanSheet`) | ✅ zeigt `CatalogChip` mit ⚡-Badge |
| **Storyboard-Editor `ScenePerformancePanel`** | ❌ liest/schreibt weiterhin Free-Text (`mimic`, `gesture`, `gaze`) — kein ID-Binding |
| **Storyboard-Editor `SceneShotDirectorPanel`** | ❌ nutzt legacy `ShotSelection` über `@/config/shotDirector`, keine `catalog:*` IDs |
| **`SceneCard` Storyboard-Anzeige** | ❌ keine `useCatalogLabel`-Auflösung; zeigt Free-Text |
| Telemetrie `parser_meta.catalog_resolution` | ✅ vorhanden |
| Telemetrie `apply-plan catalog_ids_persisted` | ✅ |
| PostHog `composer_catalog_id_select` | ❌ noch nicht emitted |

Konsequenz: IDs sind heute reine **Lese-Spiegel im Briefing-Sheet**. Sobald der User im Storyboard etwas ändert, geht die ID verloren (Free-Text überschreibt). Drift zwischen Briefing-Plan und Szene kann wieder entstehen.

# Was Wave 3.1 macht (Mapping/UI-only)

Strikt UI — **kein** Eingriff in `compose-*`, `render-*`, `poll-dialog-shots`, `sync-so-*`, `dialog_shots`, `composer_scenes.dialog_voices`, `character_voice_id`. v169.1 / v174 / v175 / v176 / v178 Invarianten unangetastet.

## 1) `ScenePerformancePanel.tsx`
- Dropdown-`value` an `scene.mimicId / gestureId / gazeId` binden (Fallback: Free-Text→ID via `CATALOG_REGISTRY` Label-Match).
- `onChange` schreibt **beide**: `*Id` (Catalog-Slug) und `*` (Free-Text aus Registry-Label) → Render-Prompt bleibt bit-identisch.
- 3-State-Chip: `⚡ AI` (Pass-C), `manuell` (User-Edit), `leer`.
- Optionen-Quelle: `CATALOG_REGISTRY.mimic/gesture/gaze` (sortiert nach `order`).

## 2) `SceneShotDirectorPanel.tsx`
- 5 Achsen (Framing/Angle/Movement/Lighting/Lens) auf Catalog-IDs umstellen.
- Mapping-Tabelle legacy `ShotSelection` ↔ `catalog:framing|angle|movement|lighting|lens:<slug>` in einer kleinen Adapter-Datei `src/config/shotDirectorCatalogAdapter.ts` (eine Datei, ein Map-Objekt, keine Logik-Änderung am ShotDirector selbst).
- Free-Text-Spiegel weiterhin synchron schreiben (`shotDirector.framing` etc.) → Prompt-Composer (`composePromptLayers`) unverändert.

## 3) `SceneCard.tsx`
- Neue Helper-Spalte „Achsen": kompakte `CatalogChip`-Reihe (Mimik · Gestik · Blick · Shot) via `useCatalogLabel`.
- Fallback auf Free-Text wenn ID fehlt.

## 4) `useApplyProductionPlan.ts`
- `stripPrefix` whitelistet jetzt explizit `catalog:character|outfit|location:<uuid>` → wird auf UUID reduziert.
- `catalog:mimic|gesture|gaze|framing|angle|movement|lighting|lens|style_preset:<slug>` → **1:1 erhalten** (kein Strip).
- Hydration: vor DB-Insert Free-Text-Spiegel-Felder aus `CATALOG_REGISTRY` neu setzen, falls `*Id` vorhanden aber Free-Text leer → garantiert konsistente Prompts.

## 5) PostHog
- `composer_catalog_id_select { axis, id, source: 'ai'|'manual' }` aus den 3 Panels emitten.

## 6) Doku
- `mem/architecture/video-composer/wave3-1-id-binding.md` mit der Adapter-Map und Invarianten-Checkliste.

# Garantien (Pipeline 0-Impact)
- Prompt-Generierung (`composePromptLayers`, `compose-video-clips`, `compose-scene-anchor`) liest weiterhin **nur** Free-Text-Spiegel-Felder.
- Keine Schreibzugriffe auf Render-/Lipsync-Tabellen.
- Apply-Hook-Schutzfilter (rendered scenes) bleibt aktiv.
- Catalog-Achsen werden nicht erweitert — nur sichtbar/persistent gemacht.

# Akzeptanz-Test
1. Briefing „Samuel lacht herzlich" → Plan-Sheet: ⚡ `Mimik: Lächeln (warm)`. Apply → Storyboard ScenePerformancePanel zeigt selben Wert, ID `catalog:mimic:warm_smile` in DB.
2. User wechselt im Editor auf „Konzentriert" → Chip `manuell`, DB-Update auf `catalog:mimic:focused`, Free-Text-Spiegel `mimic = "focused expression"`.
3. Render-Klick → Prompt identisch zu heute. Lipsync-Pipeline läuft durch.
4. Re-Apply auf gerenderte Szene → Schutzfilter greift, keine Überschreibung.

# Nicht enthalten
- Voice-Pool / Performance-Achsen erweitern
- Catalog-Übersetzungen (DE/EN/ES) der Labels
- Migration alter `composer_scenes` ohne IDs (Backfill optional in Wave 3.2)

# Rollback
Pro Datei isoliert revertierbar (5 Dateien). Bei Issues: Bindings auf Free-Text zurück, Registry bleibt als Shadow.
