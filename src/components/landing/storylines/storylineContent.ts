import { tx } from "@/lib/i18nText";
import type { ComponentType } from "react";
import type { Language } from "@/lib/translations";

import motionS1 from "@/assets/landing/storylines/motion/slide-1.jpg";
import motionS3 from "@/assets/landing/storylines/motion/slide-3.jpg";
import motionS6 from "@/assets/landing/storylines/motion/slide-6.jpg";
import videoS1 from "@/assets/landing/storylines/video/slide-1.jpg";
import videoS3 from "@/assets/landing/storylines/video/slide-3.jpg";
import videoS6 from "@/assets/landing/storylines/video/slide-6.jpg";
import pictureS1 from "@/assets/landing/storylines/picture/slide-1.jpg";
import pictureS3 from "@/assets/landing/storylines/picture/slide-3.jpg";
import pictureS6 from "@/assets/landing/storylines/picture/slide-6.jpg";
import musicS1 from "@/assets/landing/storylines/music/slide-1.jpg";
import musicS3 from "@/assets/landing/storylines/music/slide-3.jpg";
import musicS6 from "@/assets/landing/storylines/music/slide-6.jpg";
import voiceS1 from "@/assets/landing/storylines/voice/slide-1.jpg";
import voiceS3 from "@/assets/landing/storylines/voice/slide-3.jpg";
import voiceS6 from "@/assets/landing/storylines/voice/slide-6.jpg";

import {
  MotionTimelineVisual,
  MotionKlingVisual,
  MotionOneTakeVisual,
  VideoProviderSwitchVisual,
  VideoStylePresetsVisual,
  VideoCostVisual,
  PictureAnchorVisual,
  PictureStyleGridVisual,
  PictureUpscaleVisual,
  MusicWaveformVisual,
  MusicStemsVisual,
  MusicGenreVisual,
  VoiceCloneVisual,
  VoiceEmotionVisual,
  VoiceLibraryVisual,
} from "./uiVisuals";

import {
  BriefTokensVisual,
  AnchorMorphVisual,
  IdentityLockVisual,
  WardrobeCarouselVisual,
  CharacterLoadoutVisual,
  VoiceBindingVisual,
  SceneCastDropVisual,
} from "./castJourneyVisuals";

import {
  ProviderConstellationVisual,
  RouteBestPickVisual,
  FallbackChainVisual,
  CostGuardMeterVisual,
  LatencyDuelVisual,
  UnifiedOutputVisual,
  FoundersSeatCounterVisual,
  PriceLock24mVisual,
  DiscountShieldVisual,
  TimelineGuaranteeVisual,
  SeatMap1000Visual,
  SavingsCurveVisual,
} from "./proofVisuals";

export type StudioKey =
  | "cast"
  | "motion"
  | "video"
  | "picture"
  | "music"
  | "voice"
  | "multiProvider"
  | "priceGuarantee";

export type StorylineSlide = {
  kind: "cinematic" | "ui";
  imageSrc?: string;
  UIComponent?: ComponentType;
  durationMs?: number;
  copy: Record<Language, { kicker: string; title: string; body: string }>;
};

const S = (
  kicker: [string, string, string],
  title: [string, string, string],
  body: [string, string, string],
) => ({
  de: { kicker: kicker[0], title: title[0], body: body[0] },
  en: { kicker: kicker[1], title: title[1], body: body[1] },
  es: { kicker: kicker[2], title: title[2], body: body[2] },
});

