// Explainer Studio Types - Loft-Film Niveau

export type ExplainerStyle = 
  | 'flat-design' 
  | 'isometric' 
  | 'whiteboard' 
  | 'comic' 
  | 'corporate' 
  | 'modern-3d'
  | 'cinematic'
  | 'photo-realistic'
  | 'hand-drawn'
  | 'vintage-retro'
  | 'bold-colorful'
  | 'minimalist'
  | 'cartoon'
  | 'watercolor'
  | 'neon-cyberpunk'
  | 'paper-cutout'
  | 'clay-3d'
  | 'anime'
  | 'custom';

export type ExplainerTone = 
  | 'professional' 
  | 'friendly' 
  | 'energetic' 
  | 'serious' 
  | 'playful';

export type ExplainerDuration = 30 | 60 | 90 | 120;

export type ExplainerLanguage = 'de' | 'en' | 'es' | 'fr' | 'it' | 'pt' | 'nl' | 'de-ch' | 'pl' | 'ru' | 'ja' | 'ko' | 'zh';

export type VoiceStyle = 'friendly' | 'professional' | 'energetic' | 'calm';
export type MusicStyle = 'upbeat' | 'relaxed' | 'cinematic' | 'corporate' | 'none';

// Extended Consultation Result for Full-Service Mode - Loft-Film 15-Phasen
export interface ConsultationResult {
  // Basic recommendations
  recommendedStyle: ExplainerStyle;
  recommendedTone: ExplainerTone;
  recommendedDuration: ExplainerDuration;
  targetAudience: string[];
  productSummary: string;
  strategyTips: string[];
  platformTips: string[];
  
  // Mode choice for workflow control
  modeChoice?: 'full-service' | 'manual';
  
  // 🎬 NEW: Loft-Film Deep-Dive Fields (15-Phasen Interview)
  
  // Core Problem & Emotional Hook
  coreProblem?: string;           // Das EINE Hauptproblem
  emotionalHook?: string;         // Gewünschte Emotion des Zuschauers
  
  // Stats & Numbers for Credibility
  statsAndNumbers?: string[];     // ["87% sparen Zeit", "3x schneller"]
  
  // Brand Colors (Hex Codes)
  brandColors?: {
    primary?: string;              // "#F5C76A"
    secondary?: string;            // "#0f172a"
    accent?: string;               // "#22d3ee"
  };
  
  // Exact CTA
  ctaText?: string;                // "Jetzt kostenlos starten"
  ctaUrl?: string;                 // "useadtool.ai/signup"
  
  // Intro Hook (First 3 Seconds)
  introHookSentence?: string;      // Der erste Satz für Aufmerksamkeit
  
  // Reference Links for Inspiration
  referenceLinks?: string[];       // Inspirations-URLs
  
  // Preferred Font Style
  preferredFont?: 'poppins' | 'outfit' | 'dm-sans' | 'auto';
  
  // Animation Quality (Hailuo) - Phase 6: Premium is now default for 95%+ Loft-Film quality
  animationQuality?: 'standard' | 'premium' | 'animated';
  enableHailuoAnimation?: boolean;
  
  // Custom Style
  isCustomStyle?: boolean;
  customStyleDescription?: string;
  styleReferenceUrl?: string;
  extractedStyleGuide?: ExtractedStyleGuide;
  
  // Product Details (from extended consultation)
  productDetails?: ProductDetails;
  
  // Audience Details (from extended consultation)
  audienceDetails?: AudienceDetails;
  
  // Audio Preferences
  audioPreferences?: AudioPreferences;
  
  // Competition Analysis
  competitorInsights?: string[];
  differentiators?: string[];
  
  // Character Preferences
  characterPreferences?: CharacterPreferences;
  
  // Format Preferences
  primaryFormat?: '16:9' | '9:16' | '1:1';
  exportAllFormats?: boolean;
}

