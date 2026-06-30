
# v178 Wave 2 — Briefing→Storyboard Mapping Persistence

Strikt auf den Mapping-Pfad beschränkt. **Keine Änderungen** an `compose-*`, `render-*`, `poll-dialog-shots`, `sync-so-*`, `dialog_shots`, `syncso_*`. v169.1 / v174 / v175 / v176 Invarianten bleiben unangetastet.

## Symptome heute

1. Szene 2 & 3 zeigen keine Auswahlfelder für Sprecher / Outfit / Location — manchmal kommen sie, manchmal nicht.
2. Location bleibt leer obwohl im Briefing "Location@Home Office" steht und "Home Office" in der Library liegt.
3. Outfits zeigen mal `casual`, mal `Unbenannter Look`.

## Root Causes

| # | Symptom | Ursache |
|---|---|---|
| 1 | Szene 2/3 ohne Slots | Scene-Count-Guard padded fehlende Szenen mit `{engine:'broll'}` ohne `cast[]` / `location` zu erben → SceneCard rendert keine Picker weil keine Slot-Templates existieren. |
| 2 | Location leer trotz Match | Pass-B Fuzzy greift nur per Substring; Slug-Mentions (`home-office`, `@home_office`) und Catalog-IDs (`catalog:location:<uuid>`) werden nicht normalisiert. Quick-Create wirkt nur auf 1 Szene statt alle Szenen mit gleichem Mention. |
| 3 | Outfit-Label flackert | Apply-Hook hydratisiert Outfit-Namen aus `mention.name` (raw briefing string) statt aus `avatar_outfit_looks.name`. Wenn der Look-Lookup fehlschlägt, fällt das Label auf "Unbenannter Look" zurück. |

## Patch (4 Dateien, ~ein gemeinsamer Commit)

### 1) `supabase/functions/briefing-deep-parse/index.ts` — Slot-Inheritance beim Padding
Im Scene-Count-Guard (Z. 1076–1088): statt leerer `{engine:'broll'}`-Stubs eine **Template-Szene** klonen.
- Template = letzte Szene mit nicht-leerem `cast[]` (oder Szene 1 als Fallback).
- Geklont werden: `cast` (deep copy, ohne `dialogText`/`voiceoverText`), `location`, `framing`/`shotDirector`-Defaults, `engine`.
- Neue Felder pro Pad-Szene: eigener `index`, `beat` aus `beatRing`, leerer `voiceover.text` + leere `dialogTurns`, `_meta.aiFilled: ['padded_from_template']`.
- So bekommt jede Pad-Szene garantiert mind. 1 Cast-Slot und 1 Location-Slot → ProductionPlanSheet **und** SceneCard rendern Dropdowns deterministisch.

### 2) `supabase/functions/briefing-deep-parse/index.ts` — Location-Resolver härten
Lokaler Fuzzy-Pass nach Pass-B (existierende Schleife) erweitern:
- Normalisierung `normalizeMention(s)`: lowercase, `-`/`_`/Whitespace kollabieren, deutsche Umlaute entfalten.
- Match-Reihenfolge: (a) exakter Slug, (b) Substring beidseitig, (c) Catalog-ID `catalog:location:<uuid>` → direkt resolven aus `locations`-Library via UUID, (d) Catalog-Slug aus `location_catalog_previews`.
- Telemetrie: `parser_meta.location_resolution = { resolved: n, viaSlug, viaSubstring, viaCatalog, stillUnresolved }`.

### 3) `src/hooks/useApplyProductionPlan.ts` — Persistenz hardening
- `stripPrefix` bereits vorhanden; ergänzen um Catalog-Multi-Segment (`catalog:location:<uuid>`, `catalog:outfit:<uuid>`) mit UUID-Regex.
- **Outfit-Label-Stabilisierung**: vor Persist `avatar_outfit_looks` (id, name, avatar_id) one-shot fetchen für alle `outfitLookId` der Plan-Szenen (eine Query, Map). Wenn `mention.name` leer / "Unbenannter Look" / unscharf → durch `look.name` ersetzen. Sonst Briefing-Name behalten.
- **Multi-Scene Location-Fan-Out**: wenn mehrere Szenen denselben unresolved Location-Mention tragen und der User in Szene N "+ Als Location speichern" klickt, soll der neue `locationId` via `onUpdateScenes` an alle Szenen mit identischem normalisiertem Mention propagiert werden. → reine Frontend-Helper-Funktion `applyLocationToMatchingScenes(scenes, mention, locationId)`.

### 4) `src/components/video-composer/briefing/ProductionPlanSheet.tsx` — Quick-Create fan-out
- `handleQuickCreateLocation(sceneIdx, mention)` nach erfolgreicher `createLocation`-Mutation: `applyLocationToMatchingScenes` aufrufen statt nur die eine Szene zu patchen.
- Toast: "Location für N Szenen übernommen".
- Auswahl-Dropdowns in den Slot-Sektionen (`SceneCastSlot`, `SceneOutfitSlot`, `SceneLocationSlot`) bekommen einen sichtbaren Empty-State "Auswählen …" auch wenn `cast[]` leer ist — werden aber dank Patch #1 nur noch in Edge-Cases benötigt.

## Was NICHT angefasst wird (Garantien)

- `compose-dialog-segments`, `compose-video-clips`, `compose-scene-anchor`, `render-sync-segments-audio-mux`, `sync-so-webhook`, `poll-dialog-shots`
- Tabellen: `dialog_shots`, `syncso_*`, `composer_scenes.dialog_voices`, `composer_scenes.character_voice_id`, `clip_*`
- Apply-Hook-Schutzfilter für gerenderte/lipsync-aktive Szenen (`clip_status`, `lipSyncStatus`, `dialogLockedAt`, `lockReferenceUrl`, DB-Probe in `dialog_shots`) bleibt bit-identisch.
- Catalog-Module aus Wave 1 (`src/lib/video-composer/catalog/*`) bleiben Schattenfelder — kein UI-Switch in dieser Wave.

## Telemetrie nach Deploy

`parser_meta` bekommt zusätzlich:
- `padded_scenes_inherited_template: boolean`
- `location_resolution: {...}` (siehe oben)
- `outfit_label_repaired: number` (im Apply-Hook über `console.info`)

## Akzeptanz-Test (manuell, mit deinem letzten Briefing)

1. „3 Szenen × 10s" mit `@Samuel`, `@Casual`, `@Home Office` → alle 3 Szenen zeigen Sprecher + Outfit + Location-Dropdowns, alle drei vorausgewählt.
2. „Total 30s, kein Szenen-Count" → 5 Szenen mit identischem Cast/Location (geerbt).
3. Briefing mit `@home-office` (Slug) → wird auf `Home Office`-Library-Eintrag resolved.
4. Bestehende, bereits gerenderte Szene mit Lipsync → wird vom Apply-Hook **nicht** überschrieben (DB-Probe greift).

## Rollback

Alle 4 Änderungen sind isoliert. Bei Problemen: einzeln revert; Schattenfelder aus Wave 1 bleiben intakt.
