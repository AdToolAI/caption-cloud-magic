// Shared rules between compose-video-storyboard and scene-director — keep the
// negative clause identical so single-scene edits look like the storyboard.

export const SCENE_NEGATIVE_CLAUSE =
  ', no on-screen text, no captions, no subtitles, no watermarks, no logos, no isolated product on plain background, no floating product, no product rotating in empty space';

export const SCENE_HARD_RULES_EN = `
HARD RULES — every aiPrompt MUST satisfy ALL of these:
1. Written in English regardless of the user's input language.
2. 50–80 words. Pack it with sensory detail: subject, action, environment, camera, lens, lighting, mood.
3. NEVER quote on-screen text, signs with words, captions, lower-thirds, UI overlays, or typography.
4. NEVER reference other scenes ("she from before", "later", "now smiling at the camera", "our protagonist returns").
5. Stay strictly inside the duration budget you are given — fewer, clearer beats beat overstuffed prose.
6. Avoid all real-world political insignia (swastikas, party flags, regime emblems). Period-correct uniforms are fine but must be neutral.
7. Always END the prompt with EXACTLY this clause: "${SCENE_NEGATIVE_CLAUSE.trim().replace(/^,\s*/, '')}"
`.trim();
