/**
 * Ad Tonality Profiles — 12 abstract advertising voice profiles
 *
 * IMPORTANT: These profiles describe LANGUAGE rules only. They never reference
 * trademarked brand names to avoid trademark infringement risk (German MarkenG §14,
 * UWG §6, EU AI Act Art. 50). They are based on advertising theory (Ogilvy, Bernbach,
 * Heath/Heath) — not on imitating specific brands.
 */

export type AdTonalityId =
  | 'minimal-premium'
  | 'bold-challenger'
  | 'warm-storyteller'
  | 'authentic-documentary'
  | 'playful-witty'
  | 'empathic-caring'
  | 'visionary-inspiring'
  | 'practical-helpful'
  | 'edgy-provocative'
  | 'energetic-hype'
  | 'trustworthy-expert'
  | 'joyful-optimistic';

export type SentenceLength = 'short' | 'medium' | 'long' | 'mixed';
export type Register = 'formal' | 'neutral' | 'casual';
export type Person = 'first' | 'second' | 'third' | 'we';
export type Tense = 'present' | 'future' | 'mixed';

export interface AdTonalityProfile {
  id: AdTonalityId;
  glyph: string;
  accentHsl: string;
  label: { de: string; en: string; es: string };
  shortDesc: { de: string; en: string; es: string };
  rules: {
    sentenceLength: SentenceLength;
    register: Register;
    person: Person;
    tense: Tense;
    forbidden: string[];
    encouraged: string[];
  };
  hookPatterns: { de: string[]; en: string[]; es: string[] };
  ctaPatterns: { de: string[]; en: string[]; es: string[] };
}

