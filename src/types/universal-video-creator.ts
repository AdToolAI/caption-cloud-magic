// ==========================================
// Universal Video Creator - Type Definitions
// ==========================================

// Video Categories (4 templates)
export type VideoCategory = 
  | 'corporate-ad'     // Unternehmenswerbung
  | 'product-ad'       // Produktwerbung (mit Pflicht-Bildupload)
  | 'storytelling'     // Storytelling (erfunden oder wahr)
  | 'custom';          // Freier Editor

// Visual Styles
export type UniversalVideoStyle = 
  | 'flat-design'
  | 'isometric'
  | 'whiteboard'
  | 'comic'
  | 'corporate'
  | 'modern-3d'
  | 'cinematic'
  | 'documentary'
  | 'minimalist'
  | 'bold-colorful'
  | 'vintage-retro'
  | 'hand-drawn'
  | 'motion-graphics'
  | 'photo-realistic'
  | 'cartoon'
  | 'watercolor'
  | 'neon-cyberpunk'
  | 'paper-cutout'
  | 'clay-3d'
  | 'anime'
  | 'custom';

// Storytelling Structures
export type StorytellingStructure = 
  | '3-act'           // Einleitung, Hauptteil, Schluss
  | 'hero-journey'    // Hero's Journey (12 Schritte)
  | 'aida'            // Attention, Interest, Desire, Action
  | 'problem-solution'// Problem → Lösung
  | 'feature-showcase'// Feature für Feature
  | 'testimonial-arc' // Testimonial Story Arc
  | 'before-after'    // Vorher/Nachher
  | 'comparison'      // Vergleich
  | 'list-format'     // Listenformat (Top 5, etc.)
  | 'hook-value-cta'; // Hook → Wert → CTA

// Scene Types for all categories
export type UniversalSceneType = 
  // Common
  | 'intro' | 'outro' | 'hook' | 'cta'
  // Explainer/Tutorial
  | 'problem' | 'solution' | 'feature' | 'proof' | 'demo' | 'step'
  // Storytelling
  | 'setup' | 'conflict' | 'climax' | 'resolution' | 'revelation'
  // Corporate/Testimonial
  | 'company-intro' | 'team' | 'values' | 'achievement' | 'quote'
  // Product
  | 'product-intro' | 'benefits' | 'specifications' | 'comparison' | 'pricing'
  // Social
  | 'trend-hook' | 'value-drop' | 'engagement-prompt'
  // Event
  | 'event-intro' | 'highlights' | 'speakers' | 'schedule' | 'registration'
  // Custom
  | 'custom';

// Interview Phase Definition
export interface InterviewPhase {
  id: string;
  phase: number;
  question: string;
  purpose: string;
  quickReplies?: string[];
  inputType: 'text' | 'select' | 'multiselect' | 'slider' | 'color' | 'upload';
  options?: string[];
  required: boolean;
  followUpCondition?: string;
}

// Category Interview Configuration
export interface CategoryInterviewConfig {
  category: VideoCategory;
  categoryName: string;
  categoryDescription: string;
  icon: string;
  phases: InterviewPhase[];
  totalPhases: number;
  recommendedStructure: StorytellingStructure;
  recommendedDuration: { min: number; max: number }; // in seconds
  recommendedScenes: { min: number; max: number };
}

// Mood Preset Config (passed from MoodPresetSelector)
export interface MoodConfig {
  preset: 'energetic' | 'professional' | 'emotional' | 'minimalist' | 'playful';
  textDensity: number; // 0-100
  animationIntensity: number; // 0-100
  showSceneBadges: boolean;
}

// Consultation Result
export interface UniversalConsultationResult {
  // Meta
  category: VideoCategory;
  projectName: string;
  completedAt: string;
  
  // Mood Preset (set before consultation)
  moodConfig?: MoodConfig;
  
  // Product Images (min 4 for product-ad)
  productImages?: string[];
  
  // Basic Info
  companyName: string;
  productName: string;
  productDescription: string;
  targetAudience: string;
  targetAudienceAge?: string;
  targetAudienceGender?: string;
  targetAudienceInterests?: string[];
  
