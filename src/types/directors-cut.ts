import { tx } from '@/lib/i18nText';
// Director's Cut Types

export interface DirectorCutProject {
  id: string;
  user_id: string;
  project_name: string;
  source_video_url: string;
  source_video_id: string | null;
  duration_seconds: number | null;
  scene_analysis: SceneAnalysis[];
  applied_effects: AppliedEffects;
  audio_enhancements: AudioEnhancements;
  export_settings: ExportSettings;
  status: ProjectStatus;
  output_url: string | null;
  credits_used: number;
  created_at: string;
  updated_at: string;
}

export type ProjectStatus = 'draft' | 'analyzing' | 'editing' | 'rendering' | 'completed' | 'failed';

export interface SceneAnalysis {
  id: string;
  start_time: number;
  end_time: number;
  thumbnail_url?: string;
  description: string;
  mood?: string;
  content_description?: string;
  suggested_effects: SuggestedEffect[];
  ai_suggestions?: string[];
  // Time Remapping fields
  original_start_time?: number;
  original_end_time?: number;
  /** Full available source range for added/library clips; lets trims be widened again and enables centered transition handles. */
  media_source_start?: number;
  media_source_end?: number;
  playbackRate?: number; // 1.0 = normal, <1 = slow-mo, >1 = fast
  // Additional media fields for extended scenes
  isFromOriginalVideo?: boolean; // false = neu hinzugefügt
  isBlackscreen?: boolean; // true = leere Szene ohne Video/Bild (legacy, prefer sourceMode)
  /**
   * Source for this scene's visual:
   * - 'original' = passes the original video through (default for scenes inside videoDuration)
   * - 'blackscreen' = renders solid black (placeholder)
   * - 'media' = renders additionalMedia (uploaded video/image)
   * If undefined, the player infers the mode for backwards compatibility.
   */
  sourceMode?: 'original' | 'blackscreen' | 'media';
  additionalMedia?: {
    type: 'video' | 'image';
    url: string;
    duration: number; // Bei Bildern: Anzeigedauer
    thumbnail?: string;
    name?: string;
  };
}

export interface SuggestedEffect {
  type: 'filter' | 'transition' | 'speed' | 'crop';
  name: string;
  reason: string;
  confidence: number;
}

export interface AppliedEffects {
  global: GlobalEffects;
  scenes: Record<string, SceneEffects>;
}

export interface GlobalEffects {
  filter?: string;
  filterIntensity?: number;
  brightness: number;
  contrast: number;
  saturation: number;
  sharpness: number;
  temperature: number;
  vignette: number;
}

export interface SceneEffects {
  filter?: string;
  filterIntensity?: number;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  sharpness?: number;
  temperature?: number;
  vignette?: number;
  speed?: number;
  transition_in?: string;
  transition_out?: string;
  // Color Grading per scene
  colorGrading?: {
    grade: string | null;
    intensity: number;
  };
  // Scene animation (zoom, pan)
  animation?: {
    type: 'none' | 'zoomIn' | 'zoomOut' | 'panLeft' | 'panRight' | 'panUp' | 'panDown' | 'zoomInSlow' | 'zoomOutSlow';
    intensity?: number; // 0-100, default 50
  };
}

export interface AudioEnhancements {
  master_volume: number;
  noise_reduction: boolean;
  noise_reduction_level: number;
  auto_ducking: boolean;
  ducking_level: number;
  voice_enhancement: boolean;
  added_sounds: AddedSound[];
}

export interface AddedSound {
  id: string;
  url: string;
  name: string;
  start_time: number;
  volume: number;
  type: 'sfx' | 'music' | 'ambience';
}

export interface ExportSettings {
  quality: 'hd' | 'fhd' | '4k' | '8k';
  format: 'mp4' | 'webm' | 'mov';
  fps: number;
  aspect_ratio: '16:9' | '9:16' | '1:1' | '4:5';
}

// Transition Assignment for scene-specific transitions
export interface TransitionAssignment {
  sceneId: string;
  transitionType: string;
  duration: number;
  aiSuggested: boolean;
  confidence?: number;
  reasoning?: string;
  /** Manual anchor time — overrides scene.end_time as the transition center */
  anchorTime?: number;
  /** Manual timing offset in seconds (-2.0 to +2.0). Positive = later, negative = earlier */
  offsetSeconds?: number;
}

/** AI-detected (or manually placed) cut points used as magnetic snap targets. */
export interface CutMarker {
  /** Time in seconds (timeline domain). */
  time: number;
  /** Detection confidence 0-1. <0.6 = "weak" (dashed marker, no auto-snap). */
  confidence?: number;
  /** 'auto' = AI detected, 'manual' = user added with shortcut M. */
  source?: 'auto' | 'manual';
}

