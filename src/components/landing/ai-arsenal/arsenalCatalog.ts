import type { Language } from "@/lib/translations";
import videoHero from "@/assets/landing/ai-arsenal/video-hero.jpg";
import videoKling from "@/assets/landing/ai-arsenal/video-kling.jpg";
import videoSora from "@/assets/landing/ai-arsenal/video-sora.jpg";
import imageHero from "@/assets/landing/ai-arsenal/image-hero.jpg";
import audioHero from "@/assets/landing/ai-arsenal/audio-hero.jpg";
import avatarHero from "@/assets/landing/ai-arsenal/avatar-hero.jpg";

// -------- Provider-style still covers (batch 2026-07-14) --------
import coverVeoPro from "@/assets/landing/ai-arsenal/gen/veo-pro.jpg";
import coverWanPro from "@/assets/landing/ai-arsenal/gen/wan-pro.jpg";
import coverHailuo from "@/assets/landing/ai-arsenal/gen/hailuo-pro.jpg";
import coverLuma from "@/assets/landing/ai-arsenal/gen/luma-pro.jpg";
import coverRunway from "@/assets/landing/ai-arsenal/gen/runway-aleph.jpg";
import coverPika from "@/assets/landing/ai-arsenal/gen/pika-pro.jpg";
import coverNano from "@/assets/landing/ai-arsenal/gen/nano-banana.jpg";
import coverGeminiFlash from "@/assets/landing/ai-arsenal/gen/gemini-flash.jpg";
import coverFluxFill from "@/assets/landing/ai-arsenal/gen/flux-fill.jpg";
import coverClarity from "@/assets/landing/ai-arsenal/gen/clarity-upscaler.jpg";
import coverElevenMusic from "@/assets/landing/ai-arsenal/gen/elevenlabs-music.jpg";
import coverMinimax from "@/assets/landing/ai-arsenal/gen/minimax-music.jpg";
import coverStableAudio from "@/assets/landing/ai-arsenal/gen/stable-audio.jpg";
import coverElevenTts from "@/assets/landing/ai-arsenal/gen/elevenlabs-tts.jpg";
import coverVoiceClone from "@/assets/landing/ai-arsenal/gen/voice-clone.jpg";
import coverBrandLock from "@/assets/landing/ai-arsenal/gen/brand-lock.jpg";
import coverCastWorld from "@/assets/landing/ai-arsenal/gen/cast-world.jpg";

// -------- Animated flagship loops (asset.json pointers) --------
import soraLoop from "@/assets/landing/ai-arsenal/gen/sora-loop.mp4.asset.json";
import klingLoop from "@/assets/landing/ai-arsenal/gen/kling-loop.mp4.asset.json";
import veoLoop from "@/assets/landing/ai-arsenal/gen/veo-loop.mp4.asset.json";

export type ArsenalCategory = "video" | "image" | "audio" | "avatar";

export interface ArsenalModel {
  id: string;
  category: ArsenalCategory;
  /** Localized display name per language */
  name: Record<Language, string>;
  /** Short localized tagline */
  tagline: Record<Language, string>;
  /** Short capability chips (already localized) */
  caps: Record<Language, string[]>;
  /** Cover image (optional; falls back to genre hero) */
  cover?: string;
  /** Optional animated loop URL (mp4) — displayed on hover / when in view */
  loop?: string;
  recommended?: boolean;
  /** Optional featured/hero flag inside category (goes first) */
  hero?: boolean;
}

const cap = (en: string, de: string, es: string) => ({ en, de, es });

// -------------- helper factory --------------
const m = (
  id: string,
  category: ArsenalCategory,
  names: [string, string, string],
  taglines: [string, string, string],
  caps: Array<{ en: string; de: string; es: string }>,
  extras: Partial<Pick<ArsenalModel, "cover" | "loop" | "recommended" | "hero">> = {}
): ArsenalModel => ({
  id,
  category,
  name: { en: names[0], de: names[1], es: names[2] },
  tagline: { en: taglines[0], de: taglines[1], es: taglines[2] },
  caps: {
    en: caps.map((c) => c.en),
    de: caps.map((c) => c.de),
    es: caps.map((c) => c.es),
  },
  ...extras,
});