export interface ExtractedStyleGuide {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  visualStyle: 'geometric' | 'organic' | 'mixed' | 'minimalist' | 'detailed';
  characterType: 'realistic' | 'cartoon' | 'abstract' | 'none';
  animationStyle: 'smooth' | 'dynamic' | 'minimal' | 'playful';
  moodBoard: string; // AI-generated consistency prompt
}

export interface ProductDetails {
  name: string;
  type: 'saas' | 'physical' | 'service' | 'app' | 'other';
  features: string[];
  uniqueSellingPoint: string;
  pricing?: string;
  cta?: string;
  painPointsSolved: string[];
}

export interface AudienceDetails {
  demographics: string;
  industry?: string;
  painPoints: string[];
  desiredOutcome: string;
  objections?: string[];
  languageStyle?: string;
}

export interface AudioPreferences {
  language: ExplainerLanguage;
  voiceGender: 'male' | 'female';
  voiceStyle: VoiceStyle;
  voiceId?: string;
  voiceName?: string;
  musicStyle: MusicStyle;
  musicTempo?: 'slow' | 'medium' | 'fast';
  includeSoundEffects?: boolean;
}

export interface CharacterPreferences {
  hasCharacter: boolean;
  gender?: 'male' | 'female' | 'neutral';
  ageRange?: 'child' | 'young-adult' | 'adult' | 'senior';
  appearance?: string;
  personality?: string;
  clothing?: string;
}

export interface CharacterDefinition {
  hasCharacter: boolean;
  gender?: 'male' | 'female' | 'neutral';
  ageRange?: 'child' | 'young-adult' | 'adult' | 'senior';
  appearance?: string;
  clothing?: string;
  characterSheetUrl?: string;
  styleSeed?: string;
}

export interface StyleGuide {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  visualElements?: string[];
  consistencyPrompt?: string;
}

export interface ExplainerBriefing {
  productDescription: string;
  targetAudience: string[];
  style: ExplainerStyle;
  tone: ExplainerTone;
  duration: ExplainerDuration;
  language: ExplainerLanguage;
  voiceId: string;
  voiceName: string;
  brandColors?: string[];
  logoUrl?: string;
  character?: CharacterDefinition;
  styleGuide?: StyleGuide;
  
  // NEW: Extended fields from consultation
  productDetails?: ProductDetails;
  audienceDetails?: AudienceDetails;
  audioPreferences?: AudioPreferences;
  customStyleDescription?: string;
  extractedStyleGuide?: ExtractedStyleGuide;
}

export interface ScriptScene {
  id: string;
  type: 'hook' | 'problem' | 'solution' | 'feature' | 'proof' | 'cta';
  title: string;
  spokenText: string;
  visualDescription: string;
  durationSeconds: number;
  startTime: number;
  endTime: number;
  emotionalTone: string;
  keyElements?: string[];
}

export interface ExplainerScript {
  id: string;
  title: string;
  synopsis: string;
  totalDuration: number;
  scenes: ScriptScene[];
  createdAt: string;
}

export interface GeneratedAsset {
  id: string;
  sceneId: string;
  type: 'background' | 'character' | 'icon' | 'element';
  imageUrl: string;
  prompt: string;
  style: ExplainerStyle;
  isPremium?: boolean;
}

export interface ExplainerProject {
  id: string;
  userId: string;
  name: string;
  briefing: ExplainerBriefing;
  script?: ExplainerScript;
  assets: GeneratedAsset[];
  voiceoverUrl?: string;
  backgroundMusicUrl?: string;
  renderedVideoUrl?: string;
  status: 'briefing' | 'script' | 'visuals' | 'animation' | 'audio' | 'export' | 'completed';
  createdAt: string;
  updatedAt: string;
  
  // NEW: Auto-generation status
  isAutoGenerated?: boolean;
  autoGenerationProgress?: AutoGenerationProgress;
}

