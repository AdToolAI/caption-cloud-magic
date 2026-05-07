## Ziel
Mehrere Charaktere gleichzeitig in einer Szene/Generation — wie bei Artlist & Vidu Q2 — über alle drei Pfade: Composer-Scenes, AI Video Toolkit (Single-Generation) und Talking-Head (Dialog).

## Aktueller Engpass
- `BrandCharacterSelector` ist single-select.
- `buildBrandInputForScene()` zieht nur 1 Character → 1 Identity-Card-Injection + 1 Reference-Image.
- `generate-scene-still` (Nano Banana 2 Anchor) bekommt nur 1 Character-Image als Composition-Input.
- Talking-Head: 1 Avatar pro Render (HeyGen-Limit, kann nicht umgangen werden).

## Lösung in 3 Stages

### Stage 1 — Multi-Character Selector (UI-Foundation)
- Neuer `MultiBrandCharacterSelector` (max 4 Slots, basierend auf Artlist-Pattern: "Cast").
- Pro Slot: Avatar-Chip + Rolle (Optional: "Hero", "Side", "Cameo" → beeinflusst Prompt-Gewichtung).
- Verwendung in:
  - `SceneCard` (Composer) — ersetzt Single-Selector.
  - `ToolkitGenerator` (AI Video Toolkit) — als optionales Cast-Panel.
- Datenmodell: bereits vorhanden (`mentioned_character_ids: string[]` auf `composer_scenes`). Für Toolkit: lokaler State, kein DB-Change nötig.

### Stage 2 — Multi-Character Scene Anchor (Nano Banana 2)
- `generate-scene-still` Edge Function erweitern:
  - Nimmt jetzt `character_ids: string[]` (statt `character_id`) entgegen.
  - Lädt alle Reference-Portraits + Identity-Cards.
  - Baut Composition-Prompt: "Place [Char A: descriptor] on the left and [Char B: descriptor] on the right of the scene, both visible, [shotType], [scene description]…".
  - Sendet alle Portraits als Multi-Image-Input an Gemini 3.1 Flash Image (unterstützt mehrere image_urls).
  - Cache-Key wird zu `hash(scene_prompt + sorted(character_ids) + style)`.
- `composePromptLayers()` erweitern: Identity-Descriptors aller aktiven Chars werden gejoint ("Featuring: Sarah (blond, cream sweater) and Matthew (brown hair, gray shirt)").
- Auto-Provider-Routing: Bei ≥2 Charakteren bevorzugt **Vidu Q2 Reference2V** (nativ Multi-Reference, bis zu 7) — Toggle "Multi-Char Smart Routing" im UI.

### Stage 3 — Dialog-Mode für Talking-Head
- Neuer Tab im Talking-Head-Dialog: "Dialog (2+ Sprecher)".
- UI: Skript-Editor mit Sprecher-Labels (`SARAH: Hallo!\nMATTHEW: Hi Sarah…`) — wie Drehbuch.
- Pro Block:
  - Sprecher → zugeordneter Avatar.
  - Auto-Split in N HeyGen-Renders (pro Block 1 Talking-Head-Clip).
  - Auto-Stitch im Director's Cut als Shot-Reverse-Shot (alternierende Schnitte mit Reaktions-Frames).
- Edge Function: `generate-talking-head-dialog` orchestriert die N Einzel-Renders parallel und legt eine fertige Director's-Cut-Session an.

## Out of Scope (explizit)
- Echte simultane Multi-Speaker-Lippensynchronisation in **einem** HeyGen-Frame (HeyGen-Limit, kein Provider kann das aktuell zuverlässig).
- Marketplace-Avatare gelten automatisch über `useAccessibleCharacters` — kein Extra-Code.

## Reihenfolge
1. Stage 1 (Selector + Datenfluss) — ~1 Edit-Runde.
2. Stage 2 (Anchor + Prompt-Layer + Vidu-Routing) — ~1 Edit-Runde, kein DB-Change.
3. Stage 3 (Talking-Head-Dialog-Mode) — neue Edge Function + Dialog-Tab, ~1 Edit-Runde.

Soll ich mit **Stage 1** starten — oder willst du nur einen bestimmten Pfad (z.B. nur Composer, ohne Talking-Head-Dialog)?
