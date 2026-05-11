## Recherche-Zusammenfassung — Was Artlist Studio anders macht

Aus den offiziellen Artlist-Quellen (artlist.io/studio, help.artlist.io, artlist Blog Walkthrough) destilliert sich Artlist Studio auf **9 visuelle Patterns**, die uns aktuell fehlen. Wir haben die **Logik** für fast alles schon (Shot Director: 49 Optionen in 6 Kategorien, Brand Characters, Locations, Composer, Toolkit) — aber alles ist Text + Dropdowns. Artlist macht **dieselbe Logik komplett visuell**.

| # | Artlist Pattern | Status bei uns |
|---|---|---|
| 1 | **Visuelle Preset-Picker** statt Dropdowns (Lighting/Angle/Movement/Lens/Camera als Bild-Karten) | Dropdowns mit Text |
| 2 | **Character Multi-Angle Sheet** (Frontal CU, ¾ Left, Full-Back, Side Profile) | Nur 1 Hero-Shot |
| 3 | **Location Library** mit Mood-Thumbnails | Existiert nur textuell |
| 4 | **@-Mention Picker** mit Portrait-Thumbnails | Existiert (textbasiert) |
| 5 | **Reference-Image Modus**: „Style Reference" vs „Match Exactly" Toggle | Fehlt komplett |
| 6 | **Frame-from-Video Continue** (Pause → Frame picken → next shot start) | Existiert nur teilweise (FramePickerOverlay) |
| 7 | **Character/Location Capture** aus jedem generierten Bild | Fehlt |
| 8 | **Auto-Prompt Switch** (Free-form ↔ Structured) mit Auto-Rewrite | Existiert nur als Optimizer |
| 9 | **Studio-Shell**: linkes Directing-Panel + rechte Timeline | Tab-basierter Composer |

Das Ganze umsetzen heißt: **eine wiederverwendbare visuelle Schicht** bauen + ein paar gezielte Workflow-Erweiterungen — nicht 9 Module umschreiben.

---

## Die Strategie: ein „Visual Studio Layer", einmal gebaut, überall genutzt

Statt jeden Studio einzeln umzubauen, bauen wir **6 gemeinsame Bausteine** und ziehen sie überall ein. Damit erreichen wir Artlist-Niveau in einem Sweep statt in 9 Refactors.

```
┌─ Visual Studio Layer (neu, shared) ───────────────────────┐
│  PresetGrid · CharacterCard · LocationCard · MentionPicker │
│  ReferenceImageDropzone(mode toggle) · FrameContinueDialog │
└───────────┬───────────────────────────────────────────────┘
            │ konsumiert von
   ┌────────┼────────┬────────┬────────┬────────┐
   ▼        ▼        ▼        ▼        ▼        ▼
 Avatars  Locations  Toolkit  Composer  Picture  Director's
                                        Studio   Cut
```

---

## Stage 1 — Asset-Foundation (AI-generierte Preset-Thumbnails)

**Einmaliger Build-Step**: für jede der 49 Shot-Director-Optionen + 12 Cinematic Style Presets + 9 Lighting Moods = ~70 normalisierte Thumbnails generieren (jeweils dieselbe neutrale Szene, nur das Variabel-Element ändert sich). Genau wie Artlists Lighting-Grid (Golden Hour / Blue Hour / Neon / Rim / Diffused).

