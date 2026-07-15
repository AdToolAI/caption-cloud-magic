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
        body: 'Hier lebt dein Ensemble. Lege Charaktere, Locations und Requisiten an — sie werden dann in jedem Studio wiederverwendet.',
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
        body: 'Der geführte Flow durch Cast → Skript → Szene → Composer. Ideal für deinen ersten Spot.',
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
        body: 'Direktzugang zu 29+ Video-Modellen. Für schnelle Shots ohne Composer-Overhead.',
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
        body: 'Erzeuge Songs mit 4 Engines oder klone deine eigene Stimme. Alle Ergebnisse landen in deiner Library.',
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
        body: 'Storyboards, Keyframes, Anchor-Frames — hier entstehen die Bilder für deine Szenen.',
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
        body: 'Der finale Editor: Timeline, Subtitles, Music-Mix, Export. WYSIWYG bis zum Render.',
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
        body: 'Dein AI-Guthaben ist fast leer. Rendern läuft weiter, sobald du auflädst.',
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
        body: 'Ich sehe mehrere Fehlversuche. Willst du dass ich mir das anschaue oder direkt einen Support-Ticket öffne?',
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
        title: 'Erste Szene gerendert 🎬',
        body: 'Sehr gut. Als nächstes: eigene Musik im Audio Studio dazu — oder direkt in den Composer für den finalen Cut.',
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
        body: '5 Charaktere im Ensemble — Zeit für ein Ensemble-Spot mit mehreren Sprechern.',
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
        body: 'Eigene Stimme geklont. Weise sie einem Charakter in Cast & World fest zu — dann greifen alle Studios automatisch darauf zurück.',
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