// Reused caps
const T2V = cap("Text→Video", "Text→Video", "Texto→Vídeo");
const I2V = cap("Image→Video", "Bild→Video", "Imagen→Vídeo");
const V2V = cap("Video→Video", "Video→Video", "Vídeo→Vídeo");
const P1080 = cap("1080p", "1080p", "1080p");
const NATIVE_LIP = cap("Native Lip-Sync", "Native Lip-Sync", "Lip-Sync Nativo");
const CAM = cap("Camera Ctrl", "Kamera-Ctrl", "Ctrl. Cámara");
const DIR = cap("Director Ctrl", "Regie-Ctrl", "Ctrl. Director");
const FAST = cap("Fast", "Schnell", "Rápido");
const KEYS = cap("Keyframes", "Keyframes", "Keyframes");
const MULTIREF = cap("Multi-Ref", "Multi-Ref", "Multi-Ref");
const T2I = cap("Text→Image", "Text→Bild", "Texto→Imagen");
const EDIT = cap("Edit", "Edit", "Editar");
const INPAINT = cap("Inpaint", "Inpaint", "Inpaint");
const UPS4 = cap("4× Upscale", "4× Upscale", "Escalado 4×");
const STYLE = cap("Style Ref", "Style Ref", "Ref. Estilo");
const MUSIC = cap("Music", "Musik", "Música");
const SFX = cap("SFX", "SFX", "SFX");
const VOCAL = cap("Vocals", "Vocals", "Vocales");
const VOICE = cap("Voice TTS", "Voice TTS", "Voz TTS");
const MULTILANG = cap("30+ Lang", "30+ Sprachen", "30+ idiomas");
const CLONE = cap("Voice Clone", "Stimm-Klon", "Clon de Voz");
const TALK = cap("Talking Head", "Talking Head", "Talking Head");
const LIP = cap("Lip Sync", "Lip Sync", "Lip-Sync");
const CONS = cap("Char Lock", "Char-Lock", "Char-Lock");

