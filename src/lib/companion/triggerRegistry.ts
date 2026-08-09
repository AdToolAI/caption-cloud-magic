import { tx } from "@/lib/i18nText";
/**
 * Declarative registry of companion trigger definitions.
 *
 * Each trigger is a stable key that the coach hook can fire once per
 * cooldown window. Route triggers fire from the router, intent/milestone
 * triggers are fired imperatively via `useCompanionCoach().fire(key)`.
 *
 * Copy is localized inline (de/en/es) so no translation table is needed.
 */

export type TriggerCategory = 'route' | 'intent' | 'milestone';

export interface TriggerCopy {
  title: string;
  body: string;
  cta?: string;
  ctaHref?: string;
}

export interface TriggerDefinition {
  key: string;
  category: TriggerCategory;
  /** Route path (or startsWith prefix) that auto-fires this trigger. */
  routeMatch?: string;
  /** Minimum days between successive fires (Anti-Nag-Guard). */
  cooldownDays: number;
  /** Whether this trigger is critical enough to bypass the per-day cap. */
  bypassDailyCap?: boolean;
  copy: {
    de: TriggerCopy;
    en: TriggerCopy;
    es: TriggerCopy;
  };
}

export const TRIGGER_REGISTRY: TriggerDefinition[] = [
  // ── Route triggers ────────────────────────────────────────────────────────
  {
    key: 'route.cast-world.first-visit',
    category: 'route',
    routeMatch: '/cast-world',
    cooldownDays: 30,
    copy: {
      de: {
        title: 'Cast & World',
        body: tx({ de: 'Hier lebt dein Ensemble. Lege Charaktere, Locations und Requisiten an — sie werden dann in jedem Studio wiederverwendet.', en: 'This is where your ensemble lives. Create characters, locations, and props — they will then be reused in every studio.', es: 'Aquí vive tu elenco. Crea personajes, ubicaciones y accesorios — luego se reutilizarán en cada estudio.' }),
        cta: 'Ersten Charakter anlegen',
      },
      en: {
        title: 'Cast & World',
        body: 'Your ensemble lives here. Create characters, locations, and props once — every studio reuses them.',
        cta: 'Create first character',
      },
      es: {
        title: 'Cast & World',
        body: 'Aquí vive tu elenco. Crea personajes, lugares y accesorios una vez y todos los estudios los reutilizan.',
        cta: 'Crear primer personaje',
      },
    },
  },
  {
    key: 'route.motion-studio.first-visit',
    category: 'route',
    routeMatch: '/motion-studio',
    cooldownDays: 30,
    copy: {
      de: {
        title: 'Motion Studio',
        body: tx({ de: 'Der geführte Flow durch Cast → Skript → Szene → Composer. Ideal für deinen ersten Spot.', en: 'The guided flow through Cast → Script → Scene → Composer. Ideal for your first spot.', es: 'El flujo guiado a través de Elenco → Guion → Escena → Compositor. Ideal para tu primer anuncio.' }),
        cta: 'Studio Mode starten',
      },
      en: {
        title: 'Motion Studio',
        body: 'Guided flow: Cast → Script → Scene → Composer. Perfect for your first spot.',
        cta: 'Start Studio Mode',
      },
      es: {
        title: 'Motion Studio',
        body: 'Flujo guiado: Elenco → Guion → Escena → Composer. Perfecto para tu primer spot.',
        cta: 'Iniciar Studio Mode',
      },
    },
  },
  {
    key: 'route.ai-video.first-visit',
    category: 'route',
    routeMatch: '/ai-video-toolkit',
    cooldownDays: 30,
    copy: {
      de: {
        title: 'AI Video Studio',
        body: tx({ de: 'Direktzugang zu 29+ Video-Modellen. Für schnelle Shots ohne Composer-Overhead.', en: 'Direct access to 29+ video models. For quick shots without composer overhead.', es: 'Acceso directo a más de 29 modelos de vídeo. Para tomas rápidas sin que el compositor esté por encima.' }),
      },
      en: {
        title: 'AI Video Studio',
        body: 'Direct access to 29+ video models. Great for quick shots without the Composer overhead.',
      },
      es: {
        title: 'AI Video Studio',
        body: 'Acceso directo a 29+ modelos de vídeo. Ideal para tomas rápidas sin el Composer.',
      },
    },
  },
  {
    key: 'route.audio-studio.first-visit',
    category: 'route',
    routeMatch: '/audio-studio',
    cooldownDays: 30,
    copy: {
      de: {
        title: 'Music & Voice Studio',
        body: tx({ de: 'Erzeuge Songs mit 4 Engines oder klone deine eigene Stimme. Alle Ergebnisse landen in deiner Library.', en: 'Generate songs with 4 engines or clone your own voice. All results land in your Library.', es: 'Genera canciones con 4 motores o clona tu propia voz. Todos los resultados se guardan en tu Biblioteca.' }),
      },
      en: {
        title: 'Music & Voice Studio',
        body: 'Generate songs with 4 engines or clone your own voice. Everything lands in your library.',
      },
      es: {
        title: 'Music & Voice Studio',
        body: 'Genera canciones con 4 motores o clona tu propia voz. Todo se guarda en tu biblioteca.',
      },
    },
  },
  {
    key: 'route.picture-studio.first-visit',
    category: 'route',
    routeMatch: '/picture-studio',
    cooldownDays: 30,
    copy: {
      de: {
        title: 'Picture Studio',
        body: tx({ de: 'Storyboards, Keyframes, Anchor-Frames — hier entstehen die Bilder für deine Szenen.', en: 'Storyboards, keyframes, anchor frames — this is where the images for your scenes are created.', es: 'Storyboards, fotogramas clave, fotogramas de anclaje — aquí se crean las imágenes para tus escenas.' }),
      },
      en: {
        title: 'Picture Studio',
        body: 'Storyboards, keyframes, anchor frames — the visual seeds for your scenes live here.',
      },
      es: {
        title: 'Picture Studio',
        body: 'Storyboards, keyframes y anchor frames — la base visual de tus escenas.',
      },
    },
  },
  {
    key: 'route.composer.first-visit',
    category: 'route',
    routeMatch: '/composer',
    cooldownDays: 30,
    copy: {
      de: {
        title: "Director's Cut Composer",
        body: tx({ de: 'Der finale Editor: Timeline, Subtitles, Music-Mix, Export. WYSIWYG bis zum Render.', en: 'The final editor: timeline, subtitles, music mix, export. WYSIWYG to render.', es: 'El editor final: línea de tiempo, subtítulos, mezcla de música, exportación. WYSIWYG para renderizar.' }),
      },
      en: {
        title: "Director's Cut Composer",
        body: 'Final editor: timeline, subtitles, music mix, export. WYSIWYG all the way to render.',
      },
      es: {
        title: "Director's Cut Composer",
        body: 'Editor final: línea de tiempo, subtítulos, música, exportación. WYSIWYG hasta el render.',
      },
    },
  },

  // ── Intent triggers ──────────────────────────────────────────────────────
  {
    key: 'intent.wallet.low',
    category: 'intent',
    cooldownDays: 3,
    bypassDailyCap: true,
    copy: {
      de: {
        title: 'Wallet-Guthaben niedrig',
        body: tx({ de: 'Dein AI-Guthaben ist fast leer. Rendern läuft weiter, sobald du auflädst.', en: 'Your AI credit is almost depleted. Rendering will resume once you top up.', es: 'Tu crédito de IA está casi agotado. El renderizado continuará una vez que recargues.' }),
        cta: 'Guthaben aufladen',
        ctaHref: '/ai-video-toolkit#purchase',
      },
      en: {
        title: 'Wallet balance low',
        body: 'Your AI wallet is almost empty. Renders resume once you top up.',
        cta: 'Top up wallet',
        ctaHref: '/ai-video-toolkit#purchase',
      },
      es: {
        title: 'Saldo bajo',
        body: 'Tu saldo de IA está casi vacío. Los renders continúan cuando recargues.',
        cta: 'Recargar saldo',
        ctaHref: '/ai-video-toolkit#purchase',
      },
    },
  },
  {
    key: 'intent.errors.streak',
    category: 'intent',
    cooldownDays: 1,
    bypassDailyCap: true,
    copy: {
      de: {
        title: 'Klemmt gerade etwas?',
        body: tx({ de: 'Ich sehe mehrere Fehlversuche. Willst du dass ich mir das anschaue oder direkt einen Support-Ticket öffne?', en: 'I see multiple failed attempts. Do you want me to look into it or open a support ticket directly?', es: 'Veo varios intentos fallidos. ¿Quieres que lo revise o que abra un ticket de soporte directamente?' }),
      },
      en: {
        title: 'Something stuck?',
        body: 'I see several failed attempts. Want me to take a look, or open a support ticket right away?',
      },
      es: {
        title: '¿Algo atascado?',
        body: 'Veo varios intentos fallidos. ¿Miro yo o abro un ticket de soporte?',
      },
    },
  },

  // ── Milestone triggers ───────────────────────────────────────────────────
  {
    key: 'milestone.first-render.success',
    category: 'milestone',
    cooldownDays: 365,
    copy: {
      de: {
        title: tx({ de: 'Erste Szene gerendert 🎬', en: 'First scene rendered 🎬', es: 'Primera escena renderizada 🎬' }),
        body: tx({ de: 'Sehr gut. Als nächstes: eigene Musik im Audio Studio dazu — oder direkt in den Composer für den finalen Cut.', en: 'Very good. Next: add your own music in the Audio Studio — or directly to the Composer for the final cut.', es: 'Muy bien. Siguiente: añade tu propia música en el Estudio de Audio — o directamente al Compositor para el corte final.' }),
        cta: 'Zum Audio Studio',
        ctaHref: '/audio-studio',
      },
      en: {
        title: 'First scene rendered 🎬',
        body: 'Nice. Next: add your own music in the Audio Studio — or jump into the Composer for the final cut.',
        cta: 'Open Audio Studio',
        ctaHref: '/audio-studio',
      },
      es: {
        title: 'Primera escena renderizada 🎬',
        body: 'Bien hecho. Siguiente: añade música en el Audio Studio — o salta al Composer para el corte final.',
        cta: 'Abrir Audio Studio',
        ctaHref: '/audio-studio',
      },
    },
  },
  {
    key: 'milestone.cast-master',
    category: 'milestone',
    cooldownDays: 365,
    copy: {
      de: {
        title: 'Cast Master',
        body: tx({ de: '5 Charaktere im Ensemble — Zeit für ein Ensemble-Spot mit mehreren Sprechern.', en: '5 characters in the ensemble — time for an ensemble spot with multiple speakers.', es: '5 personajes en el elenco — es hora de un anuncio de conjunto con varios oradores.' }),
      },
      en: {
        title: 'Cast Master',
        body: 'Five characters in your ensemble — time for an ensemble spot with multiple speakers.',
      },
      es: {
        title: 'Cast Master',
        body: 'Cinco personajes en tu elenco — es hora de un spot con varios personajes.',
      },
    },
  },
  {
    key: 'milestone.voice-pioneer',
    category: 'milestone',
    cooldownDays: 365,
    copy: {
      de: {
        title: 'Voice Pioneer',
        body: tx({ de: 'Eigene Stimme geklont. Weise sie einem Charakter in Cast & World fest zu — dann greifen alle Studios automatisch darauf zurück.', en: 'Own voice cloned. Assign it permanently to a character in Cast & World — then all studios will automatically use it.', es: 'Voz propia clonada. Asígnala permanentemente a un personaje en Elenco y Mundo — entonces todos los estudios la usarán automáticamente.' }),
      },
      en: {
        title: 'Voice Pioneer',
        body: "Voice cloned. Assign it to a Cast & World character and every studio picks it up automatically.",
      },
      es: {
        title: 'Voice Pioneer',
        body: 'Voz clonada. Asígnala a un personaje en Cast & World y todos los estudios la usarán.',
      },
    },
  },
];

export function findTrigger(key: string) {
  return TRIGGER_REGISTRY.find((t) => t.key === key);
}

export function routeTriggerFor(path: string) {
  return TRIGGER_REGISTRY.find(
    (t) => t.category === 'route' && t.routeMatch && path.startsWith(t.routeMatch),
  );
}

export function milestoneCount() {
  return TRIGGER_REGISTRY.filter((t) => t.category === 'milestone').length;
}
