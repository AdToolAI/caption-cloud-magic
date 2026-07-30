/**
 * Autopilot — shared types.
 *
 * The autopilot never hands free-form prose to a video provider. Every scene is
 * described through a fixed field grammar (see `promptGrammar.ts`) which a
 * compiler turns into the provider prompt. That removes the single largest
 * source of bad output: badly worded prompts.
 */

export type AutopilotGenre =
  | 'ad_spot'
  | 'product_demo'
  | 'corporate'
  | 'storytelling'
  | 'testimonial'
  | 'explainer'
  | 'social_hook'
  | 'image_post';

export type AutopilotAspect = '9:16' | '16:9' | '1:1' | '4:5';

/** Narrative function of a scene — drives duration weighting and camera choice. */
export type SceneBeat =
  | 'hook'
  | 'problem'
  | 'reveal'
  | 'proof'
  | 'benefit'
  | 'emotion'
  | 'cta';

export type ShotSize =
  | 'extreme_wide'
  | 'wide'
  | 'medium'
  | 'medium_close'
  | 'close_up'
  | 'extreme_close_up'
  | 'over_shoulder'
  | 'insert';

export type CameraMove =
  | 'static'
  | 'slow_push_in'
  | 'slow_pull_out'
  | 'handheld'
  | 'pan_left'
  | 'pan_right'
  | 'tilt_up'
  | 'tilt_down'
  | 'whip_pan'
  | 'orbit'
  | 'crane_down'
  | 'rack_focus'
  | 'overhead_top_down'
  | 'dutch_angle';

export type LightingKey =
  | 'golden_hour'
  | 'soft_window'
  | 'hard_sun'
  | 'overcast'
  | 'studio_softbox'
  | 'high_key'
  | 'low_key'
  | 'neon_night'
  | 'candle_warm'
  | 'clinical_white';

/** One spoken turn inside a scene. Canonical id — never match by name. */
export interface SceneDialogueTurn {
  id: string;
  text: string;
  /** Cast & World character id speaking this turn. */
  speakerCharacterId?: string;
  /** Display name, used in the director log only. */
  speakerName?: string;
  /** ElevenLabs voice id. */
  voiceId?: string;
  /** BCP-47-ish language code, e.g. "de". */
  language?: string;
  /** True when the system cast this speaker / picked this voice. */
  autoCast?: boolean;
  autoVoice?: boolean;
  voiceName?: string;
}

/**
 * The canonical scene description. Agents fill these fields — they never write
 * the final prompt string themselves.
 */

export interface SceneGrammar {
  /** Stable id, used to correlate anchor → clip → audio. */
  id: string;
  orderIndex: number;
  beat: SceneBeat;
  /** Seconds. Set by the rhythm planner, not by the LLM. */
  durationSeconds: number;

  /** WHO / WHAT is in frame. English. */
  subject: string;
  /** What visibly happens. One action, present tense. English. */
  action: string;
  /** Where it happens. English. */
  environment: string;

  shotSize: ShotSize;
  cameraMove: CameraMove;
  /** e.g. "35mm", "85mm", "anamorphic 40mm". */
  lens: string;
  lighting: LightingKey;
  /** Two or three mood adjectives. English. */
  mood: string;

  /** Cast & World character ids present in this scene. */
  characterIds: string[];
  /** Brand product/prop ids present in this scene. */
  propIds: string[];


  /** Spoken line (user language). Empty when the scene has no dialogue. */
  dialogue?: string;
  /** Speaker character id — required when `dialogue` is set. */
  speakerCharacterId?: string;
  /** ElevenLabs voice id — required when `dialogue` is set. */
  voiceId?: string;
  /** BCP-47-ish language code for TTS, e.g. "de", "en", "es". */
  voiceLanguage?: string;
  /** No cast available — the line is narrator voiceover, no lip-sync. */
  narratorOnly?: boolean;
  /** True when the system picked speaker/voice instead of the user. */
  autoCast?: boolean;
  autoVoiceName?: string;
  /**
   * Multi-speaker dialogue. When present it is the source of truth and
   * `dialogue`/`voiceId` above only describe the first turn. Each turn gets its
   * own voice track and its own Sync.so pass on the same clip.
   */
  turns?: SceneDialogueTurn[];


  /** Extra negatives on top of the global clause. English. */
  negatives?: string[];

  /** Diegetic sound to layer under the clip, e.g. "coffee grinder, café murmur". */
  foleyHint?: string;

  /** Resolved during production. */
  anchorUrl?: string | null;
  clipUrl?: string | null;
  engine?: string | null;
}

export interface AutopilotTreatment {
  genre: AutopilotGenre;
  title: string;
  /** One-paragraph pitch shown to the user before approval. */
  logline: string;
  aspect: AutopilotAspect;
  /** Total target runtime in seconds. */
  totalDurationSeconds: number;
  /** UI + voiceover language. */
  language: string;
  scenes: SceneGrammar[];
  musicMood?: string;
  brand?: {
    name?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
    tone?: string | null;
  };
}
