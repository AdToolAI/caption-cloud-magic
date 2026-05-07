
# Artlist-Parität – Fortschritt

## ✅ Stage 5 – Camera & Lens Picker (DONE)
- `shotDirector.ts`: 6 Kameras + 7 Linsen, neue Achsen `camera` + `lens`.
- `ShotDirectorPanel` + `SceneShotDirectorPanel`: 6 Slots statt 4 (Toolkit + per-Scene).
- `buildShotPromptSuffix`: englische Auto-Injection in alle 11 Provider.

## ✅ Stage 1 – Location Library (DONE)
- DB: `brand_locations` (RLS) + `scene_still_frames` (Cache für Stage 2).
- Storage-Bucket `brand-locations` (User-ID-First-RLS).
- Hook `useBrandLocations` / Alias `useAccessibleLocations` + `buildLocationPromptInjection`.
- Edge Function `extract-location-identity` (Gemini 2.5 Flash Vision → Identity Card).
- Page `/locations` mit Bento-Grid, Create/Favorite/Archive.

## ✅ Stage 3 – @mention Prompt Editor (DONE)
- Neuer Hook `useUnifiedMentionLibrary`: aggregiert `brand_characters` (Avatare/Stage 1 + Marketplace) + `brand_locations` (Stage 1) + Legacy Motion-Studio Library, dedupliziert per Name.
- `PromptMentionEditor` zieht jetzt aus der unified library → tippe `@` und siehst Avatars + Locations + Motion-Studio-Cast nebeneinander.
- Toolkit Generator: Textarea ersetzt durch `PromptMentionEditor`, `resolveMentions` erweitert finalen Prompt mit Cast/Setting-Block und nutzt aufgelöstes Reference-Image als i2v-Fallback.
- Composer (SceneCard, ClipsTab) nutzt unified library für `composePromptLayers` → identische Auflösung in Toolkit + Composer.

## ⏳ Stages 2 & 4 (vorbereitet, noch nicht implementiert)
- **Stage 2 – Frame-First Pipeline**: Edge `generate-scene-still` (Tabelle ist schon da), SceneCard-Tab "Still Frame".
- **Stage 4 – Asset Capture**: Edge `extract-asset-from-frame`, "Save as Character/Location"-Menü auf jedem Bild.