export interface AutoGenerationProgress {
  currentStep: AutoGenerationStep;
  completedSteps: AutoGenerationStep[];
  totalSteps: number;
  progress: number;
  startedAt: string;
  estimatedCompletion?: string;
  error?: string;
}

export type AutoGenerationStep = 
  | 'script' 
  | 'character-sheet' 
  | 'visuals' 
  | 'voiceover' 
  | 'music' 
  | 'sound-effects' 
  | 'render-16-9' 
  | 'render-9-16' 
  | 'render-1-1';

export interface VoiceOption {
  id: string;
  name: string;
  language: ExplainerLanguage;
  gender: 'male' | 'female';
  style: string;
  previewUrl?: string;
}

export interface StylePreset {
  id: ExplainerStyle;
  name: string;
  description: string;
  previewImage: string;
  colors: string[];
  characteristics: string[];
}

// Generation Mode Selection
export type GenerationMode = 'full-service' | 'manual';

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: 'flat-design',
    name: 'Flat Design',
    description: 'Moderne, klare Formen ohne Schatten. Perfekt für B2B SaaS & Tech.',
    previewImage: '/placeholder.svg',
    colors: ['#4F46E5', '#10B981', '#F59E0B'],
    characteristics: ['Einfache Formen', 'Keine Schatten', 'Leuchtende Farben']
  },
  {
    id: 'isometric',
    name: 'Isometrisch',
    description: '3D-Perspektive für technische Prozesse und Workflows.',
    previewImage: '/placeholder.svg',
    colors: ['#3B82F6', '#8B5CF6', '#EC4899'],
    characteristics: ['3D-Perspektive', 'Technisch', 'Detailreich']
  },
  {
    id: 'whiteboard',
    name: 'Whiteboard',
    description: 'Handgezeichneter Marker-Stil für Erklärungen und Tutorials.',
    previewImage: '/placeholder.svg',
    colors: ['#1F2937', '#EF4444', '#3B82F6'],
    characteristics: ['Handgezeichnet', 'Marker-Stil', 'Skizzenartig']
  },
  {
    id: 'comic',
    name: 'Comic',
    description: 'Lebendige Farben und ausdrucksstarke Charaktere für B2C.',
    previewImage: '/placeholder.svg',
    colors: ['#EF4444', '#FBBF24', '#22C55E'],
    characteristics: ['Lebendige Farben', 'Expressive Charaktere', 'Dynamisch']
  },
  {
    id: 'corporate',
    name: 'Corporate',
    description: 'Seriös und professionell für Enterprise und Finance.',
    previewImage: '/placeholder.svg',
    colors: ['#1E3A5F', '#64748B', '#0EA5E9'],
    characteristics: ['Professionell', 'Gedämpfte Farben', 'Seriös']
  },
  {
    id: 'modern-3d',
    name: 'Modern 3D',
    description: 'Glassmorphism und Gradients für Premium-Produkte.',
    previewImage: '/placeholder.svg',
    colors: ['#8B5CF6', '#EC4899', '#06B6D4'],
    characteristics: ['Glassmorphism', 'Gradients', 'Premium-Look']
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    description: 'Filmische Tiefenschärfe und dramatische Beleuchtung.',
    previewImage: '/placeholder.svg',
    colors: ['#1a1a2e', '#e94560', '#f5c76a'],
    characteristics: ['Dramatisch', 'Tiefenschärfe', 'Filmisch']
  },
  {
    id: 'photo-realistic',
    name: 'Fotorealistisch',
    description: 'Fotorealistische Szenen mit natürlichen Texturen.',
    previewImage: '/placeholder.svg',
    colors: ['#8B7355', '#D4C5A9', '#2E4057'],
    characteristics: ['Fotorealistisch', 'Natürlich', 'Professionell']
  },
  {
    id: 'hand-drawn',
    name: 'Handgezeichnet',
    description: 'Bleistift-Skizzen mit künstlerischem Charme.',
    previewImage: '/placeholder.svg',
    colors: ['#2C2C2C', '#B0B0B0', '#E8DCC8'],
    characteristics: ['Skizzenhaft', 'Künstlerisch', 'Authentisch']
  },
  {
    id: 'vintage-retro',
    name: 'Vintage Retro',
    description: '70er/80er Retro-Look mit warmen Erdtönen.',
    previewImage: '/placeholder.svg',
    colors: ['#C17817', '#8B4513', '#D2691E'],
    characteristics: ['Retro', 'Warme Töne', 'Nostalgisch']
  },
  {
    id: 'bold-colorful',
    name: 'Bold & Colorful',
    description: 'Kräftige Pop-Art-Farben für maximale Aufmerksamkeit.',
    previewImage: '/placeholder.svg',
    colors: ['#FF1493', '#00FF7F', '#FFD700'],
    characteristics: ['Pop-Art', 'Kräftig', 'Auffällig']
  },
  {
    id: 'minimalist',
    name: 'Minimalistisch',
    description: 'Extrem reduziert mit viel Weißraum und einem Akzent.',
    previewImage: '/placeholder.svg',
    colors: ['#F5F5F5', '#333333', '#FF4444'],
    characteristics: ['Reduziert', 'Weißraum', 'Fokussiert']
  },
  {
    id: 'cartoon',
    name: 'Cartoon',
    description: 'Bunter Cartoon-Stil mit übertriebenen Proportionen.',
    previewImage: '/placeholder.svg',
    colors: ['#FF6B6B', '#4ECDC4', '#FFE66D'],
    characteristics: ['Verspielt', 'Bunt', 'Übertrieben']
  },
  {
    id: 'watercolor',
    name: 'Aquarell',
    description: 'Weiche Aquarell-Ästhetik mit künstlerischen Verläufen.',
    previewImage: '/placeholder.svg',
    colors: ['#7FB3D8', '#F0C8A8', '#A8D8B9'],
    characteristics: ['Weich', 'Künstlerisch', 'Fließend']
  },
  {
    id: 'neon-cyberpunk',
    name: 'Neon Cyberpunk',
    description: 'Futuristischer Neon-Stil mit leuchtenden Kanten.',
    previewImage: '/placeholder.svg',
    colors: ['#0D0D0D', '#00FFFF', '#FF00FF'],
    characteristics: ['Futuristisch', 'Neon', 'Dunkel']
  },
  {
    id: 'paper-cutout',
    name: 'Scherenschnitt',
    description: 'Papier-Scherenschnitt mit geschichteten Texturen.',
    previewImage: '/placeholder.svg',
    colors: ['#E8D5B7', '#C75B39', '#4A7C59'],
    characteristics: ['Papier', 'Geschichtet', 'Handgemacht']
  },
  {
    id: 'clay-3d',
    name: 'Clay / Knete',
    description: 'Claymation-Look wie Stop-Motion mit Knete-Texturen.',
    previewImage: '/placeholder.svg',
    colors: ['#E8A87C', '#85CDCA', '#D72638'],
    characteristics: ['Knete', 'Stop-Motion', 'Taktil']
  },
  {
    id: 'anime',
    name: 'Anime',
    description: 'Japanischer Anime-Stil mit Cel-Shading und lebhaften Farben.',
    previewImage: '/placeholder.svg',
    colors: ['#FF6B9D', '#C44DFF', '#4DA6FF'],
    characteristics: ['Cel-Shading', 'Japanisch', 'Lebhaft']
  },
  {
    id: 'custom',
    name: 'Custom Style',
    description: 'Definiere deinen eigenen einzigartigen Stil.',
    previewImage: '/placeholder.svg',
    colors: ['#F5C76A', '#22d3ee', '#8B5CF6'],
    characteristics: ['Individuell', 'Markenspezifisch', 'Einzigartig']
  }
];

