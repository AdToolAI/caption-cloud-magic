// Universal Video Creator Types - 9 Video-Kategorien (ohne Erklärvideo)

export type VideoCategory = 
  | 'werbevideo'      // Werbespot, Produkt-Promo
  | 'storytelling'    // Emotionale Brand Story
  | 'social-media'    // TikTok, Reels, Shorts
  | 'testimonial'     // Kundenstimmen
  | 'tutorial'        // How-To, Anleitungen
  | 'event-promo'     // Veranstaltungswerbung
  | 'brand-story'     // Unternehmensvorstellung
  | 'produktdemo'     // Features & Funktionen
  | 'recruitment';    // Employer Branding

export type CreationMode = 'full-service' | 'manual';

export type VideoDuration = 15 | 30 | 45 | 60 | 90 | 120 | 180 | 240 | 300;

export interface CategoryConfig {
  id: VideoCategory;
  name: string;
  description: string;
  icon: string;
  color: string;
  typicalDuration: string;
  interviewPhases: number;
}

export const VIDEO_CATEGORIES: CategoryConfig[] = [
  {
    id: 'werbevideo',
    name: 'Werbevideo',
    description: 'Werbespot, Produkt-Promo, Ads für Social Media',
    icon: '📺',
    color: 'from-amber-500 to-orange-600',
    typicalDuration: '15-60 Sek',
    interviewPhases: 20,
  },
  {
    id: 'storytelling',
    name: 'Storytelling',
    description: 'Emotionale Brand Stories, Narrative Videos',
    icon: '📖',
    color: 'from-purple-500 to-pink-600',
    typicalDuration: '60-300 Sek',
    interviewPhases: 22,
  },
  {
    id: 'social-media',
    name: 'Social Media',
    description: 'TikTok, Instagram Reels, YouTube Shorts',
    icon: '📱',
    color: 'from-cyan-500 to-blue-600',
    typicalDuration: '15-60 Sek',
    interviewPhases: 18,
  },
  {
    id: 'testimonial',
    name: 'Testimonial',
    description: 'Kundenstimmen, Reviews, Case Studies',
    icon: '🗣️',
    color: 'from-green-500 to-emerald-600',
    typicalDuration: '30-120 Sek',
    interviewPhases: 19,
  },
  {
    id: 'tutorial',
    name: 'Tutorial',
    description: 'How-To Videos, Anleitungen, Erklärungen',
    icon: '📚',
    color: 'from-blue-500 to-indigo-600',
    typicalDuration: '60-300 Sek',
    interviewPhases: 22,
  },
  {
    id: 'event-promo',
    name: 'Event Promo',
    description: 'Veranstaltungswerbung, Konferenzen, Webinare',
    icon: '🎪',
    color: 'from-rose-500 to-red-600',
    typicalDuration: '30-90 Sek',
    interviewPhases: 18,
  },
  {
    id: 'brand-story',
    name: 'Brand Story',
    description: 'Unternehmensvorstellung, Über uns',
    icon: '🏢',
    color: 'from-slate-500 to-gray-600',
    typicalDuration: '60-180 Sek',
    interviewPhases: 20,
  },
  {
    id: 'produktdemo',
    name: 'Produktdemo',
    description: 'Features & Funktionen, Software-Demos',
    icon: '💼',
    color: 'from-teal-500 to-cyan-600',
    typicalDuration: '60-180 Sek',
    interviewPhases: 21,
  },
  {
    id: 'recruitment',
    name: 'Recruitment',
    description: 'Stellenanzeigen, Employer Branding',
    icon: '👔',
    color: 'from-violet-500 to-purple-600',
    typicalDuration: '45-120 Sek',
    interviewPhases: 19,
  },
];

// Consultation Result from AI Interview
export interface UniversalVideoConsultationResult {
  category: VideoCategory;
  
  // Common fields across all categories
  targetAudience?: string;
  emotionalTrigger?: string;
  visualStyle?: string;
  brandColors?: string[];
  brandGuidelines?: string;
  voiceOverStyle?: string;
  musicMood?: string;
  duration?: VideoDuration;
  formats?: ('16:9' | '9:16' | '1:1')[];
  
  // Feature toggles
  subtitlesEnabled: boolean;
  exportToDirectorsCut: boolean;
  
  // Category-specific fields
  categorySpecificData: Record<string, any>;
  
  // CTA
  ctaText?: string;
  ctaUrl?: string;
  
  // Full interview transcript
  interviewTranscript: InterviewMessage[];
}

export interface InterviewMessage {
  role: 'assistant' | 'user';
  content: string;
  phase?: number;
  timestamp: string;
}

export interface InterviewPhase {
  id: number;
  name: string;
  question: string;
  quickReplies?: string[];
  extractionKey: string;
  required: boolean;
}

// Category-specific interview configurations
export interface CategoryInterviewConfig {
  category: VideoCategory;
  systemPrompt: string;
  phases: InterviewPhase[];
}

// Script structure for different categories
export interface UniversalVideoScript {
  category: VideoCategory;
  scenes: UniversalVideoScene[];
  totalDuration: number;
  voiceoverText: string;
}

export interface UniversalVideoScene {
  id: string;
  sceneType: string; // category-specific (e.g., 'hook', 'problem', 'solution', 'cta')
  duration: number;
  startTime: number;
  endTime: number;
  spokenText: string;
  visualDescription: string;
  textOverlays?: string[];
  transitionIn?: string;
  transitionOut?: string;
}

// Generation progress tracking
export interface UniversalVideoGenerationProgress {
  id: string;
  userId: string;
  category: VideoCategory;
  status: 'pending' | 'script' | 'visuals' | 'voiceover' | 'music' | 'render' | 'completed' | 'failed';
  currentStep: string;
  progressPercent: number;
  consultationResult?: UniversalVideoConsultationResult;
  script?: UniversalVideoScript;
  scenes?: any[];
  voiceoverUrl?: string;
  backgroundMusicUrl?: string;
  renderResults?: Record<string, string>;
  error?: string;
  createdAt: string;
  updatedAt: string;
}
