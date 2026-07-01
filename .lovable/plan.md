## Ziel

AI Video Studio (Toolkit, `/ai-video-toolkit`) nutzt **exakt dieselben Cast- & World-IDs** wie das Motion Studio, damit ein Charakter/eine Location einmal angelegt und überall wiederverwendet werden kann. Keine Lipsync-Integration in diesem Schritt.

## Root Cause (warum bisher das Avatar-Porträt als Startframe erscheint)

`prepareSceneAnchor` → `resolveSceneCharacterAnchorsAll` findet nur Anchors, wenn der Scene entweder `characterShots` mit `characterId` hat oder der Charakter-Name im Prompt-Text steht. Toolkit übergibt heute einen `stubScene` **ohne** `characterShots`, und der User tippt den Namen selten manuell in den Prompt. → `anchors.length === 0` → `compose-scene-anchor` wird nie aufgerufen → Fallback aufs rohe Porträt. Location aus dem ToolkitCastPicker landet zusätzlich weder als @-Mention noch als Slug-Block im Prompt, `resolveSceneWorldRefs` sieht sie nie.

## Umsetzung

Nur `src/components/ai-video/ToolkitGenerator.tsx` und ein neuer schlanker Cast/World-Picker — **keine** Änderungen an `compose-scene-anchor`, `prepareSceneAnchor`, `scene_anchor_cache`, Motion-Studio-Code oder Lipsync-Pfaden.

### 1) Einheitliche Cast- & World-Auswahl (Motion-Studio-Parität)

- Der aktuelle `ToolkitCastPicker` (1 Character + 1 Location) wird zum vollen **Cast & World Panel** ausgebaut, das dieselbe Datenquelle nutzt, die das Motion Studio verwendet: `useMotionStudioLibrary()` (bereits im Toolkit importiert) und `useUnifiedMentionLibrary()` für @-Mentions.
- Slots im Toolkit-Panel (identisch zum Motion-Studio-Modell): **Characters** (bis 4, Multi-Select), **Location** (1), **Building** (1), **Props** (bis 3). Alle IDs sind die echten `brand_characters.id` / `brand_locations.id` — dieselben, die das Motion Studio persistiert. Keine neuen Tabellen, kein separates ID-Schema.
- @-Mentions im Prompt bleiben unverändert und werden mit der Panel-Auswahl gemerged (Dedup nach `id`).

### 2) Motion-Studio-Anchor-Pfad 1:1 wiederverwenden

- Vor jedem Toolkit-Render einen `stubScene: ComposerScene` bauen mit:
  - `aiPrompt = applySceneAssetsToPrompt(finalPrompt, [castLocation, castBuilding, ...castProps, ...mentionWorldRefs])` — deterministischer Slug-Block, den `resolveSceneWorldRefs` bereits versteht.
  - `characterShots = [{ characterId, shotType: 'medium' }, ...]` für **jeden** ausgewählten Charakter (Cap 4). Damit greift Pfad 1 in `resolveSceneCharacterAnchorsAll` — dieselben `characterId`s wie Motion Studio, `compose-scene-anchor` läuft.
  - `clipSource` = Mapping via bestehendes `toolkitModelToClipSource(model)`.
- `prepareSceneAnchor(stubScene, characters, brandChar, sceneAwarePrompt, aspectRatio, {}, libLocations)` mit **allen** ausgewählten Charakteren im 2. Argument aufrufen (nicht mehr `[anchorChar]`).
- Ergebnis wie im Motion Studio verarbeiten:
  - `first-frame-composed` → `body.startImageUrl = prep.firstFrameUrl`
  - `subject-reference` (Vidu) → `body.referenceImages = prep.subjectReferenceUrls`
  - `text-only` (Sora) → nichts anhängen

### 3) Anchor-Gate & Hard-Guard

- `shouldCompose = (characters ausgewählt oder World-Ref vorhanden) && clipSource && !manueller startImageUrl && !(multiRef mit viduReferences)`.
- Wenn `shouldCompose === true` aber `prep.composed !== true` und keine `firstFrameUrl` zurückkommt: **kein** Fallback aufs rohe Porträt, sondern Toast + Abbruch. So kann „Toolkit startet wieder mit dem Avatar-Bild" strukturell nicht mehr passieren.

### 4) Sichtbares Feedback

`SceneAnchorBadge` (analog Motion Studio) unter dem Prompt zeigt: „🎬 Scene-Aware · Samuel + Home Office + Laptop". Bei Fehler ein sichtbares rotes Badge mit dem Grund (statt stiller Fallback).

## Nicht in diesem Schritt

- Lipsync / Dialog-Shot / Sync.so-Pipeline (bleibt komplett unangetastet).
- Änderungen an Motion Studio / Composer.
- Neue Edge Functions oder Tabellen — die Motion-Studio-IDs sind die Wahrheit.

## Ergebnis

Ein Charakter, den der User im Motion Studio (oder auf `/avatars`) angelegt hat, taucht mit **derselben ID** im AI Video Studio auf, wird über den gleichen Anchor-Pfad in die beschriebene Szene komponiert und startet nicht mehr als Porträt-Standbild. Location/Building/Props aus der Cast-&-World-Library sind im Toolkit genauso verfügbar wie im Motion Studio.