export const VOICE_OPTIONS: VoiceOption[] = [
  // German
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', language: 'de', gender: 'female', style: 'Freundlich & Warm' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', language: 'de', gender: 'male', style: 'Professionell' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', language: 'de', gender: 'male', style: 'Vertrauenswürdig' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', language: 'de', gender: 'female', style: 'Energetisch' },
  // Swiss German
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah (CH)', language: 'de-ch', gender: 'female', style: 'Freundlich' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'Georg (CH)', language: 'de-ch', gender: 'male', style: 'Professionell' },
  // English
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', language: 'en', gender: 'male', style: 'Confident' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', language: 'en', gender: 'female', style: 'Friendly' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', language: 'en', gender: 'female', style: 'Professional' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric', language: 'en', gender: 'male', style: 'Dynamic' },
  // French
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', language: 'fr', gender: 'female', style: 'Élégant' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie', language: 'fr', gender: 'male', style: 'Charmant' },
  // Italian
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', language: 'it', gender: 'female', style: 'Espressivo' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', language: 'it', gender: 'male', style: 'Professionale' },
  // Spanish
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum', language: 'es', gender: 'male', style: 'Cálido' },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', language: 'es', gender: 'female', style: 'Amable' },
  // Portuguese
  { id: 'SAz9YHcvj6GT2YYXdXww', name: 'River', language: 'pt', gender: 'female', style: 'Suave' },
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Will', language: 'pt', gender: 'male', style: 'Confiante' },
  // Dutch
  { id: 'iP95p4xoKVk53GoZ742B', name: 'Chris', language: 'nl', gender: 'male', style: 'Vriendelijk' },
  { id: '9BWtsMINqrJLrRacOk9x', name: 'Aria', language: 'nl', gender: 'female', style: 'Helder' },
];