// Wizard Step Props
export interface VideoImportStepProps {
  selectedVideo: SelectedVideo | null;
  onVideoSelect: (video: SelectedVideo | null) => void;
}

export interface SceneAnalysisStepProps {
  videoUrl: string;
  videoDuration: number;
  scenes: SceneAnalysis[];
  onScenesUpdate: (scenes: SceneAnalysis[]) => void;
  isAnalyzing: boolean;
  onStartAnalysis: () => void;
  onApplySuggestions?: (effects: Partial<GlobalEffects>, sceneEffects?: Record<string, SceneEffects>) => void;
  appliedEffects?: GlobalEffects;
  transitions?: TransitionAssignment[];
  onTransitionsChange?: (transitions: TransitionAssignment[]) => void;
}

// Filter name to effect values mapping - STRONG VALUES for visible differences
export const FILTER_EFFECT_MAPPING: Record<string, Partial<GlobalEffects>> = {
  cinematic: { filter: 'cinematic', saturation: 135, contrast: 130, brightness: 95 },
  vibrant: { filter: 'vibrant', saturation: 180, contrast: 125, brightness: 105 },
  warm: { filter: 'warm', temperature: 45, saturation: 145, brightness: 105 },
  cool: { filter: 'cool', temperature: -40, saturation: 80, brightness: 96 },
  vintage: { filter: 'vintage', saturation: 60, contrast: 135, brightness: 88 },
  noir: { filter: 'noir', saturation: 5, contrast: 160, brightness: 90 },
  muted: { filter: 'muted', saturation: 45, brightness: 115, contrast: 88 },
  highkey: { filter: 'highkey', brightness: 145, contrast: 75, saturation: 90 },
  lowkey: { filter: 'lowkey', brightness: 65, contrast: 145, saturation: 85 },
};