// -------------- catalog --------------
export const ARSENAL_CATALOG: ArsenalModel[] = [
  // ============ VIDEO ============
  m("kling-omni", "video",
    ["Kling Omni", "Kling Omni", "Kling Omni"],
    [
      "Native lip-sync in the model itself — no post-sync needed.",
      "Natives Lip-Sync direkt im Modell — kein Nachsyncen mehr.",
      "Lip-sync nativo dentro del propio modelo — sin post-sync.",
    ],
    [T2V, I2V, NATIVE_LIP, P1080],
    { cover: videoKling, loop: klingLoop.url, hero: true, recommended: true }
  ),
  m("sora-2", "video",
    ["OpenAI Sora 2", "OpenAI Sora 2", "OpenAI Sora 2"],
    [
      "Photoreal storytelling with deep prompt understanding.",
      "Fotorealistisches Storytelling mit tiefem Prompt-Verständnis.",
      "Narrativa fotorrealista con comprensión profunda del prompt.",
    ],
    [T2V, I2V, P1080],
    { cover: videoSora, loop: soraLoop.url, recommended: true }
  ),
  m("veo-3.1-pro", "video",
    ["Google Veo 3.1 Pro", "Google Veo 3.1 Pro", "Google Veo 3.1 Pro"],
    [
      "Google flagship — cinematic quality with tight controls.",
      "Googles Flaggschiff — cinematisch mit präziser Kontrolle.",
      "Buque insignia de Google — calidad cinematográfica.",
    ],
    [T2V, I2V, P1080],
    { cover: coverVeoPro, loop: veoLoop.url, recommended: true }
  ),
  m("veo-3.1-fast", "video",
    ["Veo 3.1 Fast", "Veo 3.1 Fast", "Veo 3.1 Fast"],
    [
      "Speed-tuned Veo for rapid iteration.",
      "Auf Geschwindigkeit optimiertes Veo für schnelle Iterationen.",
      "Veo optimizado para iteración rápida.",
    ],
    [T2V, FAST, P1080]
  ),
  m("wan-2-6-pro", "video",
    ["Wan 2.6 Pro", "Wan 2.6 Pro", "Wan 2.6 Pro"],
    [
      "Native 1080p cinematic frames with strong physics.",
      "Native 1080p Kino-Frames mit starker Physik.",
      "Fotogramas cinematográficos 1080p con física sólida.",
    ],
    [T2V, I2V, P1080],
    { cover: coverWanPro }
  ),
  m("wan-2-6-standard", "video",
    ["Wan 2.6", "Wan 2.6", "Wan 2.6"],
    [
      "Balanced 1080p generation for everyday production.",
      "Ausbalancierte 1080p-Generation für den Produktionsalltag.",
      "Generación 1080p equilibrada para producción diaria.",
    ],
    [T2V, P1080]
  ),
  m("luma-pro", "video",
    ["Luma Ray 2 Pro", "Luma Ray 2 Pro", "Luma Ray 2 Pro"],
    [
      "Photoreal lighting with advanced camera control.",
      "Fotorealistisches Licht mit Kamera-Kontrolle.",
      "Iluminación fotorrealista con control de cámara.",
    ],
    [T2V, I2V, CAM],
    { cover: coverLuma }
  ),
  m("hailuo-pro", "video",
    ["Hailuo 2.3 Pro", "Hailuo 2.3 Pro", "Hailuo 2.3 Pro"],
    [
      "Director-grade character control.",
      "Regie-Kontrolle auf Studio-Niveau.",
      "Control de personajes al nivel de un director.",
    ],
    [T2V, I2V, DIR],
    { cover: coverHailuo }
  ),
  m("seedance-2-mini", "video",
    ["Seedance 2.0 Mini", "Seedance 2.0 Mini", "Seedance 2.0 Mini"],
    [
      "Fast, expressive motion at value pricing.",
      "Schnelle, ausdrucksstarke Bewegung zum Sparpreis.",
      "Movimiento rápido y expresivo a precio reducido.",
    ],
    [T2V, FAST]
  ),
  m("seedance-pro", "video",
    ["Seedance 2 Pro", "Seedance 2 Pro", "Seedance 2 Pro"],
    [
      "Pro-tier motion and character expression.",
      "Pro-Motion und Charakter-Ausdruck.",
      "Movimiento y expresión a nivel Pro.",
    ],
    [T2V, I2V]
  ),
  m("veo-3.1-lite-720p", "video",
    ["Veo 3.1 Lite", "Veo 3.1 Lite", "Veo 3.1 Lite"],
    [
      "Cost-efficient Veo tier at 720p.",
      "Kosteneffiziente Veo-Stufe mit 720p.",
      "Nivel Veo económico a 720p.",
    ],
    [T2V, FAST]
  ),
  m("grok-imagine", "video",
    ["Grok Imagine", "Grok Imagine", "Grok Imagine"],
    [
      "xAI's expressive video model with distinctive style.",
      "xAIs ausdrucksstarkes Video-Modell mit unverkennbarem Stil.",
      "Modelo expresivo de xAI con estilo distintivo.",
    ],
    [T2V, I2V]
  ),
  m("kling-3", "video",
    ["Kling 3.0", "Kling 3.0", "Kling 3.0"],
    [
      "Flagship Kling with best motion & physics.",
      "Kling-Flaggschiff mit bester Bewegung & Physik.",
      "Buque insignia Kling con mejor movimiento y física.",
    ],
    [T2V, I2V, V2V, P1080]
  ),
  m("kling-2.6", "video",
    ["Kling 2.6", "Kling 2.6", "Kling 2.6"],
    [
      "Refined Kling generation with tight controls.",
      "Verfeinerte Kling-Generation mit präziser Kontrolle.",
      "Kling refinado con controles precisos.",
    ],
    [T2V, I2V, P1080]
  ),
  m("kling-2.5-turbo", "video",
    ["Kling 2.5 Turbo", "Kling 2.5 Turbo", "Kling 2.5 Turbo"],
    [
      "Speed-tuned Kling for rapid drafts.",
      "Geschwindigkeitsoptimiertes Kling für schnelle Drafts.",
      "Kling optimizado para bocetos rápidos.",
    ],
    [T2V, FAST]
  ),
  m("pika-2-2-pro", "video",
    ["Pika 2.2 Pro", "Pika 2.2 Pro", "Pika 2.2 Pro"],
    [
      "Start-/end-frame control for tight cuts.",
      "Start-/End-Frame-Kontrolle für präzise Schnitte.",
      "Control de fotograma inicio/fin para cortes precisos.",
    ],
    [I2V, KEYS],
    { cover: coverPika }
  ),
  m("pika-2-2-standard", "video",
    ["Pika 2.2", "Pika 2.2", "Pika 2.2"],
    [
      "Reliable everyday I2V with keyframe control.",
      "Zuverlässiges I2V mit Keyframe-Kontrolle.",
      "I2V fiable con control por keyframes.",
    ],
    [I2V, KEYS]
  ),
  m("vidu-q2-reference", "video",
    ["Vidu Q2 Reference", "Vidu Q2 Reference", "Vidu Q2 Reference"],
    [
      "Multi-reference for character consistency.",
      "Multi-Referenz für Charakter-Konsistenz.",
      "Multi-referencia para consistencia de personajes.",
    ],
    [MULTIREF, I2V]
  ),
  m("vidu-q2-i2v", "video",
    ["Vidu Q2 I2V", "Vidu Q2 I2V", "Vidu Q2 I2V"],
    [
      "Image-to-video with reference locking.",
      "Bild-zu-Video mit Referenz-Lock.",
      "Imagen a vídeo con anclaje de referencia.",
    ],
    [I2V, MULTIREF]
  ),
  m("runway-gen4-aleph", "video",
    ["Runway Gen-4 Aleph", "Runway Gen-4 Aleph", "Runway Gen-4 Aleph"],
    [
      "Premium video-to-video specialist.",
      "Premium-Spezialist für Video-zu-Video.",
      "Especialista premium en vídeo a vídeo.",
    ],
    [V2V],
    { cover: coverRunway }
  ),
  m("ltx-pro", "video",
    ["LTX Pro", "LTX Pro", "LTX Pro"],
    [
      "Studio LTX quality at practical costs.",
      "Studio-LTX-Qualität zu praktikablen Kosten.",
      "Calidad LTX estudio a coste práctico.",
    ],
    [T2V, I2V]
  ),
  m("happyhorse-pro", "video",
    ["HappyHorse 1.1 Pro", "HappyHorse 1.1 Pro", "HappyHorse 1.1 Pro"],
    [
      "Cost-efficient T2V & I2V for high volume.",
      "Kosteneffizientes T2V & I2V für Volumen-Produktion.",
      "T2V e I2V rentables para gran volumen.",
    ],
    [T2V, I2V, FAST]
  ),

  // ============ IMAGE ============
  m("gemini-3-pro-image", "image",
    ["Gemini 3 Pro Image", "Gemini 3 Pro Image", "Gemini 3 Pro Image"],
    [
      "Google's next-gen image generation with typography-grade text.",
      "Googles Next-Gen-Bild-Generation mit sauberer Typo.",
      "Nueva generación de imágenes de Google con tipografía nítida.",
    ],
    [T2I, EDIT],
    { cover: imageHero, hero: true, recommended: true }
  ),
  m("nano-banana-2", "image",
    ["Nano Banana 2", "Nano Banana 2", "Nano Banana 2"],
    [
      "Fast Gemini image generation & precise editing.",
      "Schnelle Gemini-Bild-Generation & präzises Editing.",
      "Generación rápida y edición precisa con Gemini.",
    ],
    [T2I, EDIT, FAST],
    { cover: coverNano, recommended: true }
  ),
  m("gemini-3.1-flash-image", "image",
    ["Gemini 3.1 Flash Image", "Gemini 3.1 Flash Image", "Gemini 3.1 Flash Image"],
    [
      "Ultra-fast image editing at pro quality.",
      "Ultraschnelles Bild-Editing in Pro-Qualität.",
      "Edición de imágenes ultrarrápida a calidad pro.",
    ],
    [T2I, EDIT, FAST],
    { cover: coverGeminiFlash }
  ),
  m("flux-fill-pro", "image",
    ["FLUX Fill Pro", "FLUX Fill Pro", "FLUX Fill Pro"],
    [
      "Magic edit, inpaint & outpaint.",
      "Magic Edit, Inpaint & Outpaint.",
      "Edición mágica, inpaint y outpaint.",
    ],
    [EDIT, INPAINT],
    { cover: coverFluxFill }
  ),
  m("clarity-upscaler", "image",
    ["Clarity Upscaler", "Clarity Upscaler", "Clarity Upscaler"],
    [
      "Up to 4× sharper, no detail loss.",
      "Bis zu 4× schärfer, ohne Detailverlust.",
      "Hasta 4× más nítido, sin pérdida de detalle.",
    ],
    [UPS4],
    { cover: coverClarity }
  ),
  m("style-reference", "image",
    ["Style Reference", "Style Reference", "Referencia de Estilo"],
    [
      "Lock your brand look across renders.",
      "Fixiere deinen Brand-Look über alle Renders.",
      "Fija el look de marca en todos los renders.",
    ],
    [STYLE, CONS]
  ),

  // ============ AUDIO ============
  m("lyria-3-pro", "audio",
    ["Google Lyria 3 Pro", "Google Lyria 3 Pro", "Google Lyria 3 Pro"],
    [
      "Cinematic music generation from Google DeepMind.",
      "Cinematische Musik-Generation von Google DeepMind.",
      "Generación musical cinematográfica de Google DeepMind.",
    ],
    [MUSIC, SFX],
    { cover: audioHero, hero: true, recommended: true }
  ),
  m("elevenlabs-music-v2", "audio",
    ["ElevenLabs Music v2", "ElevenLabs Music v2", "ElevenLabs Music v2"],
    [
      "Song-length tracks with lyrics & vocals.",
      "Track-lange Songs mit Lyrics & Vocals.",
      "Pistas completas con letras y voces.",
    ],
    [MUSIC, VOCAL],
    { cover: coverElevenMusic }
  ),
  m("minimax-music-1.5", "audio",
    ["MiniMax Music 1.5", "MiniMax Music 1.5", "MiniMax Music 1.5"],
    [
      "Vocal tracks with AI-written lyrics.",
      "Vocal-Tracks mit KI-geschriebenen Lyrics.",
      "Pistas vocales con letras escritas por IA.",
    ],
    [VOCAL, MUSIC],
    { cover: coverMinimax }
  ),
  m("stable-audio-2.5", "audio",
    ["Stable Audio 2.5", "Stable Audio 2.5", "Stable Audio 2.5"],
    [
      "Cinematic instrumentals & sound design.",
      "Cinematische Instrumentals & Sound-Design.",
      "Instrumentales cinematográficos y diseño sonoro.",
    ],
    [MUSIC, SFX],
    { cover: coverStableAudio }
  ),
  m("elevenlabs-tts", "audio",
    ["ElevenLabs Voice", "ElevenLabs Voice", "ElevenLabs Voice"],
    [
      "Studio-grade voiceover in 30+ languages.",
      "Studio-Voiceover in 30+ Sprachen.",
      "Locución de estudio en más de 30 idiomas.",
    ],
    [VOICE, MULTILANG],
    { cover: coverElevenTts }
  ),
  m("voice-studio-clone", "audio",
    ["Voice Studio Clone", "Voice Studio Klon", "Clon Voice Studio"],
    [
      "Clone your own voice from a WhatsApp note.",
      "Klone deine eigene Stimme aus einer WhatsApp-Notiz.",
      "Clona tu propia voz desde una nota de WhatsApp.",
    ],
    [CLONE, VOICE],
    { cover: coverVoiceClone }
  ),

  // ============ AVATAR ============
  m("kling-omni-avatar", "avatar",
    ["Kling Omni · Native Lip-Sync", "Kling Omni · Natives Lip-Sync", "Kling Omni · Lip-Sync Nativo"],
    [
      "Talking characters generated in-model, per speaker.",
      "Sprechende Charaktere direkt im Modell, pro Sprecher.",
      "Personajes hablando dentro del modelo, por orador.",
    ],
    [TALK, LIP, NATIVE_LIP],
    { cover: avatarHero, hero: true, recommended: true }
  ),
  m("brand-character-lock", "avatar",
    ["Brand Character Lock", "Brand-Character-Lock", "Anclaje de Personaje"],
    [
      "Persistent characters across every studio.",
      "Persistente Charaktere über alle Studios hinweg.",
      "Personajes persistentes en todos los estudios.",
    ],
    [CONS],
    { cover: coverBrandLock }
  ),
  m("cast-and-world", "avatar",
    ["Cast & World", "Cast & World", "Cast & World"],
    [
      "Your cast, wardrobe and locations — reusable everywhere.",
      "Cast, Wardrobe und Locations — überall wiederverwendbar.",
      "Reparto, vestuario y localizaciones reutilizables.",
    ],
    [CONS, MULTIREF],
    { cover: coverCastWorld }
  ),
];