export const DURATION_OPTIONS = [
  { value: 30 as ExplainerDuration, label: '30 Sekunden', description: 'Kurz & Knackig' },
  { value: 60 as ExplainerDuration, label: '60 Sekunden', description: 'Standard' },
  { value: 90 as ExplainerDuration, label: '90 Sekunden', description: 'Ausführlich' },
  { value: 120 as ExplainerDuration, label: '2 Minuten', description: 'Detailliert' },
];

export const TONE_OPTIONS = [
  { value: 'professional' as ExplainerTone, label: 'Professionell', emoji: '💼' },
  { value: 'friendly' as ExplainerTone, label: 'Freundlich', emoji: '😊' },
  { value: 'energetic' as ExplainerTone, label: 'Energetisch', emoji: '⚡' },
  { value: 'serious' as ExplainerTone, label: 'Seriös', emoji: '🎯' },
  { value: 'playful' as ExplainerTone, label: 'Spielerisch', emoji: '🎨' },
];

export const TARGET_AUDIENCE_OPTIONS = [
  'Marketing Manager',
  'Startups',
  'KMU',
  'Enterprise',
  'Entwickler',
  'Designer',
  'Geschäftsführer',
  'Freelancer',
  'E-Commerce',
  'SaaS-Nutzer'
];

export const MUSIC_STYLE_OPTIONS = [
  { value: 'upbeat' as MusicStyle, label: 'Upbeat', emoji: '🎉', description: 'Energetisch & Motivierend' },
  { value: 'relaxed' as MusicStyle, label: 'Entspannt', emoji: '🌊', description: 'Ruhig & Vertrauenswürdig' },
  { value: 'cinematic' as MusicStyle, label: 'Cinematic', emoji: '🎬', description: 'Episch & Eindrucksvoll' },
  { value: 'corporate' as MusicStyle, label: 'Corporate', emoji: '💼', description: 'Professionell & Neutral' },
  { value: 'none' as MusicStyle, label: 'Keine Musik', emoji: '🔇', description: 'Nur Sprache' },
];
