## Problem

Im **AI Video Toolkit** (`/ai-video-toolkit`) wird das Avatar-Porträt (`brandCharacter.reference_image_url`) direkt als `startImageUrl` an den i2v-Provider gegeben. Dadurch ist der Portrait-Shot buchstäblich das **erste Bild jeder Szene** — der Charakter startet immer in seiner Referenz-Pose statt in der beschriebenen Szene.

Im **Motion Studio (Composer)** passiert das nicht, weil dort `prepareSceneAnchor` → `compose-scene-anchor` (Nano Banana 2) läuft: das Porträt wird zuerst **in die beschriebene Szene komponiert** (Wide-Shot, Location, Action) und erst dieses komponierte Standbild wird als i2v-First-Frame an Hailuo/Kling/Seedance/HappyHorse geschickt.

Der Toolkit-Generator (`src/components/ai-video/ToolkitGenerator.tsx`, ab Zeile 211) überspringt diesen Schritt komplett.

## Ziel

Der AI Video Toolkit soll denselben Scene-Aware-Anchor-Pfad benutzen wie der Composer: Porträt → komponiertes Szenen-Standbild → i2v.

## Umsetzung

### 1) Anchor-Preparation vor dem Provider-Call einfügen

In `src/components/ai-video/ToolkitGenerator.tsx` innerhalb `handleGenerate`, direkt nach dem Bauen des `finalPrompt` und **vor** dem `startImageUrl`-Assignment (heute Z. 211-218):

- Nur ausführen, wenn ein Charakter (`brandCharacter` **oder** ein via @-Mention resolvter Char) da ist UND der User keinen manuellen `startImageUrl` hochgeladen hat (manueller Upload bleibt Vorrang, wie im Composer).
- `prepareSceneAnchor` aufrufen mit einer minimalen `ComposerScene`-Shape, die aus dem Toolkit-State gebaut wird:
  - `aiPrompt` = finalPrompt
  - `characters` = `[brandCharacter]` als `ComposerCharacter[]`
  - `location` = `castLocation` (falls gesetzt)
  - `clipSource` = `model.family` gemappt auf ComposerClipSource-Wert (`ai-hailuo`, `ai-kling`, `ai-seedance`, `ai-happyhorse`, `ai-vidu`, `ai-pika`, `ai-runway`, `ai-luma`, `ai-wan`, `ai-grok`, `ai-sora`) — für die Strategy-Matrix (Vidu/Kling-Ref2V → subject-reference, Sora → text-only, Rest → first-frame-composed).
- Ergebnis:
  - `firstFrameUrl` → wird als `body.startImageUrl` gesetzt (statt rohem Porträt)
  - `subjectReferenceUrls` → falls Provider `multiRef` unterstützt (Vidu), automatisch in `body.referenceImages` einspeisen, sonst ignorieren
  - `strategy === 'text-only'` (Sora) → **kein** `startImageUrl`, wie heute bereits

### 2) Fallback & UX

- Wenn `compose-scene-anchor` fehlschlägt oder länger als ~25 s braucht: still auf das rohe Porträt zurückfallen (kein Hard-Fail) und ein leises `console.warn` schreiben — identisches Verhalten wie im Composer.
- Während der Anchor-Komposition: Button-Label auf „Szene komponieren…" (DE) / „Composing scene…" (EN) setzen, danach wieder „Video generieren".
- Ein kleines "🎬 Scene-Aware" Badge unter dem Prompt (analog Composer-`SceneAnchorBadge`), wenn ein komponiertes Frame verwendet wurde, damit der User sieht dass der Avatar-Look aktiv in die Szene übernommen wurde.

### 3) Provider-Fälle (Strategy-Matrix greift automatisch)

- **Hailuo / Kling-Std / Seedance / Luma / HappyHorse / Pika / Wan / Grok** → `first-frame-composed` (Nano-Banana-Standbild)
- **Vidu Q2 (multiRef)** → `subject-reference`, Porträt landet in `referenceImages[role='character']`, kein Zwangs-Startframe
- **Kling 3 Omni (v2v)** → wenn `referenceVideoUrl` gesetzt: unverändert V2V, sonst `first-frame-composed`
- **Sora 2** → `text-only`, wie heute (Toast bleibt)

### 4) Keine Änderungen am Composer / an Edge Functions

`compose-scene-anchor`, `scene_anchor_cache`, `prepareSceneAnchor` und `resolveSceneCharacterAnchor` bleiben **unverändert**. Nur der Toolkit-Client konsumiert sie zusätzlich. Damit ist die bewährte Motion-Studio-Pipeline (v168 Anti-Clone, v170 Cast-Integrity Audit, v181 Depicted-Face-Lock) 1:1 auch im Toolkit aktiv, ohne Regressions-Risiko für den Composer.

## Betroffene Dateien

- `src/components/ai-video/ToolkitGenerator.tsx` — Anchor-Call + Provider-Wiring + Badge/Button-State
- (optional) neuer kleiner Helper `src/lib/ai-video/toolkitModelToClipSource.ts` — Mapping `model.family → ComposerClipSource`

## Ergebnis

Jede Szene im AI Video Studio startet danach mit einem echten, zur Szenenbeschreibung passenden Frame (Charakter in der beschriebenen Umgebung/Pose), nicht mehr mit dem Avatar-Porträt — identisch zum Motion Studio.