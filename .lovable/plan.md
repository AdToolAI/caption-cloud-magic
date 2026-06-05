## Where we stand vs Artlist

We already have most of Artlist's *vocabulary* — the gap is in *visual injection* and *time-based direction*.

**Strong today**
- Cast & World library (characters, locations, buildings, props, outfit looks, pose/wardrobe/vibe variants) with `@-mention` autocomplete via `useUnifiedMentionLibrary`
- Scene Director NL box (Gemini tool-call → matched assets + dialog + dropped-actions list)
- Frame-First Studio (Nano Banana 2 still → i2v first frame)
- Shot Director (49 framing/angle/movement/lighting tokens) + 12 Cinematic Style Presets
- Multi-portrait scene composition (up to 4 character portraits → Nano Banana 2 → first frame)
- Structured Prompt Builder (Subject/Action/Setting/Style/Negative)
- Free ↔ Structured toggle, Inspire-Me, Quality Coach

**Artlist parity gaps** (ranked by impact / effort ratio)

| # | Gap | Where it hurts |
|---|---|---|
| 1 | **Locations / Buildings / Props arrive as TEXT ONLY at the video provider.** Only character portraits flow through `compose-scene-anchor`. A `@CoffeeShop` mention becomes `Setting: cozy café…` — the actual location photo is never sent as a visual ref. | Identity of saved World assets is lost the moment generation starts. User saves a beautiful location, gets a generic café back. |
| 2 | **No time-coded Action Beats inside a scene.** Everything is a flat prose paragraph; the LLM guesses timing. Artlist's "Action" structured slot lets you describe what happens *in order*. | "Character picks up phone then turns to camera" — model often skips the second beat. |
| 3 | **No End-Frame.** Artlist mandates Start Frame + optional End Frame. We only have Start Frame via Frame-First. | No control over where a shot lands → bad transitions. |
| 4 | **No Vibe-Board image slot.** No way to drop in an external mood reference image to steer look (Style-Echo only works from a previously rendered clip). | Hard to match a brand's existing visual style. |
| 5 | **No prop-placement / character blocking** (left/center/right, foreground/background). | Composition is a roll of the dice. |
| 6 | **No camera keyframes** (single move token only). | Cannot direct push-in → hold → pull-out within one shot. |
| 7 | **No prop↔character interaction schema** ("A hands Prop X to B at 3 s"). | Multi-actor staging stays vague. |

How Artlist solves it (from their Studio docs):
1. **Library-first** — every Character, Location, *and* asset has reference images. Selecting one inserts both the `@mention` and the visual ref.
2. **Structured prompt** with explicit slots: Subject / Location / Action / Composition / Style / Mood / Sound. Once assets are picked, only Action + Sound remain to fill.
3. **Start + End Frames** mandatory before Direct step. End frame = visual boundary.
4. **Auto-prompt** button that rewrites the prompt iteratively until user accepts.
5. **Frame capture** — pull a still from any rendered clip and use it as start/end for the next.

---

## Proposed Roadmap — 4 Stages

### Stage A — World Assets become Visual References (biggest unlock, ~1 day)

Goal: When the user mentions or picks `@CoffeeShop` / `@RedMug` / `@OfficeBuilding`, the asset's `reference_image_url` reaches the i2v/t2v provider as part of the first-frame composition — not just as a text descriptor.

Touched code (frontend + edge function, leaves lip-sync FROZEN paths alone):
- `prepareSceneAnchor.ts` — collect `locationRefs[]`, `buildingRefs[]`, `propRefs[]` from resolved mentions + UnifiedAssetPicker, not just `portraitUrls[]`.
- `compose-scene-anchor/index.ts` — accept new optional arrays `locationUrls[]` (max 1), `buildingUrls[]` (max 1), `propUrls[]` (max 3). Nano Banana 2 already handles multi-image composition; we just widen the prompt to "compose the named characters in the LOCATION (image 5) with PROPS (images 6–8) visible".
- `compose-video-clips/index.ts` — for Vidu Q2's `subjectReferenceUrls[]` (capacity 7), include locations/props as additional `reference_image`s when the provider supports it. For Hailuo/Kling/Pika, the composed Nano Banana 2 first frame is enough.
- UI: add a small "visual refs in use" badge on SceneCard (e.g. "👤×2 🏛️×1 📦×3") so the user *sees* what's flowing into the composition.

