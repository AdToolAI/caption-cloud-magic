// Shared visual style presets for Composer — mirrored from
// src/config/composerVisualStyles.ts (kept in sync manually).
// The `promptHint` is appended to every AI scene prompt before generation.

export type ComposerVisualStyle =
  | 'realistic'
  | 'cinematic'
  | 'comic'
  | 'anime'
  | '3d-animation'
  | 'claymation'
  | 'pixel-art'
  | 'watercolor'
  | 'noir'
  | 'cyberpunk'
  | 'vintage-film'
  | 'documentary';

export const VISUAL_STYLE_HINTS: Record<ComposerVisualStyle, string> = {
  realistic:
    ', photo-realistic style, naturalistic lighting, real human skin texture, authentic environment, documentary realism, no stylization, no illustration',
  cinematic:
    ', cinematic film look, anamorphic lens, shallow depth of field, filmic grain, teal-and-orange color grade, dramatic lighting, 24fps motion blur, Hollywood production value',
  comic:
    ', comic book illustration style, bold black ink outlines, vibrant flat colors, halftone dot shading, action-pose dynamic framing, cel-shaded characters, graphic novel aesthetic',
  anime:
    ', Japanese anime style, expressive large eyes, cel-shaded coloring, hand-drawn line art, vivid sky gradients, Studio Ghibli inspired atmosphere, 2D animation aesthetic',
  '3d-animation':
    ', 3D animated CGI style, Pixar-quality rendering, soft global illumination, subsurface scattering on skin, stylized proportions, smooth subdivision surfaces, family-film aesthetic',
  claymation:
    ', stop-motion claymation style, visible fingerprint texture on clay, slightly jittery handcrafted motion, miniature set with practical lighting, Aardman / Laika studio aesthetic',
  'pixel-art':
    ', 16-bit pixel art style, limited color palette, crisp pixel edges, retro video-game aesthetic, parallax scrolling backgrounds, dithered shadows, 1990s arcade vibe',
  watercolor:
    ', hand-painted watercolor style, visible paper texture, soft wet-on-wet color bleeds, loose brush strokes, pastel palette, illustrated storybook feel',
  noir:
    ', film noir style, high-contrast black-and-white, deep shadows, venetian blind light patterns, smoky atmosphere, 1940s detective movie aesthetic, low-key chiaroscuro lighting',
  cyberpunk:
    ', cyberpunk aesthetic, neon magenta and cyan lighting, rain-soaked reflective streets, holographic signage in unreadable abstract glyphs, dystopian futuristic megacity, Blade Runner inspired',
  'vintage-film':
    ', vintage 1970s Super-8 film look, warm faded colors, visible film grain and dust, slight gate weave, lens vignetting, nostalgic home-movie aesthetic',
  documentary:
    ', documentary reportage style, handheld camera with subtle breathing, available natural light, candid unposed subjects, observational framing, journalistic authenticity',
};

export function getVisualStyleHint(style: string | undefined | null): string {
  if (!style) return '';
  return VISUAL_STYLE_HINTS[style as ComposerVisualStyle] ?? '';
}