  // Problem & Solution
  coreProblem: string;
  solution: string;
  uniqueSellingPoints: string[];
  competitorDifferentiation?: string;
  
  // Storytelling
  storytellingStructure: StorytellingStructure;
  emotionalTone: string;
  keyMessage: string;
  desiredAction: string; // CTA
  ctaText: string;
  
  // Visual Style
  visualStyle: UniversalVideoStyle;
  customStyleDescription?: string;
  brandColors: string[];
  logoUrl?: string;
  referenceUrls?: string[];
  
  // Character
  hasCharacter: boolean;
  characterName?: string;
  characterDescription?: string;
  characterGender?: 'male' | 'female' | 'neutral';
  characterAge?: string;
  characterStyle?: string;
  
  // Audio
  voiceGender: 'male' | 'female';
  voiceLanguage: string;
  voiceTone: string;
  musicStyle: string;
  musicMood: string;
  
  // Technical
  videoDuration: number; // in seconds (max 300 = 5 min)
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:5';
  outputFormats: ('16:9' | '9:16' | '1:1' | '4:5')[];
  
  // Category-Specific Fields
  categorySpecific: Record<string, any>;
  
  // Generated Summary
  briefingSummary: string;
}

// Scene Definition
export interface UniversalVideoScene {
  id: string;
  sceneNumber: number;
  sceneType: UniversalSceneType;
  title: string;
  
  // Timing
  startTime: number;
  endTime: number;
  durationSeconds: number;
  
  // Content
  visualDescription: string;
  spokenText: string;
  onScreenText?: string;
  
  // Visual
  imageUrl?: string;
  hailuoVideoUrl?: string;
  backgroundColor?: string;
  
  // Animation
  animation: {
    type: 'ken-burns' | 'parallax' | 'zoom' | 'pan' | 'static' | 'morph';
    intensity: number;
    direction?: string;
  };
  
  // Transitions
  transitionIn: 'fade' | 'slide' | 'zoom' | 'wipe' | 'morph' | 'none';
  transitionOut: 'fade' | 'slide' | 'zoom' | 'wipe' | 'morph' | 'none';
  transitionDuration: number;
  
  // Audio
  soundEffect?: string;
  musicVolume?: number;
  
  // Character
  showCharacter: boolean;
  characterGesture?: 'idle' | 'waving' | 'thinking' | 'celebrating' | 'pointing' | 'explaining';
  characterPosition?: 'left' | 'right' | 'center';
}

// Script Definition
export interface UniversalVideoScript {
  title: string;
  synopsis: string;
  totalDuration: number;
  structure: StorytellingStructure;
  scenes: UniversalVideoScene[];
  voiceover: string;
}

// Project Definition
export interface UniversalVideoProject {
  id: string;
  userId: string;
  name: string;
  category: VideoCategory;
  status: 'draft' | 'consulting' | 'generating' | 'preview' | 'rendering' | 'completed' | 'failed';
  
  // Consultation
  consultationResult?: UniversalConsultationResult;
  consultationProgress: number;
  
  // Generated Content
  script?: UniversalVideoScript;
  characterSheetUrl?: string;
  scenes: UniversalVideoScene[];
  
  // Audio
  voiceoverUrl?: string;
  voiceoverDuration?: number;
  backgroundMusicUrl?: string;
  
  // Render
  renderedVideoUrls?: {
    '16:9'?: string;
    '9:16'?: string;
    '1:1'?: string;
    '4:5'?: string;
  };
  
  // Meta
  createdAt: string;
  updatedAt: string;
  durationSeconds: number;
}

// Generation Progress
export interface UniversalVideoGenerationProgress {
  id: string;
  projectId: string;
  userId: string;
  
  // Progress
  currentStep: string;
  currentStepIndex: number;
  totalSteps: number;
  progress: number;
  message: string;
  
  // Status
  status: 'pending' | 'generating' | 'completed' | 'failed';
  errorMessage?: string;
  
