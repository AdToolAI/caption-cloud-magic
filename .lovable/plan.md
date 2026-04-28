# Storyboard: Charakter-Removal & weniger Charakter-Fokus — DONE

## Implemented

### 1. Per-scene character remove button
- `CharacterShotBadge.tsx`: Added a visible ✕ button (with tooltip in DE/EN/ES) next to the shot-type select. Clicking removes the character from that scene (`onChange(undefined)`).
- `SceneCard.tsx`: Passes `language` prop to the picker.

### 2. AI storyboard rebalanced (`compose-video-storyboard/index.ts`)
- System prompt: Replaced rigid "DISTRIBUTION RULES" with a "CHARACTER-AS-ANCHOR PHILOSOPHY" — default per scene is now "absent", character only appears in ~30–50% of scenes when the storyline calls for it.
- User prompt: "CHARACTER REQUIREMENT (non-negotiable)" → "CHARACTER GUIDANCE" — explicitly states not to force the character into every scene.
- Stock-footage candidate logic untouched (benefits from more "absent" scenes automatically).