// Available Filters/LUTs
// Basic filters use CSS, Creative filters use real SVG transformations
export const AVAILABLE_FILTERS = [
  { id: 'none', name: 'Original', preview: '', category: 'basic' },
  { id: 'cinematic', name: 'Cinematic', preview: 'saturate(1.35) contrast(1.3) brightness(0.95)', category: 'basic' },
  { id: 'vintage', name: 'Vintage', preview: 'sepia(0.4) contrast(1.35) brightness(0.88)', category: 'basic' },
  { id: 'noir', name: 'Noir', preview: 'grayscale(1) contrast(1.6) brightness(0.9)', category: 'basic' },
  { id: 'warm', name: 'Warm', preview: 'sepia(0.35) saturate(1.45) brightness(1.05)', category: 'basic' },
  { id: 'cool', name: 'Cool', preview: 'hue-rotate(-40deg) saturate(0.8) brightness(0.96)', category: 'basic' },
  { id: 'vibrant', name: 'Vibrant', preview: 'saturate(1.8) contrast(1.25) brightness(1.05)', category: 'basic' },
  { id: 'muted', name: 'Muted', preview: 'saturate(0.45) brightness(1.15) contrast(0.88)', category: 'basic' },
  { id: 'highkey', name: 'High Key', preview: 'brightness(1.45) contrast(0.75) saturate(0.9)', category: 'basic' },
  { id: 'lowkey', name: 'Low Key', preview: 'brightness(0.65) contrast(1.45) saturate(0.85)', category: 'basic' },
  // TRANSFORMATIVE SVG FILTERS - Real edge detection, glow, scanlines, etc.
  { id: 'cartoon', name: '🎨 Cartoon', preview: 'contrast(1.8) saturate(1.6) brightness(1.1)', category: 'creative', description: tx({ de: 'Echte Edge-Detection + Cel-Shading', en: 'Real edge detection + cel shading', es: 'Detección de bordes real + sombreado plano' }) },
  { id: 'anime', name: '✨ Anime', preview: 'saturate(1.6) contrast(1.3) brightness(1.15)', category: 'creative', description: tx({ de: 'Glow-Effekte + Anime-Farbpalette', en: 'Glow effects + anime color palette', es: 'Efectos de brillo + paleta de colores de anime' }) },
  { id: 'retro_vhs', name: '📼 Retro VHS', preview: 'sepia(0.35) contrast(1.3) saturate(1.2) brightness(0.9)', category: 'creative', description: tx({ de: 'Scanlines + RGB-Verschiebung + Grain', en: 'Scanlines + RGB shift + grain', es: 'Líneas de exploración + cambio de RGB + grano' }) },
  { id: 'cyberpunk', name: '🌃 Cyberpunk', preview: 'saturate(1.6) contrast(1.5) brightness(1.1)', category: 'creative', description: tx({ de: 'Neon-Glow + Cyan/Magenta-Palette', en: 'Neon glow + cyan/magenta palette', es: 'Brillo de neón + paleta de cian/magenta' }) },
  { id: 'dreamy', name: '☁️ Dreamy', preview: 'brightness(1.25) contrast(0.8) saturate(0.75)', category: 'creative', description: tx({ de: 'Weicher Glow + Highlight-Bloom', en: 'Soft glow + highlight bloom', es: 'Brillo suave + resplandor de reflejos' }) },
  { id: 'horror', name: '👻 Horror', preview: 'contrast(1.6) brightness(0.65) saturate(0.3) sepia(0.2)', category: 'creative', description: tx({ de: 'Desaturiert + Grün-Tint + Film-Grain', en: 'Desaturated + green tint + film grain', es: 'Desaturado + tinte verde + grano de película' }) },
  { id: 'pop_art', name: '🎭 Pop Art', preview: 'saturate(2.5) contrast(1.8) brightness(1.1)', category: 'creative', description: tx({ de: 'Extreme Posterization + Warhol-Style', en: 'Extreme posterization + Warhol style', es: 'Posterización extrema + estilo Warhol' }) },
  { id: 'infrared', name: '🔴 Infrared', preview: 'hue-rotate(180deg) saturate(1.5) contrast(1.3)', category: 'creative', description: tx({ de: 'Falschfarben-Thermal-Look', en: 'False color thermal look', es: 'Aspecto térmico de falso color' }) },
  { id: 'neon', name: '💜 Neon', preview: 'saturate(2.2) contrast(1.6) brightness(1.15)', category: 'creative', description: tx({ de: 'Edge-Glow + Neon-Farben', en: 'Edge glow + neon colors', es: 'Brillo en los bordes + colores de neón' }) },
  { id: 'film_grain', name: '🎞️ Film Grain', preview: 'sepia(0.15) contrast(1.15) saturate(0.95)', category: 'creative', description: tx({ de: 'Authentisches Film-Grain + Farbshift', en: 'Authentic film grain + color shift', es: 'Grano de película auténtico + cambio de color' }) },
  { id: 'bleach_bypass', name: '🌫️ Bleach Bypass', preview: 'contrast(1.4) saturate(0.45) brightness(1.08)', category: 'creative', description: tx({ de: 'Desaturiert + Hoher Kontrast', en: 'Desaturated + high contrast', es: 'Desaturado + alto contraste' }) },
  { id: 'cross_process', name: '🌈 Cross Process', preview: 'sepia(0.2) saturate(1.4) hue-rotate(-12deg) contrast(1.12)', category: 'creative', description: tx({ de: 'Farbkanal-Verschiebung', en: 'Color channel shift', es: 'Desplazamiento del canal de color' }) },
  { id: 'golden_hour', name: '🌅 Golden Hour', preview: 'sepia(0.3) saturate(1.4) brightness(1.1) contrast(1.05)', category: 'basic' },
  { id: 'moody', name: '🌑 Moody', preview: 'contrast(1.4) brightness(0.75) saturate(0.7) sepia(0.1)', category: 'basic' },
  { id: 'neon_nights', name: '🌆 Neon Nights', preview: 'saturate(1.8) contrast(1.4) brightness(1.05) hue-rotate(10deg)', category: 'creative', description: tx({ de: 'Neon-Stadtlichter', en: 'Neon city lights', es: 'Luces de la ciudad de neón' }) },
  { id: 'lomography', name: '📷 Lomography', preview: 'saturate(1.5) contrast(1.3) sepia(0.15) brightness(0.95)', category: 'creative', description: tx({ de: 'Lomographischer Look', en: 'Lomographic look', es: 'Aspecto lomográfico' }) },
  { id: 'kodak_portra', name: '🎞️ Kodak Portra', preview: 'sepia(0.12) saturate(1.15) contrast(1.05) brightness(1.05)', category: 'creative', description: tx({ de: 'Klassischer Kodak Portra Film', en: 'Classic Kodak Portra film', es: 'Película clásica Kodak Portra' }) },
  { id: 'fuji_velvia', name: '🏔️ Fuji Velvia', preview: 'saturate(1.6) contrast(1.2) brightness(0.95)', category: 'creative', description: tx({ de: 'Fuji Velvia Diafilm', en: 'Fuji Velvia slide film', es: 'Película de diapositivas Fuji Velvia' }) },
  { id: 'technicolor', name: '🎬 Technicolor', preview: 'saturate(1.7) contrast(1.15) sepia(0.08) brightness(1.05)', category: 'creative', description: tx({ de: 'Klassischer Technicolor-Look', en: 'Classic Technicolor look', es: 'Look clásico de Technicolor' }) },
] as const;

