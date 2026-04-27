# Fix: "invalid input syntax for type uuid: \"commercial-glossy\""

## Was passiert

Beim Klick auf **Ad Director** im Motion Studio (`/video-composer`) generiert `buildAdScenes.ts` Szenen aus den Story-Frameworks und schreibt den **Slug** des Cinematic-Style-Presets (z. B. `'commercial-glossy'`) in das Feld `appliedStylePresetId`.

Beim Persistieren in Supabase landet dieser String in der Spalte `composer_scenes.applied_style_preset_id` — die ist aber **`UUID REFERENCES motion_studio_style_presets(id)`** (Migration `20260425201506`). Postgres lehnt den String ab → roter Banner + Toast „Fehler beim Speichern", keine Szenen, keine Clips.

Die `cinematicPresetId` ist eine rein clientseitige Slug-ID aus `src/config/cinematicStylePresets.ts` (z. B. `commercial-glossy`, `cinematic-warm`, `documentary`). Sie hat **nichts** mit `motion_studio_style_presets.id` (echte UUIDs aus der DB) zu tun. Die beiden Konzepte wurden beim Bau des Ad Directors versehentlich vermischt.

## Lösung — kleinster sauberer Fix

Trennen, was nicht zusammengehört: Slug-Presets gehören in eine Slug-Spalte, nicht in den UUID-FK.

### 1. DB-Migration
- Neue Spalte `composer_scenes.cinematic_preset_slug TEXT` (nullable, kein FK).
- `applied_style_preset_id` (UUID-FK) bleibt unverändert für echte Motion-Studio-Presets — Ad Director nutzt sie nicht mehr.
- Index optional (nicht nötig für Volumen).

### 2. Frontend
- `src/types/composer.ts` (oder dort wo `ComposerScene` definiert ist): Feld `cinematicPresetSlug?: string` hinzufügen, `appliedStylePresetId` bleibt `UUID | null`.
- `src/lib/adDirector/buildAdScenes.ts` Zeile 178: 
  ```ts
  cinematicPresetSlug: template.cinematicPresetId,
  // appliedStylePresetId weg
  ```
- `src/components/video-composer/VideoComposerDashboard.tsx` Zeilen 269 / 362: Mapping ergänzen
  ```ts
  cinematicPresetSlug: (row as any).cinematic_preset_slug ?? local?.cinematicPresetSlug,
  ```
- Alle Stellen, die `appliedStylePresetId` aus dem Ad-Director-Pfad lesen, auf `cinematicPresetSlug` umstellen (Render-Pipeline / Shot-Director-Suffix-Builder, falls dort konsumiert).
- `SceneCard.tsx` Zeile 676 (manuelle Preset-Auswahl im Composer): bleibt auf `appliedStylePresetId` — **nur** wenn dort echte UUIDs aus `motion_studio_style_presets` kommen. Falls dort ebenfalls Slugs aus `CINEMATIC_STYLE_PRESETS` gewählt werden → ebenfalls auf `cinematicPresetSlug` umstellen. Das verifiziere ich beim Umbau.

### 3. Snake/Camel-Mapping in den Insert/Update-Pfaden
- Wo Szenen in die DB geschrieben werden (`saveScene`, `upsertScenes`, Realtime-Sync), das neue Feld als `cinematic_preset_slug` ergänzen.

### 4. Edge-Functions
- `supabase/functions/spawn-ad-campaign-children` und `analyze-ad-campaign-performance` kurz prüfen — falls sie `applied_style_preset_id` mit Slugs befüllen, auch dort auf `cinematic_preset_slug` umstellen.

### 5. Memory-Update
- `mem://features/video-composer/ad-director-architecture.md`: Notiz ergänzen, dass Ad-Director Cinematic-Presets als Slug in `cinematic_preset_slug` ablegt (nicht in `applied_style_preset_id`).

## Was der User danach sieht
- Ad Director generiert Szenen ohne roten Banner.
- "Clips generieren" funktioniert end-to-end.
- Bestehende manuelle Preset-Auswahl im Composer (echte UUIDs) bleibt unverändert.

## Was NICHT Teil dieses Fixes ist
- Migration alter, fehlerhaft gespeicherter Szenen — laut Fehler ist noch nichts persistiert worden, also nicht nötig.
- Refactor der Cinematic-Preset-Library zu echten DB-Einträgen (größere Stage, separat).