Ziel: Die 5 identifizierten Lücken zu Artlist Studio schließen, ohne unsere Stärken (11 Provider, Lambda-Stitching, Director's Cut) anzufassen.

---

## Stage 1 – Location Library (Charakter-Pendant für Orte)

**Was**: Wiederverwendbare Locations mit Konsistenz-Garantie, analog zu Brand Characters.

- Neue Tabelle `brand_locations` (user_id, name, description, reference_image_url, identity_card JSONB, tags, created_at). RLS analog zu `brand_characters`.
- Storage-Bucket `brand-locations` mit User-ID-First-Path-RLS.
- Neue Page `/locations` (Bento-Grid, James-Bond-Look) mit Create/Edit/Delete + Gemini Vision Identity-Card-Extraktion (Environment, Lighting, Color Palette, Time of Day, Atmosphere).
- Hook `useAccessibleLocations` (eigene + ggf. später marketplace).
- Auto-Injection: Wenn eine Location in Composer-Szene aktiv ist, wird `reference_image_url` als zweiter Subject-Reference-Slot bei Vidu Q2 / Kling Reference2V mitgeschickt; bei anderen Providern über englischen Prompt-Layer (`location modifier`).

## Stage 2 – Frame-First Pipeline (Still → Animate)

**Was**: Pro Szene optional zuerst ein Still-Frame generieren, kuratieren, *dann* animieren. Verhindert verbrannte Video-Credits durch falsche Komposition.

- Erweiterung `SceneCard`: neuer Tab "Still Frame" vor "Video".
- Edge Function `generate-scene-still` (Nano Banana 2 / Gemini 3.1 Flash Image), nimmt finalen Prompt + Charakter + Location und gibt 1–4 Varianten zurück. Cache in neuer Tabelle `scene_still_frames` (scene_id, prompt_hash, variants JSONB).
- UI: Variantengrid, "Use as first frame for video" → setzt `referenceImageUrl` und überschreibt Scene-Anchor-Strategy auf `first-frame-direct`.
- Toggle pro Szene: `requireStillFirst` (default off, on im Wizard für Storytelling-Formate).
- Wiederverwendung: Still-Frames können per Klick als Brand Character oder Location extrahiert werden (siehe Stage 4).

## Stage 3 – @mention Prompt Editor

**Was**: Inline `@`-Trigger zum Einfügen von Cast/Locations in jeden Prompt-Editor.

- Neue Komponente `<MentionablePromptInput>` (autosuggest popover, keyboard nav).
- Datenquellen: `useAccessibleCharacters` + `useAccessibleLocations` + Szenen-spezifische Cast/Location.
- Mentions werden als Token `@[Name](char:uuid)` / `@[Name](loc:uuid)` gespeichert.
- Render-Zeit: Token wird zu beschreibendem englischen Text expandiert (z.B. "Sarah, a 32-year-old woman with auburn hair…") und passende Reference-Bilder werden automatisch dem `composePromptLayers`-Output beigefügt.
- Eingebaut in: Composer Scene-Prompt, AI Video Toolkit Prompt-Box, Picture Studio.

## Stage 4 – Asset Capture aus generierten Frames

**Was**: Aus jedem Bild (Still-Frame, Video-Thumbnail, Picture Studio Output) Charaktere und Locations als wiederverwendbare Assets extrahieren.

- "Save as…" Menü auf jedem Bild → `Save as Character` / `Save as Location`.
- Edge Function `extract-asset-from-frame` (Gemini 2.5 Pro Vision):
  - Modus `character`: Detect main person, crop tight portrait, extrahiere Identity Card.
  - Modus `location`: Mask out people, generate clean location plate via Nano Banana 2 (inpaint), extrahiere Location Identity Card.
- Direkt-Insert in `brand_characters` / `brand_locations`, sofort in der Library verfügbar.

## Stage 5 – Camera & Lens Picker (Hardware-Presets)

**Was**: Konkrete Kamera- und Objektiv-Presets im Shot Director, nicht nur generische Begriffe.

- Erweiterung Shot Director um zwei neue Slots: `camera` (6 Optionen: ARRI Alexa 35, RED V-Raptor, Sony Venice 2, Apple iPhone 17 Pro Max, Panavision Millennium XL2, VHS Camcorder) und `lens` (7 Optionen: ARRI Signature Prime, Leica Summilux-C, Cooke S4/i, Helios 44-2 Swirl Bokeh, Lomo Anamorphic, Angénieux Optimo, Sigma Cine Art).
- Jeder Eintrag mit englischem Prompt-Snippet (`shot on ARRI Alexa 35, ARRI Signature Prime lens, soft cinematic highlights, anamorphic falloff…`) → wird vom `composePromptLayers` mit höchster Priorität (axis: optics) injiziert.
- Verfügbar im Toolkit + per-Scene im Composer + als Teil der Cinematic Style Presets (Noir bekommt z.B. Cooke S4/i + Alexa 35 vor-konfiguriert).

---

## Out of Scope (bewusst)

- Eigener Stock-Katalog (Artlists USP, wir bleiben bei Pexels/Pixabay)
- Auto-Model-Routing (User-Wahl bleibt Feature, kein Bug)
- Echtes Server-Side Live-Rendering (Artlist hat das auch nicht)

## Reihenfolge & Risiko

1. **Stage 5** (Camera/Lens) – kleinste Änderung, sofort sichtbarer "Pro"-Faktor.
2. **Stage 1** (Location Library) – DB + Page + Hook, mittlerer Aufwand.
3. **Stage 3** (@mention) – Brückenkomponente, braucht 1+2 als Datenquelle.
4. **Stage 2** (Frame-First) – größter UX-Shift, profitiert von 1–3.
5. **Stage 4** (Asset Capture) – Closing-Loop, baut auf 1+2 auf.

## Technische Notizen

- Alle Visual-Prompts englisch (Core-Memory).
- Jede neue Edge Function: idempotenter Credit-Refund bei Fail (Core-Memory).
- Storage-Pfade: `{user_id}/...` (Core-Memory).
- `composePromptLayers` bleibt Single Source of Truth – neue Achsen `optics` (camera+lens) und `location` werden mit klarer Priorität ergänzt.
- DB-Migrationen: 2 neue Tabellen (`brand_locations`, `scene_still_frames`) + 1 neuer Storage-Bucket.
- Keine Änderung an Render-Pipeline, Lambda, Director's Cut.
