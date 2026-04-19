// Composer Visual Style presets — drives consistent visual identity across all scenes.
// The `promptHint` is appended to every AI scene prompt so models like Hailuo / Kling
// generate footage in the chosen style.

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

export interface VisualStylePreset {
  id: ComposerVisualStyle;
  /** Short label for UI buttons (EN — i18n labels resolved client-side). */
  label: { de: string; en: string; es: string };
  /** Compact description shown under the label. */
  desc: { de: string; en: string; es: string };
  /** Emoji glyph used in the picker. */
  glyph: string;
  /**
   * Concrete prompt clause appended to every aiPrompt before generation.
   * Must be in English (model performance is best in English) and start with
   * a comma so it concatenates cleanly: ", shot in <style>, ...".
   */
  promptHint: string;
}

export const VISUAL_STYLES: VisualStylePreset[] = [
  {
    id: 'realistic',
    label: { de: 'Realistisch', en: 'Realistic', es: 'Realista' },
    desc: { de: 'Foto-real, natürliche Szenen', en: 'Photo-real, natural scenes', es: 'Foto-real, escenas naturales' },
    glyph: '📷',
    promptHint:
      ', photo-realistic style, naturalistic lighting, real human skin texture, authentic environment, documentary realism, no stylization, no illustration',
  },
  {
    id: 'cinematic',
    label: { de: 'Cinematic', en: 'Cinematic', es: 'Cinemático' },
    desc: { de: 'Kino-Look, anamorphisch', en: 'Movie look, anamorphic', es: 'Aspecto de cine, anamórfico' },
    glyph: '🎬',
    promptHint:
      ', cinematic film look, anamorphic lens, shallow depth of field, filmic grain, teal-and-orange color grade, dramatic lighting, 24fps motion blur, Hollywood production value',
  },
  {
    id: 'comic',
    label: { de: 'Comic', en: 'Comic', es: 'Cómic' },
    desc: { de: 'Comic-Book, Halftone, bold', en: 'Comic book, halftone, bold', es: 'Cómic, semitonos, audaz' },
    glyph: '💥',
    promptHint:
      ', comic book illustration style, bold black ink outlines, vibrant flat colors, halftone dot shading, action-pose dynamic framing, cel-shaded characters, graphic novel aesthetic',
  },
  {
    id: 'anime',
    label: { de: 'Anime', en: 'Anime', es: 'Anime' },
    desc: { de: 'Japanischer Anime-Stil', en: 'Japanese anime style', es: 'Estilo anime japonés' },
    glyph: '🌸',
    promptHint:
      ', Japanese anime style, expressive large eyes, cel-shaded coloring, hand-drawn line art, vivid sky gradients, Studio Ghibli inspired atmosphere, 2D animation aesthetic',
  },
  {
    id: '3d-animation',
    label: { de: '3D Animation', en: '3D Animation', es: 'Animación 3D' },
    desc: { de: 'Pixar-Stil, gerendert', en: 'Pixar-style, rendered', es: 'Estilo Pixar, renderizado' },
    glyph: '🧊',
    promptHint:
      ', 3D animated CGI style, Pixar-quality rendering, soft global illumination, subsurface scattering on skin, stylized proportions, smooth subdivision surfaces, family-film aesthetic',
  },
  {
    id: 'claymation',
    label: { de: 'Claymation', en: 'Claymation', es: 'Plastilina' },
    desc: { de: 'Knete, Stop-Motion', en: 'Clay, stop-motion', es: 'Arcilla, stop-motion' },
    glyph: '🧶',
    promptHint:
      ', stop-motion claymation style, visible fingerprint texture on clay, slightly jittery handcrafted motion, miniature set with practical lighting, Aardman / Laika studio aesthetic',
  },
  {
    id: 'pixel-art',
    label: { de: 'Pixel Art', en: 'Pixel Art', es: 'Pixel Art' },
    desc: { de: '16-Bit Retro Game', en: '16-bit retro game', es: 'Juego retro 16-bit' },
    glyph: '👾',
    promptHint:
      ', 16-bit pixel art style, limited color palette, crisp pixel edges, retro video-game aesthetic, parallax scrolling backgrounds, dithered shadows, 1990s arcade vibe',
  },
  {
    id: 'watercolor',
    label: { de: 'Aquarell', en: 'Watercolor', es: 'Acuarela' },
    desc: { de: 'Gemalt, weich, künstlerisch', en: 'Painted, soft, artistic', es: 'Pintado, suave, artístico' },
    glyph: '🎨',
    promptHint:
      ', hand-painted watercolor style, visible paper texture, soft wet-on-wet color bleeds, loose brush strokes, pastel palette, illustrated storybook feel',
  },
  {
    id: 'noir',
    label: { de: 'Film Noir', en: 'Film Noir', es: 'Cine Negro' },
    desc: { de: 'S/W, hoher Kontrast', en: 'B&W, high contrast', es: 'B/N, alto contraste' },
    glyph: '🕶️',
    promptHint:
      ', film noir style, high-contrast black-and-white, deep shadows, venetian blind light patterns, smoky atmosphere, 1940s detective movie aesthetic, low-key chiaroscuro lighting',
  },
  {
    id: 'cyberpunk',
    label: { de: 'Cyberpunk', en: 'Cyberpunk', es: 'Cyberpunk' },
    desc: { de: 'Neon, Regen, futuristisch', en: 'Neon, rain, futuristic', es: 'Neón, lluvia, futurista' },
    glyph: '🌃',
    promptHint:
      ', cyberpunk aesthetic, neon magenta and cyan lighting, rain-soaked reflective streets, holographic signage in unreadable abstract glyphs, dystopian futuristic megacity, Blade Runner inspired',
  },
  {
    id: 'vintage-film',
    label: { de: 'Vintage Film', en: 'Vintage Film', es: 'Cine Vintage' },
    desc: { de: '70er Super-8 Look', en: '70s Super-8 look', es: 'Look Súper-8 de los 70' },
    glyph: '📼',
    promptHint:
      ', vintage 1970s Super-8 film look, warm faded colors, visible film grain and dust, slight gate weave, lens vignetting, nostalgic home-movie aesthetic',
  },
  {
    id: 'documentary',
    label: { de: 'Doku', en: 'Documentary', es: 'Documental' },
    desc: { de: 'Reportage, handheld', en: 'Reportage, handheld', es: 'Reportaje, cámara en mano' },
    glyph: '🎥',
    promptHint:
      ', documentary reportage style, handheld camera with subtle breathing, available natural light, candid unposed subjects, observational framing, journalistic authenticity',
  },
];

export function getVisualStylePreset(id: ComposerVisualStyle | undefined): VisualStylePreset | undefined {
  if (!id) return undefined;
  return VISUAL_STYLES.find((s) => s.id === id);
}