export type FilterId = typeof AVAILABLE_FILTERS[number]['id'];
export type FilterCategory = 'basic' | 'creative';

// ============================================================================
// Overlay-Ebene (v407) — Text, Banner, Schilder, Lower Thirds …
// Alle neuen Felder sind optional, damit gespeicherte Alt-Projekte
// unverändert weiterlaufen (siehe upgradeOverlay()).
// ============================================================================

/** Bausteinart eines Overlays. `text` = klassisches Text-Overlay (Alt-Verhalten). */
export type OverlayKind =
  | 'text'
  | 'lowerThird'
  | 'banner'
  | 'badge'
  | 'card'
  | 'cta'
  | 'ticker'
  | 'logo'
  | 'callout'
  | 'quote'
  | 'progress';

/** Relative Box (0..1) bezogen auf die Canvas-Kante — wie im Post Designer. */
export interface OverlayBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type OverlayAnimation =
  | 'none'
  | 'fadeIn'
  | 'scaleUp'
  | 'bounce'
  | 'typewriter'
  | 'highlight'
  | 'glitch'
  | 'slideLeft'
  | 'slideRight'
  | 'slideUp'
  | 'slideDown'
  | 'wipe'
  | 'pop'
  | 'blurIn'
  | 'stagger'
  | 'tickerLoop';

export const OVERLAY_ANIMATIONS: { id: OverlayAnimation; name: string; description: string }[] = [
  { id: 'fadeIn', name: 'Fade In', description: tx({ de: 'Sanftes Einblenden', en: 'Soft fade-in', es: 'Desvanecimiento suave' }) },
  { id: 'scaleUp', name: 'Scale Up', description: tx({ de: 'Vergrößern von klein', en: 'Enlarge from small', es: 'Agrandar desde pequeño' }) },
  { id: 'bounce', name: 'Bounce', description: tx({ de: 'Hüpfende Animation', en: 'Bouncing animation', es: 'Animación de rebote' }) },
  { id: 'typewriter', name: 'Typewriter', description: tx({ de: 'Schreibmaschine', en: 'Typewriter', es: 'Máquina de escribir' }) },
  { id: 'highlight', name: 'Highlight', description: tx({ de: 'Marker-Effekt', en: 'Marker effect', es: 'Efecto marcador' }) },
  { id: 'glitch', name: 'Glitch', description: tx({ de: 'Digitaler Störeffekt', en: 'Digital glitch effect', es: 'Efecto de falla digital' }) },
  { id: 'slideLeft', name: 'Slide ←', description: tx({ de: 'Von rechts hereinfahren', en: 'Slide in from the right', es: 'Deslizar desde la derecha' }) },
  { id: 'slideRight', name: 'Slide →', description: tx({ de: 'Von links hereinfahren', en: 'Slide in from the left', es: 'Deslizar desde la izquierda' }) },
  { id: 'slideUp', name: 'Slide ↑', description: tx({ de: 'Von unten hereinfahren', en: 'Slide in from below', es: 'Deslizar desde abajo' }) },
  { id: 'slideDown', name: 'Slide ↓', description: tx({ de: 'Von oben hereinfahren', en: 'Slide in from above', es: 'Deslizar desde arriba' }) },
  { id: 'wipe', name: 'Wipe', description: tx({ de: 'Balken schiebt frei', en: 'Bar pushes free', es: 'La barra se libera' }) },
  { id: 'pop', name: 'Pop', description: tx({ de: 'Kurzer Feder-Impuls', en: 'Short spring pulse', es: 'Pulso de resorte corto' }) },
  { id: 'blurIn', name: 'Blur In', description: tx({ de: 'Aus der Unschärfe', en: 'Out of focus', es: 'Fuera de foco' }) },
  { id: 'stagger', name: 'Zeilen-Stagger', description: tx({ de: 'Wörter nacheinander', en: 'Words one after another', es: 'Palabras una tras otra' }) },
  { id: 'tickerLoop', name: 'Ticker', description: tx({ de: 'Endlos durchlaufend', en: 'Continuously running', es: 'Corriendo continuamente' }) },
  { id: 'none', name: 'Ohne', description: tx({ de: 'Hart einblenden', en: 'Hard fade-in', es: 'Fundido de entrada duro' }) },
];