export const AD_TONALITY_PROFILES: AdTonalityProfile[] = [
  {
    id: 'minimal-premium',
    glyph: '✦',
    accentHsl: 'hsl(45, 70%, 70%)',
    label: { de: 'Minimal Premium', en: 'Minimal Premium', es: 'Minimal Premium' },
    shortDesc: {
      de: 'Kurze Sätze. Viel Pause. Substantive sprechen für sich.',
      en: 'Short sentences. Long pauses. Nouns speak for themselves.',
      es: 'Frases cortas. Pausas largas. Los sustantivos hablan solos.',
    },
    rules: {
      sentenceLength: 'short',
      register: 'formal',
      person: 'third',
      tense: 'present',
      forbidden: ['superlatives', 'exclamation marks', 'casual slang', 'emojis'],
      encouraged: ['nominal style', 'one-word lines', 'precise nouns'],
    },
    hookPatterns: {
      de: ['Eleganz. Neu definiert.', 'Stille. Hörbar.', 'Eine Form. Tausend Gedanken.'],
      en: ['Elegance. Redefined.', 'Silence. Audible.', 'One form. A thousand thoughts.'],
      es: ['Elegancia. Redefinida.', 'Silencio. Audible.', 'Una forma. Mil pensamientos.'],
    },
    ctaPatterns: {
      de: ['Erleben Sie es.', 'Verfügbar.', 'Jetzt. Im Sortiment.'],
      en: ['Experience it.', 'Available now.', 'Now. In stores.'],
      es: ['Vívelo.', 'Disponible.', 'Ahora. En tiendas.'],
    },
  },
  {
    id: 'bold-challenger',
    glyph: '⚡',
    accentHsl: 'hsl(15, 80%, 55%)',
    label: { de: 'Bold Challenger', en: 'Bold Challenger', es: 'Retador Audaz' },
    shortDesc: {
      de: 'Direkte Ansprache. Konfrontation. Imperativ.',
      en: 'Direct address. Confrontation. Imperative.',
      es: 'Tuteo directo. Confrontación. Imperativo.',
    },
    rules: {
      sentenceLength: 'short',
      register: 'casual',
      person: 'second',
      tense: 'present',
      forbidden: ['hedging language', 'maybe/perhaps', 'corporate speak'],
      encouraged: ['imperatives', 'direct questions', 'punchy verbs'],
    },
    hookPatterns: {
      de: ['Hör auf zu warten.', 'Wann ist genug genug?', 'Du verdienst mehr.'],
      en: ['Stop waiting.', "When's enough enough?", 'You deserve more.'],
      es: ['Deja de esperar.', '¿Cuándo es suficiente?', 'Mereces más.'],
    },
    ctaPatterns: {
      de: ['Mach es jetzt.', 'Wechsle. Heute.', 'Beweis es dir.'],
      en: ['Do it now.', 'Switch. Today.', 'Prove it to yourself.'],
      es: ['Hazlo ahora.', 'Cambia. Hoy.', 'Demuéstratelo.'],
    },
  },
  {
    id: 'warm-storyteller',
    glyph: '📖',
    accentHsl: 'hsl(25, 60%, 60%)',
    label: { de: 'Warm Storyteller', en: 'Warm Storyteller', es: 'Narrador Cálido' },
    shortDesc: {
      de: 'Erste Person. Sensorisch. Nostalgisch.',
      en: 'First person. Sensory. Nostalgic.',
      es: 'Primera persona. Sensorial. Nostálgico.',
    },
    rules: {
      sentenceLength: 'mixed',
      register: 'neutral',
      person: 'first',
      tense: 'mixed',
      forbidden: ['statistics', 'corporate jargon', 'hard sells'],
      encouraged: ['sensory details', 'time markers', 'human moments'],
    },
    hookPatterns: {
      de: [
        'Es begann an einem Mittwoch im November...',
        'Ich erinnere mich an den Geruch...',
        'Damals, als alles noch einfacher schien...',
      ],
      en: [
        'It began on a Wednesday in November...',
        'I remember the smell...',
        'Back when everything seemed simpler...',
      ],
      es: [
        'Empezó un miércoles de noviembre...',
        'Recuerdo el olor...',
        'Cuando todo parecía más simple...',
      ],
    },
    ctaPatterns: {
      de: ['Schreibe deine Geschichte.', 'Beginne dein Kapitel.', 'Erlebe es selbst.'],
      en: ['Write your story.', 'Begin your chapter.', 'Live it yourself.'],
      es: ['Escribe tu historia.', 'Comienza tu capítulo.', 'Vívelo tú mismo.'],
    },
  },
  {
    id: 'authentic-documentary',
    glyph: '🎬',
    accentHsl: 'hsl(200, 30%, 55%)',
    label: { de: 'Authentic Documentary', en: 'Authentic Documentary', es: 'Documental Auténtico' },
    shortDesc: {
      de: 'Faktenbasiert. Zitate. Echtheit über Hochglanz.',
      en: 'Fact-based. Quotes. Authenticity over polish.',
      es: 'Basado en hechos. Citas. Autenticidad ante todo.',
    },
    rules: {
      sentenceLength: 'medium',
      register: 'neutral',
      person: 'third',
      tense: 'mixed',
      forbidden: ['superlatives', 'fluff adjectives', 'manipulative language'],
      encouraged: ['statistics', 'real quotes', 'specific names', 'dates'],
    },
    hookPatterns: {
      de: [
        '73 % der Befragten sagen...',
        'Im April 2024 entschied sich Maria, alles zu ändern.',
        'Das hier ist keine Werbung. Das hier ist passiert.',
      ],
      en: [
        '73% of those surveyed say...',
        'In April 2024, Maria decided to change everything.',
        "This isn't an ad. This is what happened.",
      ],
      es: [
        'El 73 % de los encuestados dice...',
        'En abril de 2024, María decidió cambiar todo.',
        'Esto no es publicidad. Esto pasó.',
      ],
    },
    ctaPatterns: {
      de: ['Lies die ganze Geschichte.', 'Sieh es selbst.', 'Mehr erfahren.'],
      en: ['Read the full story.', 'See for yourself.', 'Learn more.'],
      es: ['Lee la historia completa.', 'Compruébalo.', 'Más información.'],
    },
  },
  {
    id: 'playful-witty',
    glyph: '🎭',
    accentHsl: 'hsl(290, 60%, 65%)',
    label: { de: 'Playful Witty', en: 'Playful Witty', es: 'Divertido e Ingenioso' },
    shortDesc: {
      de: 'Wortspiele. Überraschung. Locker.',
      en: 'Wordplay. Surprise. Loose.',
      es: 'Juegos de palabras. Sorpresa. Relajado.',
    },
    rules: {
      sentenceLength: 'mixed',
      register: 'casual',
      person: 'second',
      tense: 'present',
      forbidden: ['corporate tone', 'over-explanation', 'fear appeals'],
      encouraged: ['puns', 'unexpected twists', 'playful contradictions'],
    },
    hookPatterns: {
      de: [
        'Weil Mittwoch der neue Freitag ist.',
        'Spoiler: Es schmeckt nicht nach Brokkoli.',
        'Klein. Aber nicht so klein, wie deine Geduld.',
      ],
      en: [
        'Because Wednesday is the new Friday.',
        "Spoiler: It doesn't taste like broccoli.",
        'Small. But not as small as your patience.',
      ],
      es: [
        'Porque el miércoles es el nuevo viernes.',
        'Spoiler: no sabe a brócoli.',
        'Pequeño. Pero no tanto como tu paciencia.',
      ],
    },
    ctaPatterns: {
      de: ['Probier’s aus. Was kann schon schiefgehen?', 'Klick mich.', 'Du weißt, was zu tun ist.'],
      en: ["Try it. What's the worst that could happen?", 'Click me.', 'You know what to do.'],
      es: ['Pruébalo. ¿Qué puede salir mal?', 'Haz clic.', 'Ya sabes qué hacer.'],
    },
  },
  {
    id: 'empathic-caring',
    glyph: '💛',
    accentHsl: 'hsl(40, 85%, 70%)',
    label: { de: 'Empathic Caring', en: 'Empathic Caring', es: 'Empático y Cercano' },
    shortDesc: {
      de: 'Verstehend. Beruhigend. Du-Form.',
      en: 'Understanding. Reassuring. You-form.',
      es: 'Comprensivo. Tranquilizador. Tuteo.',
    },
    rules: {
      sentenceLength: 'medium',
      register: 'neutral',
      person: 'second',
      tense: 'present',
      forbidden: ['fear-based language', 'pressure tactics', 'judgment'],
      encouraged: ['validation', 'gentle questions', 'inclusive language'],
    },
    hookPatterns: {
      de: [
        'Wir wissen, wie sich das anfühlt.',
        'Du bist nicht allein damit.',
        'Manche Tage sind schwerer als andere.',
      ],
      en: [
        'We know how that feels.',
        "You're not alone in this.",
        'Some days are harder than others.',
      ],
      es: [
        'Sabemos cómo se siente.',
        'No estás solo en esto.',
        'Algunos días son más duros que otros.',
      ],
    },
    ctaPatterns: {
      de: ['Wir sind hier.', 'Mach den ersten Schritt.', 'In deinem Tempo.'],
      en: ["We're here.", 'Take the first step.', 'At your own pace.'],
      es: ['Estamos aquí.', 'Da el primer paso.', 'A tu ritmo.'],
    },
  },
  {
    id: 'visionary-inspiring',
    glyph: '🌅',
    accentHsl: 'hsl(220, 70%, 65%)',
    label: { de: 'Visionary Inspiring', en: 'Visionary Inspiring', es: 'Visionario Inspirador' },
    shortDesc: {
      de: 'Großes Bild. Future Tense. Pathos.',
      en: 'Big picture. Future tense. Pathos.',
      es: 'Visión amplia. Tiempo futuro. Pathos.',
    },
    rules: {
      sentenceLength: 'long',
      register: 'formal',
      person: 'we',
      tense: 'future',
      forbidden: ['small talk', 'casual slang', 'self-deprecation'],
      encouraged: ['rhetorical questions', 'aspirational verbs', 'cosmic scale'],
    },
    hookPatterns: {
      de: [
        'Was wäre, wenn alles möglich wäre?',
        'Stell dir eine Welt vor, in der...',
        'Die Zukunft beginnt nicht morgen.',
      ],
      en: [
        'What if everything were possible?',
        'Imagine a world where...',
        "The future doesn't start tomorrow.",
      ],
      es: [
        '¿Y si todo fuera posible?',
        'Imagina un mundo donde...',
        'El futuro no empieza mañana.',
      ],
    },
    ctaPatterns: {
      de: ['Gestalte mit uns.', 'Werde Teil davon.', 'Die Welt wartet nicht.'],
      en: ['Shape it with us.', 'Be part of it.', "The world isn't waiting."],
      es: ['Constrúyelo con nosotros.', 'Sé parte de ello.', 'El mundo no espera.'],
    },
  },
  {
    id: 'practical-helpful',
    glyph: '🛠️',
    accentHsl: 'hsl(170, 50%, 50%)',
    label: { de: 'Practical Helpful', en: 'Practical Helpful', es: 'Práctico y Útil' },
    shortDesc: {
      de: 'Anleitend. Listen. How-to.',
      en: 'Instructive. Lists. How-to.',
      es: 'Instructivo. Listas. Cómo hacer.',
    },
    rules: {
      sentenceLength: 'medium',
      register: 'neutral',
      person: 'second',
      tense: 'present',
      forbidden: ['emotional manipulation', 'vague promises', 'jargon'],
      encouraged: ['numbered steps', 'concrete actions', 'time estimates'],
    },
    hookPatterns: {
      de: [
        'In drei Schritten zum Ergebnis.',
        'So funktioniert es. Wirklich.',
        'Brauchst du nur 60 Sekunden.',
      ],
      en: ['Three steps to the result.', 'How it works. Really.', "It only takes 60 seconds."],
      es: ['Tres pasos al resultado.', 'Cómo funciona. De verdad.', 'Solo 60 segundos.'],
    },
    ctaPatterns: {
      de: ['Jetzt ausprobieren.', 'Schritt 1: Klicken.', 'Anleitung holen.'],
      en: ['Try it now.', 'Step 1: Click.', 'Get the guide.'],
      es: ['Pruébalo ahora.', 'Paso 1: Haz clic.', 'Obtén la guía.'],
    },
  },
  {
    id: 'edgy-provocative',
    glyph: '🔥',
    accentHsl: 'hsl(0, 75%, 50%)',
    label: { de: 'Edgy Provocative', en: 'Edgy Provocative', es: 'Audaz y Provocador' },
    shortDesc: {
      de: 'Tabubruch. Schwarzer Humor. Anti-Establishment.',
      en: 'Taboo-breaking. Dark humor. Anti-establishment.',
      es: 'Romper tabúes. Humor negro. Anti-establishment.',
    },
    rules: {
      sentenceLength: 'short',
      register: 'casual',
      person: 'second',
      tense: 'present',
      forbidden: ['corporate sanitization', 'safe choices', 'hedging'],
      encouraged: ['contrarian statements', 'irony', 'bold claims'],
    },
    hookPatterns: {
      de: [
        'Vergiss alles, was du wusstest.',
        'Wir sind die Schlechten. Aber wir liefern.',
        'Sicherheit ist überbewertet.',
      ],
      en: [
        'Forget everything you knew.',
        'We are the bad ones. But we deliver.',
        'Safety is overrated.',
      ],
      es: [
        'Olvida todo lo que sabías.',
        'Somos los malos. Pero cumplimos.',
        'La seguridad está sobrevalorada.',
      ],
    },
    ctaPatterns: {
      de: ['Wage es.', 'Brich die Regel.', 'Du oder die anderen.'],
      en: ['Dare it.', 'Break the rule.', 'You or them.'],
      es: ['Atrévete.', 'Rompe la regla.', 'Tú o ellos.'],
    },
  },
  {
    id: 'energetic-hype',
    glyph: '🚀',
    accentHsl: 'hsl(330, 80%, 60%)',
    label: { de: 'Energetic Hype', en: 'Energetic Hype', es: 'Energético y Vibrante' },
    shortDesc: {
      de: 'Ausrufe. Tempo. Pop-Vokabular.',
      en: 'Exclamations. Tempo. Pop vocabulary.',
      es: 'Exclamaciones. Ritmo. Vocabulario pop.',
    },
    rules: {
      sentenceLength: 'short',
      register: 'casual',
      person: 'second',
      tense: 'present',
      forbidden: ['long explanations', 'somber tone', 'understatement'],
      encouraged: ['exclamations', 'urgency words', 'pop-culture refs'],
    },
    hookPatterns: {
      de: ['JETZT! Hier! Limited!', 'Du bist nicht bereit dafür!', 'Drei. Zwei. Eins. Los!'],
      en: ['NOW! Here! Limited!', "You're not ready for this!", 'Three. Two. One. Go!'],
      es: ['¡AHORA! ¡Aquí! ¡Limitado!', '¡No estás listo!', 'Tres. Dos. Uno. ¡Vamos!'],
    },
    ctaPatterns: {
      de: ['Sicher dir deins!', 'Bevor es weg ist!', 'Klick. Sofort.'],
      en: ['Get yours!', "Before it's gone!", 'Click. Now.'],
      es: ['¡Consigue el tuyo!', '¡Antes de que se acabe!', 'Haz clic. Ya.'],
    },
  },
  {
    id: 'trustworthy-expert',
    glyph: '🔬',
    accentHsl: 'hsl(210, 50%, 55%)',
    label: { de: 'Trustworthy Expert', en: 'Trustworthy Expert', es: 'Experto Confiable' },
    shortDesc: {
      de: 'Zahlen. Studien. Fachsprache, mild dosiert.',
      en: 'Numbers. Studies. Mild jargon.',
      es: 'Cifras. Estudios. Jerga moderada.',
    },
    rules: {
      sentenceLength: 'medium',
      register: 'formal',
      person: 'we',
      tense: 'mixed',
      forbidden: ['hyperbole', 'unverified claims', 'pop slang'],
      encouraged: ['certifications', 'years of experience', 'measurable results'],
    },
    hookPatterns: {
      de: [
        'Klinisch geprüft seit 1987.',
        'Drei unabhängige Studien. Ein Ergebnis.',
        'Wir messen, was andere versprechen.',
      ],
      en: [
        'Clinically tested since 1987.',
        'Three independent studies. One result.',
        'We measure what others promise.',
      ],
      es: [
        'Probado clínicamente desde 1987.',
        'Tres estudios independientes. Un resultado.',
        'Medimos lo que otros prometen.',
      ],
    },
    ctaPatterns: {
      de: ['Daten ansehen.', 'Beratung anfragen.', 'Studie herunterladen.'],
      en: ['View the data.', 'Request a consultation.', 'Download the study.'],
      es: ['Ver los datos.', 'Solicitar asesoría.', 'Descargar el estudio.'],
    },
  },
  {
    id: 'joyful-optimistic',
    glyph: '🌈',
    accentHsl: 'hsl(50, 90%, 65%)',
    label: { de: 'Joyful Optimistic', en: 'Joyful Optimistic', es: 'Alegre y Optimista' },
    shortDesc: {
      de: 'Helle Sprache. Inklusion. Wir-Form.',
      en: 'Bright language. Inclusion. We-form.',
      es: 'Lenguaje luminoso. Inclusión. Nosotros.',
    },
    rules: {
      sentenceLength: 'medium',
      register: 'casual',
      person: 'we',
      tense: 'present',
      forbidden: ['cynicism', 'fear', 'exclusion'],
      encouraged: ['celebration words', 'collective pronouns', 'sun/light imagery'],
    },
    hookPatterns: {
      de: [
        'Gemeinsam machen wir den Tag bunter.',
        'Heute ist ein guter Tag, oder?',
        'Lass uns lächeln. Aus einem Grund.',
      ],
      en: [
        'Together we make the day brighter.',
        "Today's a good day, isn't it?",
        "Let's smile. For a reason.",
      ],
      es: [
        'Juntos hacemos el día más brillante.',
        'Hoy es un buen día, ¿no?',
        'Sonríamos. Por una razón.',
      ],
    },
    ctaPatterns: {
      de: ['Mach mit.', 'Sei dabei.', 'Heute beginnen.'],
      en: ['Join in.', 'Be there.', 'Start today.'],
      es: ['Únete.', 'Acompáñanos.', 'Empieza hoy.'],
    },
  },
];

