// ==========================================
// Universal Video Creator - Type Definitions
// ==========================================

// Video Categories (12 total)
export type VideoCategory = 
  | 'advertisement'    // Werbevideo
  | 'storytelling'     // Storytelling / Brand Story
  | 'tutorial'         // Tutorial / How-To
  | 'product-video'    // Produktvideo / Demo
  | 'corporate'        // Unternehmensfilm
  | 'social-content'   // Social Media Content
  | 'testimonial'      // Kundenstimmen / Testimonial
  | 'explainer'        // Erklärvideo (wie bestehendes Studio)
  | 'event'            // Event / Veranstaltung
  | 'promo'            // Promo / Teaser
  | 'presentation'     // Präsentation / Pitch
  | 'custom';          // Benutzerdefiniert

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

// Consultation Result
export interface UniversalConsultationResult {
  // Meta
  category: VideoCategory;
  projectName: string;
  completedAt: string;
  
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
    category: 'advertisement',
    name: 'Werbevideo',
    description: 'Professionelle Werbevideos für Produkte und Dienstleistungen',
    icon: '📺',
    color: 'from-red-500 to-orange-500',
    recommendedDuration: '15-60 Sekunden',
    exampleUseCase: 'TV-Spot, Online-Werbung, Social Media Ads',
    features: ['AIDA-Struktur', 'Starke CTAs', 'Emotionale Hooks']
  },
  {
    category: 'storytelling',
    name: 'Storytelling / Brand Story',
    description: 'Emotionale Geschichten, die Ihre Marke zum Leben erwecken',
    icon: '📖',
    color: 'from-purple-500 to-pink-500',
    recommendedDuration: '60-180 Sekunden',
    exampleUseCase: 'Markenfilm, Imagefilm, Gründergeschichte',
    features: ["Hero's Journey", 'Emotionale Bögen', 'Charakterentwicklung']
  },
  {
    category: 'tutorial',
    name: 'Tutorial / How-To',
    description: 'Schritt-für-Schritt Anleitungen und Lernvideos',
    icon: '🎓',
    color: 'from-blue-500 to-cyan-500',
    recommendedDuration: '60-300 Sekunden',
    exampleUseCase: 'Produktanleitung, Software-Tutorial, DIY-Video',
    features: ['Klare Schritte', 'Visuelle Demonstrationen', 'Zusammenfassungen']
  },
  {
    category: 'product-video',
    name: 'Produktvideo / Demo',
    description: 'Zeigen Sie Ihr Produkt in Aktion',
    icon: '📦',
    color: 'from-green-500 to-emerald-500',
    recommendedDuration: '30-90 Sekunden',
    exampleUseCase: 'Produktlaunch, E-Commerce, Feature-Demo',
    features: ['Feature-Showcase', '360° Ansichten', 'Benefit-Fokus']
  },
  {
    category: 'corporate',
    name: 'Unternehmensfilm',
    description: 'Professionelle Unternehmensdarstellung',
    icon: '🏢',
    color: 'from-slate-500 to-gray-600',
    recommendedDuration: '60-180 Sekunden',
    exampleUseCase: 'Unternehmenspräsentation, Investor-Pitch, Recruiting',
    features: ['Professioneller Ton', 'Unternehmenswerte', 'Team-Vorstellung']
  },
  {
    category: 'social-content',
    name: 'Social Media Content',
    description: 'Virale Inhalte für TikTok, Instagram, YouTube Shorts',
    icon: '📱',
    color: 'from-pink-500 to-rose-500',
    recommendedDuration: '15-60 Sekunden',
    exampleUseCase: 'TikTok, Instagram Reels, YouTube Shorts',
    features: ['Trend-Hooks', 'Schnelle Schnitte', 'Engagement-Prompts']
  },
  {
    category: 'testimonial',
    name: 'Testimonial / Kundenstimmen',
    description: 'Authentische Kundenerfahrungen und Erfolgsgeschichten',
    icon: '💬',
    color: 'from-amber-500 to-yellow-500',
    recommendedDuration: '60-120 Sekunden',
    exampleUseCase: 'Kundenreferenz, Case Study, Erfolgsgeschichte',
    features: ['Authentizität', 'Vorher/Nachher', 'Emotionale Verbindung']
  },
  {
    category: 'explainer',
    name: 'Erklärvideo',
    description: 'Komplexe Themen einfach erklärt',
    icon: '💡',
    color: 'from-indigo-500 to-violet-500',
    recommendedDuration: '60-180 Sekunden',
    exampleUseCase: 'Produkterklärung, Service-Vorstellung, Konzept-Erklärung',
    features: ['Problem-Lösung', 'Visuelle Metaphern', 'Klare Struktur']
  },
  {
    category: 'event',
    name: 'Event / Veranstaltung',
    description: 'Eventankündigungen und Rückblicke',
    icon: '🎉',
    color: 'from-teal-500 to-cyan-500',
    recommendedDuration: '30-120 Sekunden',
    exampleUseCase: 'Eventankündigung, Konferenz-Teaser, Rückblick',
    features: ['Highlights', 'Speaker-Vorstellung', 'Registrierung-CTA']
  },
  {
    category: 'promo',
    name: 'Promo / Teaser',
    description: 'Kurze Teaser und Ankündigungen',
    icon: '🎬',
    color: 'from-orange-500 to-red-500',
    recommendedDuration: '15-45 Sekunden',
    exampleUseCase: 'Produkt-Teaser, Launch-Ankündigung, Coming Soon',
    features: ['Spannung aufbauen', 'Mystery-Elemente', 'Countdown']
  },
  {
    category: 'presentation',
    name: 'Präsentation / Pitch',
    description: 'Überzeugende Präsentationen und Pitches',
    icon: '📊',
    color: 'from-blue-600 to-indigo-600',
    recommendedDuration: '60-180 Sekunden',
    exampleUseCase: 'Investor-Pitch, Sales-Präsentation, Konzept-Pitch',
    features: ['Daten-Visualisierung', 'Überzeugende Argumente', 'Klare Struktur']
  },
  {
    category: 'custom',
    name: 'Benutzerdefiniert',
    description: 'Erstellen Sie ein individuelles Video nach Ihren Wünschen',
    icon: '✨',
    color: 'from-violet-500 to-purple-600',
    recommendedDuration: 'Flexibel',
    exampleUseCase: 'Individuelles Projekt, Sonderformat, Kreatives Experiment',
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