export interface OverlayStyle {
  fontSize: 'sm' | 'md' | 'lg' | 'xl';
  color: string;
  backgroundColor: string;
  shadow: boolean;
  fontFamily: string;
  /** Schriftgrad relativ zur Canvas-Breite (überschreibt fontSize, z. B. 0.045). */
  fontSizeRel?: number;
  fontWeight?: number;
  uppercase?: boolean;
  letterSpacing?: number;
  lineHeight?: number;
  align?: 'left' | 'center' | 'right';
  /** Flächenfarbe des Bausteins (Balken, Karte, Badge …). */
  fill?: string | null;
  /** Optionaler Verlauf für die Fläche. */
  gradient?: [string, string] | null;
  borderColor?: string;
  borderWidth?: number;
  radius?: number;
  opacity?: number;
  rotation?: number;
  /** Akzentfarbe für Linien, Pfeile, Fortschritt. */
  accentColor?: string;
  /** Innenabstand relativ zur Canvas-Breite. */
  padding?: number;
}

export interface OverlaySlots {
  title?: string;
  subtitle?: string;
  badge?: string;
  imageUrl?: string | null;
}

// Text Overlay for VFX Step (ab v407 = universelles Overlay-Element)
export interface TextOverlay {
  id: string;
  text: string;
  animation: OverlayAnimation;
  position: 'top' | 'center' | 'bottom' | 'bottomLeft' | 'bottomRight' | 'topLeft' | 'topRight' | 'centerLeft' | 'centerRight' | 'custom';
  customPosition?: { x: number; y: number };
  startTime: number;
  endTime: number | null; // null = bis Ende
  style: OverlayStyle;
  /** v407 */
  kind?: OverlayKind;
  box?: OverlayBox;
  enter?: OverlayAnimation;
  exit?: OverlayAnimation;
  slots?: OverlaySlots;
}

/** Alias mit sprechendem Namen — identisch zu TextOverlay. */
export type OverlayElement = TextOverlay;


// Text Overlay Templates
export const TEXT_OVERLAY_TEMPLATES = [
  { id: 'cta', name: tx({ de: 'CTA Button', en: 'CTA Button', es: 'Botón CTA' }), text: tx({ de: 'JETZT KAUFEN', en: 'BUY NOW', es: 'COMPRAR AHORA' }), animation: 'scaleUp' as const, position: 'bottom' as const, style: { fontSize: 'lg' as const, color: '#ffffff', backgroundColor: 'rgba(220,38,38,0.9)', shadow: true, fontFamily: 'sans-serif' } },
  { id: 'hashtag', name: tx({ de: 'Hashtags', en: 'Hashtags', es: 'Hashtags' }), text: '#trending #viral', animation: 'fadeIn' as const, position: 'bottomLeft' as const, style: { fontSize: 'md' as const, color: '#ffffff', backgroundColor: 'rgba(0,0,0,0.5)', shadow: false, fontFamily: 'sans-serif' } },
  { id: 'watermark', name: tx({ de: 'Watermark', en: 'Watermark', es: 'Marca de agua' }), text: '@username', animation: 'fadeIn' as const, position: 'bottomRight' as const, style: { fontSize: 'sm' as const, color: 'rgba(255,255,255,0.7)', backgroundColor: 'transparent', shadow: true, fontFamily: 'sans-serif' } },
  { id: 'title', name: tx({ de: 'Titel', en: 'Title', es: 'Título' }), text: tx({ de: 'Mein Video', en: 'My Video', es: 'Mi Video' }), animation: 'bounce' as const, position: 'top' as const, style: { fontSize: 'xl' as const, color: '#ffffff', backgroundColor: 'transparent', shadow: true, fontFamily: 'serif' } },
  { id: 'impact', name: tx({ de: 'Impact', en: 'Impact', es: 'Impacto' }), text: 'WOW!', animation: 'glitch' as const, position: 'center' as const, style: { fontSize: 'xl' as const, color: '#00ff00', backgroundColor: 'transparent', shadow: true, fontFamily: 'monospace' } },
  { id: 'countdown', name: tx({ de: 'Countdown', en: 'Countdown', es: 'Cuenta regresiva' }), text: '3...2...1', animation: 'typewriter' as const, position: 'center' as const, style: { fontSize: 'lg' as const, color: '#ffffff', backgroundColor: 'transparent', shadow: true, fontFamily: 'monospace' } },
] as const;

// Selected video for import
export interface SelectedVideo {
  id?: string;
  url: string;
  name: string;
  source: 'media_library' | 'upload' | 'universal_creator';
  duration?: number;
  thumbnail_url?: string;
  /** When the imported video is a Composer render, these enable EDL import. */
  composerProjectId?: string | null;
  composerRenderId?: string | null;
}