- **Tool**: `imagegen--generate_image` (model `fast`), 512x512, einheitliche Basis-Szene („medium-shot of a man in dark jacket on a concrete corridor")
- **Output**: `src/assets/studio-presets/{category}/{id}.jpg` — als ES6-Imports in den Konfig-Dateien referenziert
- **Brand-konsistent**: gleiche Person/Location pro Kategorie, nur die variable Achse ändert sich → der User sieht **sofort** den Unterschied zwischen „Low Angle" und „High Angle" oder „Golden Hour" und „Neon"
- **Konfig-Erweiterung**: `ShotOption` bekommt `previewImage: string` (Pflicht)
- ~70 Generations × ~5s = einmalig 6-7 min Build

**Why first**: ohne diese Assets kann das ganze Visual Layer nicht aufgebaut werden — alles andere baut darauf auf.

---

## Stage 2 — Shared Visual Layer

Sechs neue Komponenten unter `src/components/studio-visual/`:

1. **`PresetGrid<T>`** — generischer 3-4-Spalten-Grid für Optionen mit `previewImage` + `label` + Selection-State + Hover-Tooltip mit Description. Ersetzt überall: Lighting/Angle/Movement/Framing/Camera/Lens/StylePreset Dropdowns.

2. **`CharacterCard`** — Karte mit Hero-Pose als Hintergrund, Name + Voice-Indikator unten, Hover zeigt Voice-Wave. Wird in Library, MentionPicker, Composer Cast-Slot benutzt.

3. **`LocationCard`** — analog, Mood-Thumbnail + Lighting-Notes-Chip.

4. **`MentionPicker`** — visuelles Popover für `@`-Trigger: Tabs „Characters / Locations / Snippets", jede Karte mit Thumbnail. Ersetzt aktuelle reine Text-Mention-Liste.

5. **`ReferenceImageDropzone`** mit **Style/Match-Toggle** (Pill-Switch wie Artlist). Persistiert pro Slot in `metadata.reference_mode = 'style' | 'exact'`. Wird in Avatar-Editor, Composer-Scene, Picture-Studio, AI-Video-Toolkit benutzt.

6. **`FrameContinueDialog`** — nimmt einen Clip-URL, Scrubber + „Capture Frame" Button. Output → `composer-frames` Bucket → kann sofort als nächste Szene-Reference genutzt werden („Continue from this frame"). Wir haben den `FramePickerOverlay` schon — der wird darin gewrapped + um den „Send to next scene"-Flow ergänzt.

---

## Stage 3 — Library-Hubs als visuelles Rückgrat

Zwei Pages werden zur **Bühne**, von der aus die Studios konsumieren:

- **`/avatars`** (Brand Characters, schon umbenannt): Library wird ein 4-Spalten-Card-Grid. Detail-Page bekommt — wie in Avatar-Plan vorgeschlagen — **PoseSheetGrid** (4 Winkel) + **WardrobeGrid** + **VibeStrip**. Der „Identity Lock"-Default ist schon (Stage A erledigt). Multi-Angle Generation via neue Edge-Function `generate-avatar-poses` (Nano Banana 2 mit Identity-Lock-Suffix).

- **`/locations`**: bekommt analoge Library-Cards + Detail-Page mit **TimeOfDayGrid** (5 vordefinierte Mood-Variants pro Location: Golden Hour / Blue Hour / Overcast / Night / Neon) → Edge-Function `generate-location-vibes`. Damit hat der User pro Location 5 fertig generierte Look-Varianten zum Auswählen statt textueller „lighting_notes".

- **Library-Capture**: in jeder Studio-Generation (Picture Studio, Toolkit, Composer Anchor) erscheint nach Generation ein „Capture as Character / Capture as Location" Mini-Action — speichert das Bild + Auto-extrahierten Identity Card via Gemini Vision (haben wir schon in `extract-character-identity`) als neuen Library-Eintrag.

---

## Stage 4 — Studio-Integrationen

Mit den 6 Bausteinen + den neuen Library-Hubs ziehen wir sie in die existierenden Studios ein. **Reine Composition** — kein Logik-Refactor.

- **AI Video Toolkit** (`/ai-video-toolkit`): `ShotDirectorPanel` rendert `PresetGrid` für jede der 6 Achsen. `CinematicStylePresets` werden visuelle Karten. `@-Mention` nutzt `MentionPicker`. Reference-Upload bekommt Style/Match-Toggle.
- **Video Composer** (`/video-composer`): `SceneShotDirectorPanel` und `BriefingTab` ersetzen Dropdowns durch `PresetGrid`. Cast-Slots werden `CharacterCard`s. „Continue from frame" Button auf jedem fertigen Clip → `FrameContinueDialog` → spawnt neue Szene mit `referenceImageUrl`.
- **Picture Studio**: Style-Reference Slot bekommt Style/Match-Toggle (Brand-Kit Auto-Inject schon vorhanden).
- **Director's Cut**: Filter-Library (20 Filter, 10 Color-Gradings) wird visuelle Karten-Grid statt Liste — gleicher `PresetGrid`.
- **Music Studio**: Tier-Auswahl wird visuelle Karten mit Wellenform-Hintergrund (statt 5er-Liste).
- **Sidebar/Hub**: Module-Tiles im HubPage zeigen jeweils 1 echtes Beispiel-Asset des Users (letzter Avatar / letzte Location / letzte Generation) statt generischer Icons → „my Studio" feel.

