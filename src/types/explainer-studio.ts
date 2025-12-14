// Explainer Studio Types

export type ExplainerStyle = 
  | 'flat-design' 
  | 'isometric' 
  | 'whiteboard' 
  | 'comic' 
  | 'corporate' 
  | 'modern-3d';

export type ExplainerTone = 
  | 'professional' 
  | 'friendly' 
  | 'energetic' 
  | 'serious' 
  | 'playful';

export type ExplainerDuration = 30 | 60 | 90 | 120;

export type ExplainerLanguage = 'de' | 'en' | 'es' | 'fr' | 'it' | 'pt';

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
}

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
  }
];

export const VOICE_OPTIONS: VoiceOption[] = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', language: 'de', gender: 'female', style: 'Freundlich & Warm' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', language: 'de', gender: 'male', style: 'Professionell' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', language: 'de', gender: 'male', style: 'Vertrauenswürdig' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', language: 'de', gender: 'female', style: 'Energetisch' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', language: 'en', gender: 'male', style: 'Confident' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', language: 'en', gender: 'female', style: 'Friendly' },
  { id: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica', language: 'en', gender: 'female', style: 'Professional' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric', language: 'en', gender: 'male', style: 'Dynamic' },
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
