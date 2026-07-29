/**
 * Central language catalogue for the ElevenLabs voice library.
 * Keep in sync with `supabase/functions/_shared/tts-language.ts`.
 */

export interface VoiceLanguageOption {
  code: string;
  label: string;
  flag: string;
}

/** Languages that actually exist in `voice_library_cache`, most-populated first. */
export const VOICE_LANGUAGES: VoiceLanguageOption[] = [
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', label: 'Português', flag: '🇵🇹' },
  { code: 'nl', label: 'Nederlands', flag: '🇳🇱' },
  { code: 'pl', label: 'Polski', flag: '🇵🇱' },
  { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
  { code: 'sv', label: 'Svenska', flag: '🇸🇪' },
  { code: 'fi', label: 'Suomi', flag: '🇫🇮' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'uk', label: 'Українська', flag: '🇺🇦' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
  { code: 'hi', label: 'हिन्दी', flag: '🇮🇳' },
  { code: 'ta', label: 'தமிழ்', flag: '🇮🇳' },
  { code: 'id', label: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
];

const CODES = new Set(VOICE_LANGUAGES.map((l) => l.code));

/** Normalises `de-DE`, `DE`, `de_AT` → `de`. Returns null for unknown languages. */
export function normalizeVoiceLanguage(input?: string | null): string | null {
  if (!input) return null;
  const base = String(input).toLowerCase().trim().replace('_', '-').split('-')[0];
  return CODES.has(base) ? base : null;
}

/** Same as above, but falls back to `all` (no filter) instead of null. */
export function toPickerLanguage(input?: string | null): string {
  return normalizeVoiceLanguage(input) ?? 'all';
}

export function voiceLanguageLabel(code?: string | null): string {
  const norm = normalizeVoiceLanguage(code);
  if (!norm) return 'Alle Sprachen';
  const found = VOICE_LANGUAGES.find((l) => l.code === norm);
  return found ? `${found.flag} ${found.label}` : norm.toUpperCase();
}

/** Languages where an English/American accent counts as non-native. */
export const NATIVE_SENSITIVE_LANGUAGES = new Set([
  'de', 'es', 'fr', 'it', 'pt', 'nl', 'pl', 'tr', 'sv', 'fi', 'ru', 'uk', 'ar', 'hi', 'ja', 'ko', 'zh',
]);

/** Short native sample sentences used for voice previews. */
export const VOICE_PREVIEW_SAMPLES: Record<string, string> = {
  de: 'Hallo, so klingt meine Stimme. Ich freue mich darauf, deinen Text vorzulesen.',
  en: 'Hello, this is how my voice sounds. I look forward to reading your text.',
  es: 'Hola, así suena mi voz. Tengo muchas ganas de leer tu texto.',
  fr: 'Bonjour, voici à quoi ressemble ma voix. J’ai hâte de lire votre texte.',
  it: 'Ciao, ecco come suona la mia voce. Non vedo l’ora di leggere il tuo testo.',
  pt: 'Olá, é assim que soa a minha voz. Mal posso esperar para ler o seu texto.',
  nl: 'Hallo, zo klinkt mijn stem. Ik lees graag jouw tekst voor.',
  pl: 'Cześć, tak brzmi mój głos. Chętnie przeczytam twój tekst.',
  tr: 'Merhaba, sesim böyle geliyor. Metnini okumak için sabırsızlanıyorum.',
  sv: 'Hej, så här låter min röst. Jag ser fram emot att läsa din text.',
  fi: 'Hei, tältä ääneni kuulostaa. Odotan innolla tekstisi lukemista.',
  ru: 'Здравствуйте, так звучит мой голос. С радостью прочитаю ваш текст.',
  uk: 'Вітаю, так звучить мій голос. Залюбки прочитаю ваш текст.',
  ar: 'مرحباً، هكذا يبدو صوتي. يسعدني أن أقرأ نصك.',
  hi: 'नमस्ते, मेरी आवाज़ ऐसी लगती है। मुझे आपका पाठ पढ़कर खुशी होगी।',
  ta: 'வணக்கம், என் குரல் இப்படித்தான் ஒலிக்கும். உங்கள் உரையை வாசிக்க ஆவலாக உள்ளேன்.',
  id: 'Halo, beginilah suara saya. Saya senang membacakan teks Anda.',
  vi: 'Xin chào, đây là giọng nói của tôi. Tôi rất mong được đọc văn bản của bạn.',
  ja: 'こんにちは、これが私の声です。あなたのテキストを読むのを楽しみにしています。',
  ko: '안녕하세요, 제 목소리는 이렇습니다. 당신의 글을 읽어드릴 수 있어 기쁩니다.',
  zh: '你好，这就是我的声音。我很期待为你朗读文本。',
};

export function voicePreviewSample(code?: string | null): string {
  const norm = normalizeVoiceLanguage(code);
  return (norm && VOICE_PREVIEW_SAMPLES[norm]) || VOICE_PREVIEW_SAMPLES.en;
}