Result: `@CoffeeShop` actually renders **that** coffee shop. `@RedMug` ends up in the character's hand instead of a generic mug.

### Stage B — Action Beats Timeline (Artlist's "Action" slot, time-coded, ~1.5 days)

Goal: Structured time-coded list of what happens, like Artlist's Directing prompt — but more powerful because it's actually time-coded.

- New `ActionBeatsEditor` component, inline in SceneCard above the Style chip. Rows like:
  - `0.0–2.0s  ·  Anna walks into frame from left`
  - `2.0–4.5s  ·  Anna picks up @RedMug from @CoffeeShop counter`
  - `4.5–7.0s  ·  Anna turns to camera, smiles`
- Stored as `scene.actionBeats[]` (`{ startSec, endSec, text, refs?: string[] }`).
- Compiled into the final prompt as a deterministic block (similar to how we already render `Audio plan` in `composeFinalPrompt.ts`):
  ```
  [4 ACTION TIMELINE]
  0.0–2.0s: Anna walks into frame from left.
  2.0–4.5s: Anna picks up the red ceramic mug from the counter.
  ...
  ```
- Scene Director NL box gets a new tool-call output field `actionBeats[]` so the LLM emits them directly when the user writes prose like "Anna kommt rein, nimmt sich die Tasse, dreht sich zur Kamera".
- Quality Coach validates `Σ(endSec − startSec) ≈ scene.duration` and flags overflow.

Result: Provider gets explicit beat timing → far higher hit-rate on multi-action scenes.

### Stage C — End-Frame + Frame Capture (~1 day)

- Extend `SceneStillFrameStudio` with a second slot "End Frame".
- `compose-video-clips` forwards `lastFrameUrl` where the provider supports it (Pika 2.2 Pikaframes, Vidu Q2, Kling 3 — already supported as v2v/keyframe inputs).
- New "Capture frame from clip" action on rendered scene preview — extracts a still client-side (we already have `composer-frames` canvas extraction from the Continuity Guardian) and offers "Use as Start frame of next scene" / "Use as End frame of this scene".

Result: Predictable shot endings → clean transitions in Director's Cut.

### Stage D — Vibe-Board reference slot (~0.5 day)

- One image slot on SceneCard (under "Mehr ▾" drawer) labelled "Vibe reference".
- Flows into `compose-scene-anchor` as an extra `styleReferenceUrl` with Nano Banana 2 prompt suffix "match the lighting, color grade and mood of this reference, but do not copy its content".
- Visible at storyboard level via tiny thumbnail on the SceneCard header.

Result: Brand-style scenes from a single dropped image, no Style-Echo dependency.

---

## What is NOT in scope

- No changes to the FROZEN lip-sync pipeline (compose-dialog-segments, sync-so-webhook, neutralTwoShotPrompt, MAX_SPEAKERS).
- No camera-keyframe-path editor (Gap #6) — model support is too uneven; deferred until Veo 4 / Sora 3.
- No spatial blocking editor (Gap #5) — would need a 2D canvas; deferred.
- No prop↔character interaction schema (Gap #7) — Stage B Action Beats covers most of this in prose form.
- No raising `MAX_SPEAKERS` beyond 4 (FROZEN I.6).
- `portraitUrls[]` cap stays at 4. Stage A adds *separate* arrays for location/building/prop so we don't compete for those 4 slots.

---

## Open questions

1. **Stage order — start with A (visual refs) alone, or A+B together?** A is the bigger user-visible win in a single ship, B adds significant new UX surface that benefits more from a dedicated cycle. My recommendation: **A first, ship and validate, then B**.
2. **Should Stage A's location/building/prop visual refs be opt-in (checkbox per asset in the picker) or always-on?** Always-on is more "Artlist-like" and zero-config; opt-in protects against composition noise when a user just wants a quick generic clip. My recommendation: **always-on with a per-scene "ignore visual refs" toggle in the Advanced drawer**.