export const STORYLINES: Record<StudioKey, StorylineSlide[]> = {
  cast: [
    {
      kind: "ui",
      UIComponent: BriefTokensVisual,
      durationMs: 5500,
      copy: S(
        ["Schritt 01 · Brief", "Step 01 · Brief", "Paso 01 · Brief"],
        [tx({ de: "Vom Satz zum Charakter-Slot.", en: "From sentence to character slot.", es: "De la frase al espacio del personaje." }), "From a sentence to a character slot.", "De una frase al slot de personaje."],
        [
          tx({ de: "Beschreibe deinen Charakter in einem Satz — Alter, Ausstrahlung, Herkunft, Vibe. Cast & World zerlegt den Brief in strukturierte Tokens und legt einen leeren Charakter-Slot an.", en: "Describe your character in one sentence — age, charisma, origin, vibe. Cast & World breaks the brief into structured tokens and creates an empty character slot.", es: "Describe a tu personaje en una frase — edad, carisma, origen, vibra. Cast & World desglosa el brief en tokens estructurados y crea un espacio de personaje vacío." }),
          "Describe your character in one sentence — age, vibe, origin, mood. Cast & World parses the brief into structured tokens and opens an empty character slot.",
          "Describe a tu personaje en una frase — edad, vibe, origen, estado de ánimo. Cast & World lo descompone en tokens y abre un slot vacío.",
        ],
      ),
    },
    {
      kind: "ui",
      UIComponent: AnchorMorphVisual,
      durationMs: 6000,
      copy: S(
        ["Schritt 02 · Anchor Portrait", "Step 02 · Anchor portrait", "Paso 02 · Retrato ancla"],
        ["Drei Engines. Ein Anker-Gesicht.", "Three engines. One anchor face.", "Tres motores. Un rostro ancla."],
        [
          tx({ de: "Nano Banana 2, Seedream 4 und Gemini 3 Pro rendern das Anker-Portrait. Cast & World wählt den stärksten Take und macht ihn zur biometrischen Referenz für alle Studios.", en: "Nano Banana 2, Seedream 4, and Gemini 3 Pro render the anchor portrait. Cast & World selects the strongest take and makes it the biometric reference for all studios.", es: "Nano Banana 2, Seedream 4 y Gemini 3 Pro renderizan el retrato ancla. Cast & World selecciona la toma más fuerte y la convierte en la referencia biométrica para todos los estudios." }),
          "Nano Banana 2, Seedream 4 and Gemini 3 Pro render the anchor portrait. Cast & World picks the strongest take and turns it into the biometric reference for every studio.",
          "Nano Banana 2, Seedream 4 y Gemini 3 Pro generan el retrato ancla. Cast & World elige la mejor toma y la fija como referencia biométrica para cada estudio.",
        ],
      ),
    },
    {
      kind: "ui",
      UIComponent: IdentityLockVisual,
      durationMs: 6500,
      copy: S(
        ["Schritt 03 · Identity Lock", "Step 03 · Identity lock", "Paso 03 · Bloqueo de identidad"],
        ["14 Landmarks. Ein Fingerabdruck.", "14 landmarks. One fingerprint.", "14 marcas. Una huella."],
        [
          tx({ de: "AWS Rekognition scannt Augen, Nase, Mund und Kiefer. Aus den 14 Landmarks entsteht ein biometrischer Fingerabdruck — 98 % Match-Score als harte Grenze für jede spätere Szene.", en: "AWS Rekognition scans eyes, nose, mouth, and jaw. From the 14 landmarks, a biometric fingerprint is created — a 98% match score as a hard limit for every subsequent scene.", es: "AWS Rekognition escanea ojos, nariz, boca y mandíbula. A partir de los 14 puntos de referencia, se crea una huella dactilar biométrica — un 98% de coincidencia como límite estricto para cada escena posterior." }),
          "AWS Rekognition scans eyes, nose, mouth and jaw. Fourteen landmarks become a biometric fingerprint — a 98 % match score as the hard gate for every later scene.",
          "AWS Rekognition escanea ojos, nariz, boca y mandíbula. Catorce marcas se convierten en una huella biométrica — 98 % de match como umbral duro para cada escena futura.",
        ],
      ),
    },
    {
      kind: "ui",
      UIComponent: WardrobeCarouselVisual,
      durationMs: 6500,
      copy: S(
        ["Schritt 04 · Wardrobe", "Step 04 · Wardrobe", "Paso 04 · Vestuario"],
        ["Ein Charakter. Vier Looks. Ein Klick.", "One character. Four looks. One click.", "Un personaje. Cuatro looks. Un clic."],
        [
          tx({ de: "Wie im Videospiel-Charakterbogen: Studio, Street, Executive, Editorial — jeder Look als Preset gespeichert. Ein Klick tauscht das Outfit, ohne dass sich Gesicht, Stimme oder Vibe verändern.", en: "Like in a video game character sheet: Studio, Street, Executive, Editorial — each look saved as a preset. One click changes the outfit without altering face, voice, or vibe.", es: "Como en una ficha de personaje de videojuego: Studio, Street, Executive, Editorial — cada look guardado como un preset. Un clic cambia el atuendo sin alterar la cara, la voz o la vibra." }),
          "Like a video-game character sheet: Studio, Street, Executive, Editorial — each look saved as a preset. One click swaps the outfit while face, voice and vibe stay locked.",
          "Como una hoja de personaje de videojuego: Studio, Street, Executive, Editorial — cada look guardado como preset. Un clic cambia el outfit sin tocar rostro, voz ni vibe.",
        ],
      ),
    },
    {
      kind: "ui",
      UIComponent: VoiceBindingVisual,
      durationMs: 5500,
      copy: S(
        ["Schritt 05 · Voice Binding", "Step 05 · Voice binding", "Paso 05 · Vinculación de voz"],
        [tx({ de: "Stimme fest an den Charakter geknüpft.", en: "Voice firmly linked to the character.", es: "Voz firmemente ligada al personaje." }), "Voice bound to the character.", "Voz vinculada al personaje."],
        [
          tx({ de: "Klone die Stimme einmal via ElevenLabs und binde sie an den Charakter. Ab jetzt spricht Aurora in Motion, AI-Video und Voice Studio automatisch in ihrer eigenen Stimme.", en: "Clone the voice once via ElevenLabs and link it to the character. From now on, Aurora will automatically speak in her own voice in Motion, AI-Video, and Voice Studio.", es: "Clona la voz una vez a través de ElevenLabs y vincúlala al personaje. A partir de ahora, Aurora hablará automáticamente con su propia voz en Motion, AI-Video y Voice Studio." }),
          "Clone the voice once via ElevenLabs and bind it to the character. From now on Aurora speaks in Motion, AI-Video and Voice Studio in her own voice, automatically.",
          "Clona la voz una vez con ElevenLabs y vincúlala al personaje. Desde ahora Aurora hablará en Motion, AI-Video y Voice Studio con su propia voz.",
        ],
      ),
    },
    {
      kind: "ui",
      UIComponent: CharacterLoadoutVisual,
      durationMs: 6500,
      copy: S(
        ["Schritt 06 · Character Loadout", "Step 06 · Character loadout", "Paso 06 · Loadout del personaje"],
        ["Fünf Slots. Ein Loadout. Scene-Ready.", "Five slots. One loadout. Scene-ready.", "Cinco slots. Un loadout. Listo para escena."],
        [
          tx({ de: "Face Lock, Voice, Wardrobe, Prompt-Tokens und Scene-Ready-Status auf einem Blick — wie das Loadout eines Spielcharakters. 98 % Identity-Match, 96 % Voice-Bind, vier Looks im Preset. Alles verriegelt, alles reproduzierbar.", en: "Face Lock, Voice, Wardrobe, Prompt Tokens, and Scene-Ready Status at a glance — like a game character's loadout. 98% Identity Match, 96% Voice Bind, four looks in the preset. Everything locked, everything reproducible.", es: "Bloqueo facial, voz, vestuario, tokens de prompt y estado de listo para la escena de un vistazo — como el equipamiento de un personaje de juego. 98% de coincidencia de identidad, 96% de vinculación de voz, cuatro looks en el preset. Todo bloqueado, todo reproducible." }),
          "Face lock, voice, wardrobe, prompt tokens and scene-ready status in one view — like a game character's loadout. 98 % identity match, 96 % voice bind, four looks preset. All locked, all reproducible.",
          "Face lock, voz, vestuario, tokens de prompt y estado listo-para-escena en una vista — como el loadout de un personaje de juego. 98 % match de identidad, 96 % de vinculación de voz, cuatro looks preset. Todo bloqueado, todo reproducible.",
        ],
      ),
    },
    {
      kind: "ui",
      UIComponent: SceneCastDropVisual,
      durationMs: 6000,
      copy: S(
        ["Schritt 07 · Scene Cast", "Step 07 · Scene cast", "Paso 07 · Casting de escena"],
        ["Ziehen. Ablegen. Drehen.", "Drag. Drop. Shoot.", "Arrastra. Suelta. Rueda."],
        [
          tx({ de: "Der fertige Charakter wird per Drag & Drop in ein Storyboard gezogen. Motion Studio übernimmt Identität, Wardrobe und Stimme — und bringt Aurora in jede Szene, ohne Neuanleitung.", en: "The finished character is dragged and dropped into a storyboard. Motion Studio takes over identity, wardrobe, and voice — bringing Aurora into every scene without new instructions.", es: "El personaje terminado se arrastra y suelta en un storyboard. Motion Studio asume la identidad, el vestuario y la voz — llevando a Aurora a cada escena sin nuevas instrucciones." }),
          "The finished character drags into a storyboard. Motion Studio inherits identity, wardrobe and voice — and puts Aurora in every scene, no re-brief needed.",
          "El personaje terminado se arrastra a un storyboard. Motion Studio hereda identidad, vestuario y voz — y coloca a Aurora en cada escena sin volver a briefar.",
        ],
      ),
    },
  ],
  motion: [
    {
      kind: "cinematic",
      imageSrc: motionS1,
      copy: S(
        ["4-Sprecher-Dialog", "4-speaker dialogue", "Diálogo a 4 voces"],
        ["Vier Sprecher. Eine Einstellung.", "Four speakers. One shot.", "Cuatro voces. Un plano."],
        [
          tx({ de: "Ein durchgehender Take mit bis zu vier Charakteren — jeder mit eigener Stimme, eigener Emotion, eigenem Lip-Sync. Kein Schnitt, kein Trick.", en: "A continuous take with up to four characters — each with their own voice, emotion, and lip-sync. No cuts, no tricks.", es: "Una toma continua con hasta cuatro personajes — cada uno con su propia voz, emoción y sincronización labial. Sin cortes, sin trucos." }),
          "One continuous take with up to four characters — each with their own voice, emotion and lip-sync. No cuts, no trickery.",
          "Un take continuo con hasta cuatro personajes — cada uno con su voz, emoción y lip-sync. Sin cortes, sin trucos.",
        ],
      ),
    },
    {
      kind: "ui",
      UIComponent: MotionTimelineVisual,
      copy: S(
        ["Speaker-Timeline", "Speaker timeline", "Timeline de voces"],
        [tx({ de: "Wer spricht wann — auf einen Blick.", en: "Who speaks when – at a glance.", es: "Quién habla y cuándo: de un vistazo." }), "Who speaks when — at a glance.", "Quién habla cuándo — de un vistazo."],
        [
          tx({ de: "Weise Zeilen per Klick einem Sprecher zu. Emotionen, Pausen und Überlappungen wandern in eine Timeline, die Motion Studio direkt in eine Regieanweisung übersetzt.", en: "Assign lines to a speaker with a click. Emotions, pauses, and overlaps are transferred to a timeline that Motion Studio directly translates into a directorial instruction.", es: "Asigna líneas a un orador con un clic. Las emociones, pausas y superposiciones se transfieren a una línea de tiempo que Motion Studio traduce directamente en una instrucción de dirección." }),
          "Assign lines to a speaker with one click. Emotions, pauses and overlaps land on a timeline that Motion Studio translates straight into direction.",
          "Asigna líneas a un hablante con un clic. Emociones, pausas y solapes se sitúan en una timeline que Motion Studio traduce a dirección.",
        ],
      ),
    },
    {
      kind: "cinematic",
      imageSrc: motionS3,
      copy: S(
        ["Task-Blocking", "Task blocking", "Blocking de tareas"],
        ["Charaktere die wirklich etwas tun.", "Characters that actually do something.", "Personajes que realmente hacen algo."],
        [
          tx({ de: "Einer telefoniert, einer druckt, einer präsentiert — Cast-Actions machen aus Standbildern eine echte Büroszene. Bewegung als Regieanweisung, nicht als Zufall.", en: "One on the phone, one printing, one presenting — Cast Actions turn still images into a real office scene. Movement as a directorial instruction, not as a coincidence.", es: "Uno al teléfono, uno imprimiendo, uno presentando — las Acciones de Reparto convierten imágenes fijas en una escena de oficina real. El movimiento como instrucción de dirección, no como coincidencia." }),
          "One on the phone, one at the printer, one presenting — Cast Actions turn stills into a real office scene. Movement as direction, not chance.",
          "Uno al teléfono, otro en la impresora, otro presentando — las Cast Actions convierten estáticos en una escena real. Movimiento como dirección, no azar.",
        ],
      ),
    },
    {
      kind: "ui",
      UIComponent: MotionKlingVisual,
      copy: S(
        ["Kling Omni Native", "Kling Omni native", "Kling Omni nativo"],
        ["Native Multi-Sprecher-Engine.", "Native multi-speaker engine.", "Motor multi-voz nativo."],
        [
          tx({ de: "Kling Omni rendert Dialog nativ mit mehreren Sprechern in einem Take. Sync.so und AWS Rekognition sichern Face-Slots ab, damit kein Lip-Sync verrutscht.", en: "Kling Omni natively renders dialogue with multiple speakers in one take. Sync.so and AWS Rekognition secure face slots so no lip-sync slips.", es: "Kling Omni renderiza diálogos de forma nativa con múltiples oradores en una sola toma. Sync.so y AWS Rekognition aseguran los espacios faciales para que no haya deslizamientos en la sincronización labial." }),
          "Kling Omni renders dialogue natively with multiple speakers in one take. Sync.so and AWS Rekognition lock face slots so no lip-sync drifts.",
          "Kling Omni renderiza diálogo con múltiples voces nativas en un take. Sync.so y AWS Rekognition fijan los face-slots para que ningún lip-sync se desplace.",
        ],
      ),
    },
    {
      kind: "ui",
      UIComponent: MotionOneTakeVisual,
      copy: S(
        ["Ein-Take statt Schnitt", "One take, not cuts", "Un take, no cortes"],
        ["Kein Schnitt. Kein Morph. Kein Bruch.", "No cut. No morph. No break.", "Sin corte. Sin morph. Sin ruptura."],
        [
          tx({ de: "Andere Tools schneiden zwischen Sprechern und verlieren Kontinuität. Motion Studio bleibt in einer Einstellung — Blickachsen, Licht und Identität halten von Anfang bis Ende.", en: "Other tools cut between speakers and lose continuity. Motion Studio stays in one shot — eye lines, light, and identity hold from beginning to end.", es: "Otras herramientas cortan entre oradores y pierden continuidad. Motion Studio se mantiene en una sola toma — las líneas de mirada, la luz y la identidad se mantienen de principio a fin." }),
          "Other tools cut between speakers and lose continuity. Motion Studio holds one shot — eyelines, light and identity survive from start to end.",
          "Otras herramientas cortan entre voces y pierden continuidad. Motion Studio mantiene un plano — miradas, luz e identidad sobreviven de principio a fin.",
        ],
      ),
    },
    {
      kind: "cinematic",
      imageSrc: motionS6,
      copy: S(
        ["Emotionaler Lip-Sync", "Emotional lip-sync", "Lip-sync emocional"],
        ["Lippen, die die Worte tatsächlich formen.", "Lips that actually form the words.", "Labios que realmente forman las palabras."],
        [
          tx({ de: "Deutsch, Englisch, Spanisch — Motion Studio zwingt die Engine auf die gewählte Sprache und synchronisiert jede Silbe. Keine Fantasiesprache, keine geschlossenen Münder.", en: "German, English, Spanish — Motion Studio forces the engine to the selected language and synchronizes every syllable. No fantasy language, no closed mouths.", es: "Alemán, inglés, español — Motion Studio fuerza el motor al idioma seleccionado y sincroniza cada sílaba. Sin lenguaje de fantasía, sin bocas cerradas." }),
          "German, English, Spanish — Motion Studio locks the engine to the chosen language and syncs every syllable. No gibberish, no closed mouths.",
          "Alemán, inglés, español — Motion Studio bloquea el motor al idioma elegido y sincroniza cada sílaba. Sin idioma inventado, sin bocas cerradas.",
        ],
      ),
    },
  ],
  video: [
    {
      kind: "cinematic",
      imageSrc: videoS1,
      copy: S(
        ["Provider-Cockpit", "Provider cockpit", "Cockpit de proveedores"],
        ["32 Engines. Eine Promptzeile.", "32 engines. One prompt bar.", "32 motores. Una barra de prompt."],
        [
          tx({ de: "Sora, Kling, Hailuo, Veo, Seedance, Luma, Wan — alle Top-Engines liegen unter einer Oberfläche. Wechseln, nicht wandern.", en: "Sora, Kling, Hailuo, Veo, Seedance, Luma, Wan — all top engines under one interface. Switch, don't wander.", es: "Sora, Kling, Hailuo, Veo, Seedance, Luma, Wan — todos los motores principales bajo una interfaz. Cambia, no deambules." }),
          "Sora, Kling, Hailuo, Veo, Seedance, Luma, Wan — every top engine under one surface. Switch, don't migrate.",
          "Sora, Kling, Hailuo, Veo, Seedance, Luma, Wan — todos los motores top bajo una superficie. Cambiar, no migrar.",
        ],
      ),
    },
    {
      kind: "ui",
      UIComponent: VideoProviderSwitchVisual,
      copy: S(
        ["1-Klick-Provider-Wechsel", "1-click provider switch", "Cambio de motor con 1 clic"],
        ["Same Prompt. Anderer Look.", "Same prompt. Different look.", "Mismo prompt. Otro look."],
        [
          tx({ de: "Ein Klick tauscht das Modell — Prompt, Cast, Musik bleiben. Vergleiche in Sekunden zwei Provider für denselben Shot und wähle den stärkeren.", en: "One click changes the model — prompt, cast, music remain. Compare two providers for the same shot in seconds and choose the stronger one.", es: "Un clic cambia el modelo — el prompt, el reparto, la música permanecen. Compara dos proveedores para la misma toma en segundos y elige el más fuerte." }),
          "One click swaps the model — prompt, cast, music stay. Compare two providers on the same shot in seconds and pick the stronger.",
          "Un clic cambia el modelo — prompt, cast, música siguen. Compara dos motores en el mismo plano en segundos y elige el mejor.",
        ],
      ),
    },
    {
      kind: "cinematic",
      imageSrc: videoS3,
      copy: S(
        ["Format-Flex", "Format flex", "Formato flexible"],
        ["Vertikal, Quadrat, Landscape.", "Vertical, square, landscape.", "Vertical, cuadrado, landscape."],
        [
          tx({ de: "9:16 für Reels, 1:1 für Feed, 16:9 für YouTube — dieselbe Idee, drei Formate, ein Render-Job. Kein Neu-Framing per Hand.", en: "9:16 for Reels, 1:1 for Feed, 16:9 for YouTube — same idea, three formats, one render job. No re-framing by hand.", es: "9:16 para Reels, 1:1 para Feed, 16:9 para YouTube: la misma idea, tres formatos, un trabajo de renderizado. No es necesario volver a enmarcar a mano." }),
          "9:16 for reels, 1:1 for feed, 16:9 for YouTube — same idea, three formats, one render job. No manual re-framing.",
          "9:16 para reels, 1:1 para feed, 16:9 para YouTube — misma idea, tres formatos, un solo render. Sin reencuadre manual.",
        ],
      ),
    },
    {
      kind: "ui",
      UIComponent: VideoStylePresetsVisual,
      copy: S(
        ["Style-Presets", "Style presets", "Presets de estilo"],
        ["Editorial. Cinematic. Product. Ugc.", "Editorial. Cinematic. Product. UGC.", "Editorial. Cinemático. Producto. UGC."],
        [
          tx({ de: "Presets für Look, Kamera und Licht liegen bereit. Wähle einen — und die Engine bekommt den Regie-Rahmen, den sie braucht, um professionell aussehen zu können.", en: "Presets for look, camera, and light are ready. Choose one — and the engine gets the directorial framework it needs to look professional.", es: "Los presets para el look, la cámara y la luz están listos. Elige uno — y el motor obtiene el marco de dirección que necesita para lucir profesional." }),
          "Presets for look, camera and light are ready. Pick one — the engine gets the direction it needs to actually look pro.",
          "Presets de look, cámara y luz listos. Elige uno — el motor recibe la dirección que necesita para verse pro.",
        ],
      ),
    },
    {
      kind: "ui",
      UIComponent: VideoCostVisual,
      copy: S(
        ["Kosten-Transparenz", "Cost transparency", "Transparencia de costes"],
        [tx({ de: "Preis vor dem Render, nicht danach.", en: "Price before render, not after.", es: "Precio antes de renderizar, no después." }), "Cost shown before render, not after.", "Coste antes del render, no después."],
        [
          tx({ de: "Jeder Render zeigt vorher, wieviel Media-Credits er kostet. Kein Überraschungsverbrauch, keine versteckten Aufschläge — Beta-Preis 14,99 € eingerechnet.", en: "Every render shows beforehand how many media credits it costs. No surprise consumption, no hidden surcharges — Beta price €14.99 included.", es: "Cada render muestra de antemano cuántos créditos de medios cuesta. Sin consumo sorpresa, sin recargos ocultos — precio Beta de 14,99 € incluido." }),
          "Every render shows how many media credits it costs — up front. No surprise burn, no hidden markup — beta price 14.99 € included.",
          "Cada render muestra su coste en créditos — antes de lanzarlo. Sin sorpresas, sin recargos ocultos — precio beta 14,99 € incluido.",
        ],
      ),
    },
    {
      kind: "cinematic",
      imageSrc: videoS6,
      copy: S(
        ["Hero-Shot", "Hero shot", "Plano héroe"],
        [tx({ de: "Vom Prompt zum Werbespot.", en: "From prompt to commercial.", es: "De rápido a comercial." }), "From prompt to ad spot.", "Del prompt al spot."],
        [
          tx({ de: "Was früher einen Dreh brauchte, entsteht in Minuten: Ein Hero-Shot mit Cast, Musik, VO und Format — bereit für Meta, TikTok, YouTube.", en: "What used to take a shoot, now takes minutes: A hero shot with cast, music, VO, and format — ready for Meta, TikTok, YouTube.", es: "Lo que antes requería una sesión de fotos, ahora se crea en minutos: Un hero shot con elenco, música, voz en off y formato — listo para Meta, TikTok, YouTube." }),
          "What used to need a shoot now takes minutes: a hero shot with cast, music, VO and format — ready for Meta, TikTok, YouTube.",
          "Lo que antes exigía un rodaje ahora sale en minutos: un plano héroe con cast, música, VO y formato — listo para Meta, TikTok, YouTube.",
        ],
      ),
    },
  ],
  picture: [
    {
      kind: "cinematic",
      imageSrc: pictureS1,
      copy: S(
        ["Produkt-Shot", "Product shot", "Plano de producto"],
        ["Ein Produkt. Studio-Ergebnis.", "One product. Studio result.", "Un producto. Resultado de estudio."],
        [
          tx({ de: "Reflektierende Flächen, dramatisches Licht, saubere Kanten — Picture Studio erzeugt Produktshots, die aussehen wie aus einem 3.000 €-Fotostudio.", en: "Reflective surfaces, dramatic lighting, clean edges — Picture Studio creates product shots that look like they came from a €3,000 photo studio.", es: "Superficies reflectantes, iluminación dramática, bordes limpios — Picture Studio crea tomas de producto que parecen sacadas de un estudio fotográfico de 3.000 €." }),
          "Reflective surfaces, dramatic light, clean edges — Picture Studio produces product shots that look like a €3,000 photo studio.",
          "Superficies reflectantes, luz dramática, bordes limpios — Picture Studio genera planos de producto de estudio de 3.000 €.",
        ],
      ),
    },
    {
      kind: "ui",
      UIComponent: PictureAnchorVisual,
      copy: S(
        ["Brand-Anchor", "Brand anchor", "Ancla de marca"],
        [tx({ de: "Farben, Font-Gefühl, Bildlogik gespeichert.", en: "Colors, font feel, image logic saved.", es: "Colores, sensación de fuente y lógica de imagen guardada." }), "Colors, typographic feel, visual logic saved.", "Colores, tipografía, lógica visual guardadas."],
        [
          tx({ de: "Definiere Anchor-Frames für deine Marke. Jedes neue Bild bleibt in derselben Palette, Kontrastkurve und Bildsprache — Konsistenz statt Zufall.", en: "Define anchor frames for your brand. Every new image stays within the same palette, contrast curve, and visual language — consistency instead of randomness.", es: "Define fotogramas ancla para tu marca. Cada nueva imagen se mantiene en la misma paleta, curva de contraste y lenguaje visual — consistencia en lugar de aleatoriedad." }),
          "Define anchor frames for your brand. Every new image stays in the same palette, contrast and visual language — consistency, not luck.",
          "Define frames ancla para tu marca. Cada nueva imagen conserva paleta, contraste y lenguaje — consistencia, no suerte.",
        ],
      ),
    },
    {
      kind: "cinematic",
      imageSrc: pictureS3,
      copy: S(
        ["Editorial-Cover", "Editorial cover", "Portada editorial"],
        ["Cover-Qualität. In Minuten.", "Cover-grade. In minutes.", "Calidad portada. En minutos."],
        [
          tx({ de: "Portrait, Typografie-Gefühl, Farbe — Editorial-Cover in Vogue-Anmutung. Ideal für Landing-Hero, LinkedIn-Post oder Magazin-Mockup.", en: "Portrait, typography feel, color — editorial covers with a Vogue aesthetic. Ideal for landing page heroes, LinkedIn posts, or magazine mockups.", es: "Retrato, sensación tipográfica, color — portadas editoriales con estética Vogue. Ideal para héroes de landing pages, publicaciones de LinkedIn o maquetas de revistas." }),
          "Portrait, typographic feel, color — editorial covers with a Vogue vibe. Ideal for landing hero, LinkedIn post or magazine mockup.",
          "Retrato, sensación tipográfica, color — portadas editoriales con estética Vogue. Ideales para hero, LinkedIn o mockup.",
        ],
      ),
    },
    {
      kind: "ui",
      UIComponent: PictureStyleGridVisual,
      copy: S(
        ["Stil-Grid", "Style grid", "Grilla de estilos"],
        ["Editorial · Cinematic · Portrait · Product.", "Editorial · Cinematic · Portrait · Product.", "Editorial · Cinemático · Retrato · Producto."],
        [
          tx({ de: "Vier Basis-Stile, sofort geladen. Kombiniere sie mit deinem Cast und einem einzigen Prompt — Serien-Assets ohne Serien-Aufwand.", en: "Four basic styles, loaded instantly. Combine them with your cast and a single prompt — series assets without series effort.", es: "Cuatro estilos básicos, cargados al instante. Combínalos con tu elenco y un solo prompt — activos de serie sin esfuerzo de serie." }),
          "Four base styles, instantly loaded. Combine them with your cast and a single prompt — series assets without series effort.",
          "Cuatro estilos base, listos al instante. Combínalos con tu cast y un solo prompt — assets en serie sin esfuerzo en serie.",
        ],
      ),
    },
    {
      kind: "ui",
      UIComponent: PictureUpscaleVisual,
      copy: S(
        ["Upscale & Retouch", "Upscale & retouch", "Escalado y retoque"],
        [tx({ de: "4K-Ready mit einem Klick.", en: "4K-Ready with one click.", es: "Listo para 4K con un clic." }), "4K-ready with one click.", "Listo para 4K con un clic."],
        [
          tx({ de: "Nano Banana 2, Seedream 4, Flux Ultra liefern die Basis. Upscale und Retouch veredeln bis 4K — bereit für Print, OOH und großformatige Display-Ads.", en: "Nano Banana 2, Seedream 4, Flux Ultra provide the basis. Upscale and retouch refine up to 4K — ready for print, OOH, and large-format display ads.", es: "Nano Banana 2, Seedream 4, Flux Ultra proporcionan la base. El escalado y el retoque refinan hasta 4K — listo para impresión, OOH y anuncios de gran formato." }),
          "Nano Banana 2, Seedream 4, Flux Ultra deliver the base. Upscale and retouch push to 4K — ready for print, OOH and large-format display.",
          "Nano Banana 2, Seedream 4, Flux Ultra dan la base. Upscale y retoque llevan a 4K — listo para print, OOH y display grande.",
        ],
      ),
    },
    {
      kind: "cinematic",
      imageSrc: pictureS6,
      copy: S(
        ["Portrait-Serie", "Portrait series", "Serie de retratos"],
        ["Ein Cast. Vier Auftritte.", "One cast. Four appearances.", "Un cast. Cuatro apariciones."],
        [
          tx({ de: "Vom Editorial-Portrait über den Bewerbungshead bis zum Kampagnen-Look — dieselbe Person, verlässlich, wiedererkennbar. Perfekt für Team-Pages und PR.", en: "From editorial portraits to application headshots to campaign looks — the same person, reliable, recognizable. Perfect for team pages and PR.", es: "Desde el retrato editorial hasta la foto de currículum y el look de campaña — la misma persona, fiable, reconocible. Perfecto para páginas de equipo y relaciones públicas." }),
          "From editorial portrait to headshot to campaign look — same person, reliable, recognisable. Perfect for team pages and PR.",
          "Del retrato editorial al headshot y al look de campaña — misma persona, fiable, reconocible. Perfecto para team pages y PR.",
        ],
      ),
    },
  ],
  music: [
    {
      kind: "cinematic",
      imageSrc: musicS1,
      copy: S(
        ["Werbe-Jingle", "Ad jingle", "Jingle publicitario"],
        ["Ein Hook. Eine Marke. In Minuten.", "One hook. One brand. In minutes.", "Un gancho. Una marca. En minutos."],
        [
          tx({ de: "Beschreibe Stimmung und Länge — Suno v5 oder Udio v2 liefert einen Hook, den du direkt unter deinen Spot legen kannst. Rechtefrei, sofort einsatzbereit.", en: "Describe mood and length — Suno v5 or Udio v2 delivers a hook you can place directly under your spot. Royalty-free, ready to use instantly.", es: "Describe el ambiente y la duración — Suno v5 o Udio v2 entrega un gancho que puedes colocar directamente debajo de tu spot. Libre de derechos, listo para usar al instante." }),
          "Describe mood and length — Suno v5 or Udio v2 delivers a hook you can drop straight under your spot. Rights-clear, instantly usable.",
          "Describe mood y duración — Suno v5 o Udio v2 entrega un gancho listo para tu spot. Libre de derechos, listo al instante.",
        ],
      ),
    },
    {
      kind: "ui",
      UIComponent: MusicWaveformVisual,
      copy: S(
        ["4 Engines · 1 Waveform", "4 engines · 1 waveform", "4 motores · 1 waveform"],
        ["Suno, Udio, ElevenLabs, Stable Audio.", "Suno, Udio, ElevenLabs, Stable Audio.", "Suno, Udio, ElevenLabs, Stable Audio."],
        [
          tx({ de: "Vier Scoring-Engines nebeneinander in einer Waveform-UI. Hör vergleichend rein, wähle die stärkste Version — ohne Datei-Chaos zwischen Tabs.", en: "Four scoring engines side-by-side in a waveform UI. Listen comparatively, choose the strongest version — no file chaos between tabs.", es: "Cuatro motores de puntuación uno al lado del otro en una interfaz de forma de onda. Escucha comparativamente, elige la versión más fuerte — sin caos de archivos entre pestañas." }),
          "Four scoring engines side by side in one waveform UI. A/B them, pick the strongest — no file chaos across tabs.",
          "Cuatro motores de scoring en una única waveform. Compáralos, elige el mejor — sin caos de archivos entre pestañas.",
        ],
      ),
    },
    {
      kind: "cinematic",
      imageSrc: musicS3,
      copy: S(
        ["Podcast-Intro", "Podcast intro", "Intro de podcast"],
        [tx({ de: "Studio-Sound ohne Studio-Buchung.", en: "Studio sound without studio booking.", es: "Sonido de estudio sin reserva de estudio." }), "Studio sound, no studio booking.", "Sonido de estudio, sin reservar estudio."],
        [
          tx({ de: "Intro, Outro, Bumper, Transition — jeder Baustein deines Podcasts entsteht in Minuten mit klarer Klangfarbe und dauerhafter Wiedererkennbarkeit.", en: "Intro, outro, bumper, transition — every building block of your podcast is created in minutes with clear timbre and lasting recognizability.", es: "Intro, outro, bumper, transición — cada componente de tu podcast se crea en minutos con un timbre claro y una reconocibilidad duradera." }),
          "Intro, outro, bumper, transition — every podcast building block in minutes, with a clean tone and lasting recognition.",
          "Intro, outro, bumper, transición — cada bloque del podcast en minutos, con timbre limpio y reconocimiento duradero.",
        ],
      ),
    },
    {
      kind: "ui",
      UIComponent: MusicStemsVisual,
      copy: S(
        ["Stems & SFX", "Stems & SFX", "Stems y SFX"],
        ["Drums, Bass, Vocals — getrennt.", "Drums, bass, vocals — separated.", "Batería, bajo, voces — separados."],
        [
          tx({ de: "Export als voller Track oder als getrennte Stems: Drums, Bass, Vocals, FX. Für Mix, Ducking unter VO oder Reuse in weiteren Kampagnen.", en: "Export as a full track or as separate stems: drums, bass, vocals, FX. For mixing, ducking under VO, or reuse in further campaigns.", es: "Exporta como pista completa o como stems separados: batería, bajo, voces, FX. Para mezclar, atenuar bajo VO o reutilizar en futuras campañas." }),
          "Export as full track or split stems: drums, bass, vocals, FX. For mix, ducking under VO or reuse across campaigns.",
          "Exporta track completo o stems separados: batería, bajo, voces, FX. Para mezcla, ducking bajo VO o reutilización.",
        ],
      ),
    },
    {
      kind: "ui",
      UIComponent: MusicGenreVisual,
      copy: S(
        ["Genre-Switch", "Genre switch", "Cambio de género"],
        ["Cinematic Trailer, Lo-Fi, Corporate, Trap.", "Cinematic trailer, lo-fi, corporate, trap.", "Trailer cinematográfico, lo-fi, corporate, trap."],
        [
          tx({ de: "Ein Prompt, ein Genre-Chip — Musik switcht sofort das Terrain. Perfekt, um denselben Spot in drei Stimmungen zu testen und die stärkste zu wählen.", en: "One prompt, one genre chip — music instantly switches terrain. Perfect for testing the same spot in three moods and choosing the strongest.", es: "Un prompt, un chip de género — la música cambia de terreno al instante. Perfecto para probar el mismo spot en tres ambientes y elegir el más fuerte." }),
          "One prompt, one genre chip — music instantly changes terrain. Perfect to test the same spot in three moods and ship the strongest.",
          "Un prompt, un chip de género — la música cambia de terreno al instante. Perfecto para testear el mismo spot en tres moods.",
        ],
      ),
    },
    {
      kind: "cinematic",
      imageSrc: musicS6,
      copy: S(
        ["Bühne", "On stage", "En escena"],
        ["Musik, die deinen Spot trägt.", "Music that carries your spot.", "Música que sostiene tu spot."],
        [
          tx({ de: "Sound ist die Hälfte deiner Werbung. Music Studio liefert dir die Hälfte, die die meisten Tools vergessen — produktionsreif, in Minuten, ohne Rechte-Risiko.", en: "Sound is half your advertising. Music Studio gives you the half most tools forget — production-ready, in minutes, without rights risk.", es: "El sonido es la mitad de tu publicidad. Music Studio te da la mitad que la mayoría de las herramientas olvidan — listo para producción, en minutos, sin riesgo de derechos." }),
          "Sound is half your ad. Music Studio delivers the half most tools forget — production-ready, in minutes, no rights risk.",
          "El sonido es la mitad de tu anuncio. Music Studio entrega esa mitad — listo para producción, en minutos, sin riesgo de derechos.",
        ],
      ),
    },
  ],
  voice: [
    {
      kind: "cinematic",
      imageSrc: voiceS1,
      copy: S(
        ["Stimme klonen", "Clone a voice", "Clonar una voz"],
        ["Deine Stimme. Als Asset.", "Your voice. As an asset.", "Tu voz. Como asset."],
        [
          tx({ de: "Nimm 60 Sekunden auf — Voice Studio klont Timbre, Sprechrhythmus und Akzent. Ab dann kannst du beliebige Skripte in deiner Stimme sprechen lassen.", en: "Record 60 seconds — Voice Studio clones timbre, speech rhythm, and accent. From then on, you can have any script spoken in your voice.", es: "Graba 60 segundos — Voice Studio clona el timbre, el ritmo del habla y el acento. A partir de entonces, puedes hacer que cualquier guion se hable con tu voz." }),
          "Record 60 seconds — Voice Studio clones timbre, rhythm and accent. From then on any script can speak in your voice.",
          "Graba 60 segundos — Voice Studio clona timbre, ritmo y acento. Desde ahí cualquier guion sonará con tu voz.",
        ],
      ),
    },
    {
      kind: "ui",
      UIComponent: VoiceCloneVisual,
      copy: S(
        ["Skript-Panel", "Script panel", "Panel de guion"],
        [tx({ de: "Skript live vor dir während der Aufnahme.", en: "Script live in front of you during recording.", es: "Guion en vivo frente a ti durante la grabación." }), "Script in front of you as you record.", "Guion delante mientras grabas."],
        [
          tx({ de: "Voice Studio zeigt das Skript groß und mitlaufend während der Aufnahme. Kein Vergessen, kein Umblättern — sofortige Wiederholung markierter Zeilen.", en: "Voice Studio displays the script large and scrolling during recording. No forgetting, no turning pages — instant repetition of marked lines.", es: "Voice Studio muestra el guion grande y desplazándose durante la grabación. Sin olvidos, sin pasar páginas — repetición instantánea de líneas marcadas." }),
          "Voice Studio shows the script large and scrolling while you record. No forgetting, no page turns — instant re-take on marked lines.",
          "Voice Studio muestra el guion grande y en scroll mientras grabas. Sin olvidos ni pases de página — re-take instantáneo por línea.",
        ],
      ),
    },
    {
      kind: "cinematic",
      imageSrc: voiceS3,
      copy: S(
        ["Charakter-Binding", "Character binding", "Vinculación al personaje"],
        [tx({ de: "Deine Stimme trifft deinen Cast.", en: "Your voice meets your cast.", es: "Tu voz se une a tu elenco." }), "Your voice meets your cast.", "Tu voz se une a tu cast."],
        [
          tx({ de: "Weise geklonte Stimmen einem Cast & World-Charakter zu. Ab jetzt spricht dieser Charakter in jedem Studio automatisch in dieser Stimme.", en: "Assign cloned voices to a Cast & World character. From now on, this character will automatically speak in that voice in every studio.", es: "Asigna voces clonadas a un personaje de Cast & World. A partir de ahora, este personaje hablará automáticamente con esa voz en cada estudio." }),
          "Assign cloned voices to a Cast & World character. From now on that character speaks in that voice in every studio.",
          "Asigna voces clonadas a un personaje de Cast & World. Desde ahora hablará con esa voz en cada estudio.",
        ],
      ),
    },
    {
      kind: "ui",
      UIComponent: VoiceEmotionVisual,
      copy: S(
        ["Emotion-Steuerung", "Emotion control", "Control de emoción"],
        ["Freundlich, dringlich, ruhig, energisch.", "Friendly, urgent, calm, energetic.", "Amable, urgente, tranquilo, enérgico."],
        [
          tx({ de: "Wähle eine Emotion pro Zeile. ElevenLabs überträgt sie in Betonung, Tempo und Atem — ohne dass du Regie am Mikro spielen musst.", en: "Choose an emotion per line. ElevenLabs transfers it into emphasis, tempo, and breath — without you having to direct at the mic.", es: "Elige una emoción por línea. ElevenLabs la transfiere a énfasis, tempo y respiración — sin que tengas que dirigir en el micrófono." }),
          "Pick an emotion per line. ElevenLabs translates it into stress, tempo and breath — no directing at the mic needed.",
          "Elige una emoción por línea. ElevenLabs la traduce en énfasis, tempo y respiración — sin dirigir al micro.",
        ],
      ),
    },
    {
      kind: "ui",
      UIComponent: VoiceLibraryVisual,
      copy: S(
        ["Meine Stimmen", "My voices", "Mis voces"],
        [tx({ de: "Alle Stimmen an einem Ort.", en: "All voices in one place.", es: "Todas las voces en un solo lugar." }), "All voices in one place.", "Todas las voces en un lugar."],
        [
          tx({ de: "Persönlich geklont oder aus der ElevenLabs-Library gewählt — deine Stimmen sind zentral abgelegt und in Motion, AI-Video und Music sofort abrufbar.", en: "Cloned personally or chosen from the ElevenLabs library — your voices are centrally stored and instantly available in Motion, AI-Video, and Music.", es: "Clonadas personalmente o elegidas de la biblioteca de ElevenLabs — tus voces se almacenan centralmente y están disponibles al instante en Motion, AI-Video y Music." }),
          "Personally cloned or picked from the ElevenLabs library — your voices sit in one place and are ready in Motion, AI-Video and Music.",
          "Clonadas o elegidas de la librería de ElevenLabs — tus voces viven en un lugar y están listas en Motion, AI-Video y Music.",
        ],
      ),
    },
    {
      kind: "cinematic",
      imageSrc: voiceS6,
      copy: S(
        ["Multi-Sprecher", "Multi-speaker", "Multi-voz"],
        [tx({ de: "Vier Stimmen, ein Skript, eine Session.", en: "Four voices, one script, one session.", es: "Cuatro voces, un guion, una sesión." }), "Four voices, one script, one session.", "Cuatro voces, un guion, una sesión."],
        [
          tx({ de: "Assign per-line: Sprecher 1, 2, 3, 4. Voice Studio rendert alle in einem Rutsch und liefert eine saubere, gemischte Dialogdatei — bereit für Motion Studio.", en: "Assign per-line: Speaker 1, 2, 3, 4. Voice Studio renders all in one go and delivers a clean, mixed dialogue file — ready for Motion Studio.", es: "Asignar por línea: Orador 1, 2, 3, 4. Voice Studio renderiza todo de una vez y entrega un archivo de diálogo limpio y mezclado — listo para Motion Studio." }),
          "Assign per line: speaker 1, 2, 3, 4. Voice Studio renders them all in one pass and delivers a clean, mixed dialogue file — ready for Motion Studio.",
          "Asigna por línea: hablante 1, 2, 3, 4. Voice Studio los renderiza en una pasada y entrega un archivo mezclado — listo para Motion Studio.",
        ],
      ),
    },
  ],
  multiProvider: [
    {
      kind: "ui",
      UIComponent: ProviderConstellationVisual,
      durationMs: 5000,
      copy: S(
        ["Multi-Provider · 01", "Multi-provider · 01", "Multi-provider · 01"],
        ["Ein Zugang, jede KI.", "One account, every AI.", "Una cuenta, cada IA."],
        [
          tx({ de: "Kling, Hailuo, Sora, Veo, Runway, Luma, Flux, Stable Diffusion — alles unter einem Dach. Kein Provider-Hopping, keine 8 Rechnungen.", en: "Kling, Hailuo, Sora, Veo, Runway, Luma, Flux, Stable Diffusion — all under one roof. No provider hopping, no 8 invoices.", es: "Kling, Hailuo, Sora, Veo, Runway, Luma, Flux, Stable Diffusion — todo bajo un mismo techo. Sin saltos de proveedor, sin 8 facturas." }),
          "Kling, Hailuo, Sora, Veo, Runway, Luma, Flux, Stable Diffusion — all under one roof. No provider-hopping, no 8 invoices.",
          "Kling, Hailuo, Sora, Veo, Runway, Luma, Flux, Stable Diffusion — todo bajo un techo. Sin saltar de proveedor, sin 8 facturas.",
        ],
      ),
    },
    {
      kind: "ui",
      UIComponent: RouteBestPickVisual,
      durationMs: 5000,
      copy: S(
        ["Multi-Provider · 02", "Multi-provider · 02", "Multi-provider · 02"],
        [tx({ de: "Wir routen zum besten Modell.", en: "We route to the best model.", es: "Nos encaminamos hacia el mejor modelo." }), "We route to the best model.", "Enrutamos al mejor modelo."],
        [
          tx({ de: "Für jeden Job scoren wir Provider live nach Qualität, Preis und Latenz. Der Gewinner rendert — vollautomatisch.", en: "For every job, we score providers live based on quality, price, and latency. The winner renders — fully automatically.", es: "Para cada trabajo, puntuamos a los proveedores en vivo según calidad, precio y latencia. El ganador renderiza — de forma totalmente automática." }),
          "For every job we score providers live by quality, price and latency. The winner renders — fully automatic.",
          "Para cada trabajo puntuamos proveedores en vivo por calidad, precio y latencia. El ganador renderiza — automático.",
        ],
      ),
    },
    {
      kind: "ui",
      UIComponent: FallbackChainVisual,
      durationMs: 4800,
      copy: S(
        ["Multi-Provider · 03", "Multi-provider · 03", "Multi-provider · 03"],
        [tx({ de: "Fällt einer aus, springt der nächste.", en: "If one fails, the next one steps in.", es: "Si uno falla, el siguiente interviene." }), "If one fails, the next steps in.", "Si uno falla, entra el siguiente."],
        [
          tx({ de: "Primary → Fallback → Safety. Wenn ein Provider zickt oder in Wartung ist, übernimmt automatisch der nächste. Deine Kampagne merkt nichts.", en: "Primary → Fallback → Safety. If a provider acts up or is under maintenance, the next one automatically takes over. Your campaign won't notice a thing.", es: "Primario → Reserva → Seguridad. Si un proveedor falla o está en mantenimiento, el siguiente toma el relevo automáticamente. Tu campaña no notará nada." }),
          "Primary → Fallback → Safety. If a provider stumbles or hits maintenance, the next one takes over automatically. Your campaign never notices.",
          "Primary → Fallback → Safety. Si un proveedor falla o está en mantenimiento, el siguiente entra automáticamente.",
        ],
      ),
    },
    {
      kind: "ui",
      UIComponent: CostGuardMeterVisual,
      durationMs: 4800,
      copy: S(
        ["Multi-Provider · 04", "Multi-provider · 04", "Multi-provider · 04"],
        [tx({ de: "Cost-Guard schützt dein Budget.", en: "Cost Guard protects your budget.", es: "Cost Guard protege su presupuesto." }), "Cost-Guard protects your budget.", "Cost-Guard protege tu presupuesto."],
        [
          tx({ de: "Jeder Render bekommt eine harte Budget-Kappe. Sobald die Prognose kippt, routen wir zum günstigeren Provider oder pausieren die Queue.", en: "Every render gets a hard budget cap. As soon as the forecast shifts, we route to the cheaper provider or pause the queue.", es: "Cada render tiene un límite de presupuesto estricto. Tan pronto como la previsión cambie, redirigimos al proveedor más barato o pausamos la cola." }),
          "Every render has a hard budget cap. The moment the forecast tips, we route to a cheaper provider or pause the queue.",
          "Cada render tiene un tope duro. Si el pronóstico se dispara, enrutamos a un proveedor más barato o pausamos la cola.",
        ],
      ),
    },
    {
      kind: "ui",
      UIComponent: LatencyDuelVisual,
      durationMs: 4800,
      copy: S(
        ["Multi-Provider · 05", "Multi-provider · 05", "Multi-provider · 05"],
        [tx({ de: "Sekunden schlagen Minuten.", en: "Seconds beat minutes.", es: "Los segundos ganan a los minutos." }), "Seconds beat minutes.", "Segundos vencen minutos."],
        [
          tx({ de: "Bei Deadline-Jobs zählt Latenz mehr als Preis. Der Router priorisiert automatisch die schnellste Route — perfekt für Reactive-Content.", en: "For deadline jobs, latency matters more than price. The router automatically prioritizes the fastest route — perfect for reactive content.", es: "Para trabajos con fecha límite, la latencia importa más que el precio. El enrutador prioriza automáticamente la ruta más rápida — perfecto para contenido reactivo." }),
          "For deadline jobs, latency beats price. The router automatically picks the fastest route — perfect for reactive content.",
          "Para jobs con deadline, la latencia manda. El router elige la ruta más rápida — perfecto para contenido reactivo.",
        ],
      ),
    },
    {
      kind: "ui",
      UIComponent: UnifiedOutputVisual,
      durationMs: 4800,
      copy: S(
        ["Multi-Provider · 06", "Multi-provider · 06", "Multi-provider · 06"],
        ["Ein Output-Format. Immer.", "One output format. Always.", "Un formato de salida. Siempre."],
        [
          tx({ de: "Egal welcher Provider — du bekommst dieselbe Qualität, denselben Codec, denselben Farbraum. Deine Timeline bleibt konsistent.", en: "No matter which provider, you get the same quality, the same codec, the same color space. Your timeline stays consistent.", es: "No importa qué proveedor, obtendrás la misma calidad, el mismo códec y el mismo espacio de color. Su línea de tiempo se mantiene constante." }),
          "Whichever provider — you get the same quality, codec and colour space. Your timeline stays consistent.",
          "Sea cual sea el proveedor — misma calidad, mismo códec, mismo color. Tu timeline se mantiene consistente.",
        ],
      ),
    },
  ],
  priceGuarantee: [
    {
      kind: "ui",
      UIComponent: FoundersSeatCounterVisual,
      durationMs: 5000,
      copy: S(
        ["Founders · 01", "Founders · 01", "Founders · 01"],
        ["Nur 1 000 Founder-Plätze.", "Only 1,000 founder seats.", "Solo 1.000 plazas de founder."],
        [
          tx({ de: "Die ersten 1 000 Founders sichern sich exklusive Konditionen. Jeder Slot ist gezählt — wenn er weg ist, ist er weg.", en: "The first 1,000 Founders secure exclusive conditions. Each slot is counted — once it's gone, it's gone.", es: "Los primeros 1.000 Founders aseguran condiciones exclusivas. Cada plaza está contada — una vez que se agota, se agota." }),
          "The first 1,000 founders lock in exclusive terms. Every seat is counted — once it's gone, it's gone.",
          "Los primeros 1.000 founders aseguran condiciones exclusivas. Cada plaza cuenta — cuando se agota, se agota.",
        ],
      ),
    },
    {
      kind: "ui",
      UIComponent: PriceLock24mVisual,
      durationMs: 5000,
      copy: S(
        ["Founders · 02", "Founders · 02", "Founders · 02"],
        [tx({ de: "20 % auf KI-Credits — 24 Monate.", en: "20% on AI credits — 24 months.", es: "20 % en créditos de IA: 24 meses." }), "20% off AI credits — for 24 months.", "20 % en créditos IA — 24 meses."],
        [
          tx({ de: "Das Abo kostet 14,99 € — für alle gleich. Als Founder bekommst du 24 Monate lang 20 % Rabatt auf jeden Kauf von KI-Credits.", en: "The subscription costs €14.99 — the same for everyone. As a Founder, you get a 20% discount on every AI credit purchase for 24 months.", es: "La suscripción cuesta 14,99 € — igual para todos. Como Founder, obtienes un 20% de descuento en cada compra de créditos de IA durante 24 meses." }),
          "The subscription is €14.99 for everyone. As a founder you get 20% off every AI credit purchase for 24 months.",
          "La suscripción cuesta 14,99 € para todos. Como founder obtienes un 20 % de descuento en cada compra de créditos IA durante 24 meses.",
        ],
      ),
    },
    {
      kind: "ui",
      UIComponent: DiscountShieldVisual,
      durationMs: 4800,
      copy: S(
        ["Founders · 03", "Founders · 03", "Founders · 03"],
        ["Plus 20 % Founder-Rabatt.", "Plus 20 % founder discount.", "Además 20 % de descuento founder."],
        [
          tx({ de: "Zusätzlich zum Beta-Preis bekommen Founders 20 % Rabatt on top. Automatisch bei jeder Rechnung — solange dein Abo läuft.", en: "In addition to the beta price, Founders get an extra 20% discount. Automatically on every invoice — as long as your subscription is active.", es: "Además del precio beta, los Founders obtienen un 20% de descuento adicional. Automáticamente en cada factura — mientras tu suscripción esté activa." }),
          "On top of the beta price, founders get an extra 20 % discount. Applied automatically to every invoice — as long as your subscription runs.",
          "Sobre el precio beta, los founders reciben un 20 % extra. Aplicado automáticamente en cada factura — mientras dure tu suscripción.",
        ],
      ),
    },
    {
      kind: "ui",
      UIComponent: TimelineGuaranteeVisual,
      durationMs: 5200,
      copy: S(
        ["Founders · 04", "Founders · 04", "Founders · 04"],
        ["24 Monate voller Preis-Sicherheit.", "24 months of price certainty.", "24 meses de precio seguro."],
        [
          tx({ de: "Vom ersten Tag bis Monat 24: dein Preis ist fix. Keine stillen Erhöhungen, keine Fair-Use-Aufschläge, kein Kleingedrucktes.", en: "From day one to month 24: your price is fixed. No silent increases, no fair-use surcharges, no fine print.", es: "Desde el primer día hasta el mes 24: tu precio es fijo. Sin aumentos silenciosos, sin recargos por uso justo, sin letra pequeña." }),
          "From day one to month 24: your price is fixed. No silent bumps, no fair-use surcharges, no small print.",
          "Del día uno al mes 24: tu precio es fijo. Sin subidas silenciosas, sin recargos de fair-use, sin letra pequeña.",
        ],
      ),
    },
    {
      kind: "ui",
      UIComponent: SeatMap1000Visual,
      durationMs: 5000,
      copy: S(
        ["Founders · 05", "Founders · 05", "Founders · 05"],
        [tx({ de: "Jeder Sitz ist sichtbar.", en: "Every seat is visible.", es: "Cada asiento es visible." }), "Every seat is visible.", "Cada plaza es visible."],
        [
          tx({ de: "Wir zeigen die Founder-Map live: wie viele Plätze bereits vergeben sind und wie viele noch frei. Kein Fake-Countdown, echte Zahlen.", en: "We show the Founder map live: how many spots are already taken and how many are still free. No fake countdown, real numbers.", es: "Mostramos el mapa de Founders en vivo: cuántas plazas ya están ocupadas y cuántas quedan libres. Sin cuenta atrás falsa, números reales." }),
          "We show the founder map live: how many seats are taken and how many are still open. No fake countdown, real numbers.",
          "Mostramos el mapa founder en vivo: cuántas plazas están tomadas y cuántas libres. Sin countdown falso, cifras reales.",
        ],
      ),
    },
    {
      kind: "ui",
      UIComponent: SavingsCurveVisual,
      durationMs: 5000,
      copy: S(
        ["Founders · 06", "Founders · 06", "Founders · 06"],
        [tx({ de: "− 90,96 € über 24 Monate.", en: "− €90.96 over 24 months.", es: "− 90,96 € durante 24 meses." }), "− €90.96 across 24 months.", "− 90,96 € en 24 meses."],
        [
          tx({ de: "Rechnet man Beta-Preis plus 20 % Founder-Rabatt gegen den regulären Tarif, sparst du über 24 Monate 90,96 €. Bei Kündigung ist der Vorteil weg.", en: "If you compare the beta price plus 20% Founder discount against the regular rate, you save €90.96 over 24 months. If you cancel, the benefit is gone.", es: "Si comparas el precio beta más el 20% de descuento de Founder con la tarifa regular, ahorras 90,96 € en 24 meses. Si cancelas, el beneficio desaparece." }),
          "Beta price plus 20 % founder discount vs. the regular tariff: you save €90.96 across 24 months. Cancel and the perk is gone.",
          "Precio beta más 20 % de descuento vs. tarifa regular: ahorras 90,96 € en 24 meses. Cancelas y el beneficio se pierde.",
        ],
      ),
    },
  ],
};

export const STORYLINE_CHROME: Record<Language, { slide: string; open: string; pause: string; play: string; close: string }> = {
  de: { slide: "Slide", open: "Studio öffnen", pause: "Pause", play: "Abspielen", close: tx({ de: "Schließen", en: "Close", es: "Cerrar" }) },
  en: { slide: "Slide", open: "Open studio", pause: "Pause", play: "Play", close: "Close" },
  es: { slide: "Slide", open: "Abrir estudio", pause: "Pausar", play: "Reproducir", close: "Cerrar" },
};