export function getAdTonalityProfile(id: AdTonalityId): AdTonalityProfile | undefined {
  return AD_TONALITY_PROFILES.find((p) => p.id === id);
}

/**
 * Build a system-prompt fragment for Lovable AI script generation
 * based on the chosen tonality profile.
 */
export function buildTonalitySystemPrompt(
  id: AdTonalityId,
  language: 'de' | 'en' | 'es' = 'en',
): string {
  const profile = getAdTonalityProfile(id);
  if (!profile) return '';

  const langName = language === 'de' ? 'German' : language === 'es' ? 'Spanish' : 'English';
  const hooks = profile.hookPatterns[language].join(' | ');
  const ctas = profile.ctaPatterns[language].join(' | ');

  return [
    `TONALITY PROFILE: ${profile.label[language]}`,
    `Description: ${profile.shortDesc[language]}`,
    ``,
    `LANGUAGE RULES (write in ${langName}):`,
    `- Sentence length: ${profile.rules.sentenceLength}`,
    `- Register: ${profile.rules.register}`,
    `- Person: ${profile.rules.person} person`,
    `- Tense: ${profile.rules.tense}`,
    `- AVOID: ${profile.rules.forbidden.join(', ')}`,
    `- USE: ${profile.rules.encouraged.join(', ')}`,
    ``,
    `HOOK PATTERN EXAMPLES (use as inspiration, never copy verbatim):`,
    hooks,
    ``,
    `CTA PATTERN EXAMPLES:`,
    ctas,
    ``,
    `CRITICAL: Never reference real-world brand names (Apple, Nike, Coca-Cola, etc.) in the output. Generate original copy only.`,
  ].join('\n');
}