export const CATEGORY_ORDER: ArsenalCategory[] = ["video", "image", "audio", "avatar"];

export function getModelsByCategory(cat: ArsenalCategory | "all"): ArsenalModel[] {
  const list = cat === "all" ? ARSENAL_CATALOG : ARSENAL_CATALOG.filter((m) => m.category === cat);
  // Hero/recommended first, then rest
  return [...list].sort((a, b) => {
    const av = (a.hero ? 2 : 0) + (a.recommended ? 1 : 0);
    const bv = (b.hero ? 2 : 0) + (b.recommended ? 1 : 0);
    return bv - av;
  });
}

export function getCoverForModel(m: ArsenalModel): string {
  if (m.cover) return m.cover;
  switch (m.category) {
    case "video": return videoHero;
    case "image": return imageHero;
    case "audio": return audioHero;
    case "avatar": return avatarHero;
  }
}

export const CATEGORY_COUNTS = CATEGORY_ORDER.reduce<Record<ArsenalCategory, number>>(
  (acc, c) => {
    acc[c] = ARSENAL_CATALOG.filter((m) => m.category === c).length;
    return acc;
  },
  { video: 0, image: 0, audio: 0, avatar: 0 }
);

export const TOTAL_MODELS = ARSENAL_CATALOG.length;
