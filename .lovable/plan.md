# v178 — Universal ID Contract für alle wählbaren Achsen

## Ziel
Jede Wahl, die ein Kunde im Briefing oder Storyboard treffen kann, bekommt eine stabile, lesbare ID statt eines freien Textlabels. Der Parser, das UI und die Render-Pipeline arbeiten ausschließlich mit IDs — Labels sind nur noch Anzeige. Damit verschwinden die aktuellen Symptome (leeres Location-Feld, „Unbenannter Look", fehlende Mimik/Gestik) strukturell.

## Geltungsbereich der IDs

Zwei Klassen — bewusst getrennt, damit nichts kollidiert:

1. **Library-IDs (dynamisch, pro Workspace, UUID)** — gehören in eine DB-Tabelle:
   - `character` → `brand_characters.id`
   - `outfit` → `avatar_outfit_looks.id`
   - `location` → `brand_locations.id`
   - `prop` → `brand_props.id`
   - `building` → `brand_buildings.id`
   - `voice` → ElevenLabs Voice ID (extern, behandelt wie Library-ID)

2. **Catalog-IDs (statisch, global, slug)** — gehören in einen versionierten Katalog im Code:
   - `mimik` (z. B. `mimik.confident`, `mimik.warm_smile`, `mimik.curious`)
   - `gestik` (z. B. `gestik.open_palms`, `gestik.still`, `gestik.point_to_camera`)
   - `blick` (z. B. `blick.to_camera`, `blick.away`, `blick.down`)
   - `energy` (`energy.1` … `energy.5`)
   - `framing` (`framing.wide`, `framing.medium`, `framing.medium_close_up`, `framing.close_up`, `framing.extreme_close_up`, `framing.establishing`)
   - `angle` (`angle.eye_level`, `angle.low`, `angle.high`, `angle.dutch`, `angle.over_shoulder`)
   - `movement` (`movement.static`, `movement.slow_push_in`, `movement.tracking`, `movement.handheld`, `movement.orbit`, …)
   - `lighting` (`lighting.soft_window`, `lighting.golden_hour`, `lighting.neon`, `lighting.high_key`, `lighting.low_key`, …)
   - `style_preset` (genau die 12 Cinematic Style Presets, die es schon im Toolkit gibt)
   - `delivery` / `voice_tone` (`delivery.warm`, `delivery.urgent`, `delivery.calm`, …)
   - `music_energy` (`music.low`, `music.mid`, `music.high`)

Catalog-IDs sind **lowercase, snake_case, namespaced mit Punkt**, z. B. `framing.medium_close_up`. Jede ID hat:
- `id`
- `label_de`, `label_en`
- `synonyms` (Mapping freie KI-Antworten → ID)
- `engine_hint` (englischer Token, der direkt in den AI-Prompt geht)

## Architektur

### 1. Zentrales Katalog-Modul
**Neue Datei:** `src/lib/video-composer/catalog/index.ts`

Exportiert für jede Achse einen `Record<ID, CatalogEntry>` und Helper:
- `resolveCatalogId(axis, raw)` — Fuzzy/Synonym-Match auf eine ID. Fallback: `null`.
- `getCatalogLabel(axis, id, lang)` — für UI.
- `getCatalogPromptToken(axis, id)` — für Prompt-Komposition (immer englisch).
- `listCatalog(axis)` — für Dropdowns.

Single Source of Truth, getypt, lint-bar. Keine DB-Migration nötig.

### 2. Schema-Erweiterung im Production-Plan
**Datei:** `src/lib/video-composer/briefing/productionPlan.ts`

Pro Szene werden ID-Felder ergänzt:
- `performance.mimikId`, `performance.gestikId`, `performance.blickId`, `performance.energyId`
- `shotDirector.framingId`, `angleId`, `movementId`, `lightingId`, `stylePresetId`
- `voiceover.deliveryId`
- `musicCue.energyId`

Die bestehenden freien Stringfelder bleiben als `*Label` erhalten — rein zur Anzeige und als KI-Hint. Der Renderer nutzt ausschließlich `*Id`.

### 3. Parser: alles auf IDs auflösen
**Datei:** `supabase/functions/briefing-deep-parse/index.ts`

- Pass-A bleibt frei (KI darf natürlich antworten).
- Neuer **Pass-C Resolver** (lokal, kein KI-Call): nimmt die freien Werte aus Pass-A/Pass-B und mappt sie via `resolveCatalogId` auf die ID. Bei Synonym-Treffer wird das Label überschrieben mit dem kanonischen Label.
- Wenn kein Match: `*Id = null`, `_unresolved.push({axis, raw})` → UI zeigt einen sichtbaren Warn-Chip.

### 4. Storyboard-Apply
**Datei:** `src/hooks/useApplyProductionPlan.ts`

Schreibt in `composer_scenes` **nur IDs**. Label-Spalten werden für Backwards-Compat parallel befüllt, aber nirgends mehr gelesen. Validierung: jede ID muss entweder im Catalog vorhanden sein oder eine gültige UUID einer existierenden Library-Zeile sein, sonst Insert-Reject mit klarer Fehlermeldung.

### 5. UI: Dropdowns überall einheitlich
**Datei:** `src/components/video-composer/briefing/ProductionPlanSheet.tsx` plus `ScenePerformancePanel.tsx`, `SceneShotDirector*.tsx`.

- Jeder Picker wird auf `listCatalog(axis)` umgestellt.
- Anzeige: kanonisches Label, darunter klein die ID als Mono-Chip (Pro-Look, debug-freundlich).
- Unresolved-Warn-Chip mit „Auto-Resolve"-Button (lokaler Synonym-Match in einem Klick).
- Fan-Out-Logik (eine Auswahl auf alle gleich-benannten Slots aller Szenen anwenden) gilt jetzt einheitlich für jede Achse, nicht nur Location.

### 6. Render-Pipeline
**Dateien:** `supabase/functions/compose-video-clips/index.ts`, `compose-scene-anchor/index.ts`.

`composePromptLayers` zieht den englischen `engine_hint` aus dem Catalog statt freie Strings zu interpolieren. Das stabilisiert die Prompts (kein „warm-smile" vs „warmes Lächeln" mehr) und schützt die Lip-Sync-Pipeline, weil identische Eingaben → identische Outputs.

### 7. Telemetrie + Migrationspfad
- Neue Felder in `parser_meta`: `resolved_ids`, `unresolved_ids`, `catalog_version`.
- Bestehende Projekte: Lazy-Migrate beim Öffnen — ein einmaliger Resolver-Lauf füllt die `*Id`-Felder nach, ohne die Label zu verändern.
- Keine DB-Migration nötig: die ID-Strings werden in den bestehenden JSON-Spalten der Szenen gespeichert.

## Schutz vor Regressions

- **Lip-Sync-Pipeline** wird nicht angefasst — `compose-dialog-segments`, `render-sync-segments-audio-mux`, Sync.so-Webhook bleiben byte-identisch.
- **Catalog ist additiv** — neue IDs brechen keine alten Szenen, weil der Resolver Synonyme behält und alte Label weiter akzeptiert.
- **Type-Safe** — die Catalog-IDs werden als TypeScript-Literal-Unions exportiert, sodass Tippfehler im Code beim Build auffallen.
- **Catalog-Version** — `catalog_version` Konstante; jede Änderung erzwingt eine Re-Resolution beim nächsten Öffnen, sodass keine Szene mit veralteter ID hängen bleibt.
- **Rollout in 3 Wellen**, jede für sich getestet:
  1. Catalog-Modul + Parser-Pass-C, ohne UI-Änderung — nur Schattenfelder befüllen.
  2. UI auf IDs umstellen (Dropdowns), Render-Pipeline weiter auf Label.
  3. Render-Pipeline auf `engine_hint` umstellen.

## Ergebnis nach Umsetzung

- Jede vom Kunden wählbare Eigenschaft (Mimik, Gestik, Blick, Energy, Framing, Angle, Movement, Lighting, Style Preset, Delivery, Music Energy, plus Library-Items) hat eine stabile, sprechende ID.
- Briefings in DE/EN/ES landen über Synonyme deterministisch auf derselben ID.
- „Unbenannter Look", leere Performance-Felder und stille Drift im Render-Prompt sind strukturell ausgeschlossen — nicht mehr nur gepatcht.
- Storyboard und Briefing-Plan zeigen pro Szene exakt dieselbe ID, jede Abweichung ist sofort sichtbar.