  // Generated Assets
  scriptGenerated: boolean;
  characterSheetGenerated: boolean;
  visualsGenerated: number;
  visualsTotal: number;
  voiceoverGenerated: boolean;
  musicSelected: boolean;
  soundEffectsAssigned: boolean;
  renderStarted: boolean;
  renderCompleted: boolean;
  
  // URLs
  generatedAssets: {
    scriptUrl?: string;
    characterSheetUrl?: string;
    visualUrls: string[];
    voiceoverUrl?: string;
    musicUrl?: string;
    renderedVideoUrls?: Record<string, string>;
  };
  
  // Timing
  startedAt: string;
  completedAt?: string;
}

// Category Info for UI
export interface VideoCategoryInfo {
  category: VideoCategory;
  name: string;
  description: string;
  icon: string;
  color: string;
  recommendedDuration: string;
  exampleUseCase: string;
  features: string[];
}

// Export all category info for UI
export const VIDEO_CATEGORIES: VideoCategoryInfo[] = [
  {
    category: 'corporate-ad',
    name: 'Unternehmenswerbung',
    description: 'Professionelle Werbevideos für Unternehmen und Dienstleistungen',
    icon: '🏢',
    color: 'from-blue-500 to-indigo-500',
    recommendedDuration: '15-90 Sekunden',
    exampleUseCase: 'TV-Spot, Online-Werbung, Social Media Ads, Imagefilm',
    features: ['AIDA-Struktur', 'Starke CTAs', 'Professioneller Ton']
  },
  {
    category: 'product-ad',
    name: 'Produktwerbung',
    description: 'Kreative Produktvideos mit deinen eigenen Produktfotos',
    icon: '📦',
    color: 'from-green-500 to-emerald-500',
    recommendedDuration: '15-90 Sekunden',
    exampleUseCase: 'Produktlaunch, E-Commerce, Unboxing, Feature-Demo',
    features: ['Produktbilder-Upload', 'KI-Bildbearbeitung', 'Kreative Drehbücher']
  },
  {
    category: 'storytelling',
    name: 'Storytelling',
    description: 'Emotionale Geschichten — erfunden oder wahr, filmisch erzählt',
    icon: '📖',
    color: 'from-purple-500 to-pink-500',
    recommendedDuration: '60-180 Sekunden',
    exampleUseCase: 'Markenfilm, Kurzfilm, Gründergeschichte, fiktive Story',
    features: ["Hero's Journey", 'Emotionale Bögen', 'Cinematic Stil']
  },
  {
    category: 'custom',
    name: 'Freier Editor',
    description: 'Volle Kontrolle — erstelle jedes beliebige Video',
    icon: '✨',
    color: 'from-violet-500 to-purple-600',
    recommendedDuration: 'Flexibel',
    exampleUseCase: 'Tutorial, Erklärvideo, Social Content, Event, Promo',
    features: ['Volle Flexibilität', 'Individuelle Struktur', 'Kreative Freiheit']
  }
];

// Duration limits
export const DURATION_LIMITS = {
  min: 15,    // 15 seconds
  max: 300,   // 5 minutes
} as const;

// Default values
export const DEFAULT_CONSULTATION_RESULT: Partial<UniversalConsultationResult> = {
  visualStyle: 'modern-3d',
  storytellingStructure: 'problem-solution',
  voiceGender: 'male',
  voiceLanguage: 'de',
  voiceTone: 'professionell',
  musicStyle: 'corporate',
  musicMood: 'inspirational',
  aspectRatio: '16:9',
  outputFormats: ['16:9'],
  videoDuration: 60,
  hasCharacter: true,
};

// ==========================================
// Pipeline Mapping: New 4 categories → old internal categories
// Used by edge functions to maintain pipeline compatibility
// ==========================================
export const CATEGORY_PIPELINE_MAP: Record<VideoCategory, string> = {
  'corporate-ad': 'advertisement',
  'product-ad': 'product-video',
  'storytelling': 'storytelling',
  'custom': 'custom',
};