---

## Stage 5 — Auto-Prompt & Structured Mode (das „Director's Brain")

Artlists „Free-form / Structured"-Switch im Prompt-Feld. Wir haben den `Video Prompt Optimizer` schon — der bekommt:

- **Toggle** im Prompt-Editor: **Free-form** (textarea) ↔ **Structured** (6 Felder: Subject / Location / Action / Composition / Style / Mood)
- **Auto-Prompt Button**: ruft Lovable AI Gateway (`google/gemini-3-flash-preview`, kein neuer Key) → wandelt Free-form → Structured oder umgekehrt → auto-fill der `Shot Director`-Slots wo möglich (Gemini Tool-Calling mit dem `ShotOption`-Schema)
- **Visuelle Live-Preview**: rechts neben dem Editor wird der zusammengebaute Final-Prompt + die ausgewählten Preset-Thumbnails als „Director's Card" gerendert → der User SIEHT was er gerade direkt

---

## Tech-Details (kompakt)

**Neue Tabellen** (1 Migration):
```
avatar_pose_variants(avatar_id, pose enum, image_url, sort)
avatar_wardrobe_items(avatar_id, label, thumbnail_url, prompt_hint)
location_vibe_variants(location_id, vibe enum, image_url, sort)
ALTER reference image slots: + reference_mode text DEFAULT 'exact'
```

**Neue Edge Functions** (alle Lovable AI Gateway, kein neuer Key):
- `generate-avatar-poses` — 4 Winkel parallel mit Identity-Lock-Suffix (Stage-A-konform)
- `generate-location-vibes` — 5 Time-of-Day-Varianten parallel  
- `auto-prompt-rewriter` — Free-form ↔ Structured via Tool-Calling

**Geänderte Files** (Sweep, ~25 Komponenten):
- `src/config/shotDirector.ts`, `cinematicStylePresets.ts` → `previewImage`-Imports
- `src/components/ai-video/ShotDirectorPanel.tsx` → `PresetGrid`
- `src/components/video-composer/{SceneShotDirectorPanel,BriefingTab,CharacterCastPicker}.tsx` → visuelle Karten
- `src/pages/{BrandCharacters,Locations}.tsx` → Library-Card-Grid + Detail-Routes
- Picture Studio + Director's Cut Filter → `PresetGrid`
- Mention-Editor → `MentionPicker`

**Build-Asset-Pipeline**: ein Node-Script in `scripts/generate-studio-presets.ts` ruft `imagegen` für alle ~70 Presets — wird einmalig + bei neuen Optionen erneut gefahren.

---

## Was wir ehrlich NICHT versuchen

- **Echte 3D-Modelle** (GLB/Three.js) — Wochen-Aufwand. Wir liefern „2.5D" über 4-Pose-Sheets pro Avatar + 5-Vibe-Variants pro Location. Visuell für den Kunden gleich wertvoll.
- **Realtime-Outfit-Editor mit Brush** — Phase-2-Kandidat (Picture Studio Magic Edit kann das schon, müsste nur in Avatar-Detail eingebettet werden).
- **Eigene Foundation Models** wie Artlist Original 1.0 — wir nutzen die besten Replicate-Modelle, das ist OK.

---

## Reihenfolge & geschätzter Scope

1. **Stage 1** — Asset-Pipeline + Generation der 70 Preset-Thumbnails *(60 min, davon 7 min reines Image-Gen)*
2. **Stage 2** — Visual Layer Komponenten *(~1 große Implementierungsrunde)*
3. **Stage 3** — DB-Migration + 3 Edge Functions + Avatar/Location Detail-Pages *(~1 Runde)*
4. **Stage 4** — Studio-Integrationen (Toolkit, Composer, Picture Studio, Director's Cut, Music) *(~1 Runde)*
5. **Stage 5** — Auto-Prompt Switch + Structured Mode *(~1 Runde)*

Insgesamt **~4-5 Runden**, danach ist die Plattform visuell auf Artlist-Niveau und in Punkten **darüber** (Identity-Lock-Strict by default, 11 statt ~3 Video-Provider, Music + Composer + Director's Cut in einer Suite — was Artlist nicht hat).

Sag Bescheid, ob ich mit **Stage 1** (Asset-Pipeline + erste 70 Thumbnails generieren) starte oder ob du Reihenfolge / Scope anpassen willst.
