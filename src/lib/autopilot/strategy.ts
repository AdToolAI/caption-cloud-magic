import { tx } from "@/lib/i18nText";
/**
 * The strategy layer.
 *
 * An agency does not start with pictures, it starts with a position. Feeding
 * the idea model a strategy first is what keeps the five concepts from being
 * five rewordings of the brief: each idea has to serve the same stated
 * audience, benefit and objection, but through a different mechanism.
 */

export type NarrativeAngle =
  | 'problem_solution'
  | 'testimonial'
  | 'visual_metaphor'
  | 'micro_story'
  | 'product_poetry';

export interface AngleSpec {
  id: NarrativeAngle;
  label: string;
  /** Given to the model as the mechanism it must use for this slot. */
  mechanism: string;
  /** Beats this angle naturally maps to. */
  beats: string[];
  /** Does the angle normally need someone to speak on camera? */
  wantsSpeaker: boolean;
}

export const NARRATIVE_ANGLES: AngleSpec[] = [
  {
    id: 'problem_solution',
    label: tx({ de: "Problem → Lösung", en: "Problem → Solution", es: "Problema → Solución" }),
    mechanism:
      tx({ de: 'Zeige zuerst den konkreten Ärger im Alltag der Zielgruppe, dann die Lösung als sichtbare Erleichterung. Kein Text erklärt das Problem — man sieht es.', en: 'First, show the specific annoyance in the target group\'s daily life, then the solution as a visible relief. No text explains the problem — you see it.', es: 'Primero, muestra la molestia concreta en la vida diaria del grupo objetivo, luego la solución como un alivio visible. Ningún texto explica el problema — se ve.' }),
    beats: ['hook', 'problem', 'reveal', 'proof', 'cta'],
    wantsSpeaker: false,
  },
  {
    id: 'testimonial',
    label: 'Testimonial',
    mechanism:
      tx({ de: 'Ein Mensch erzählt in eigenen Worten, was sich für ihn verändert hat. Ehrlich, unpoliert, nah am Gesicht. Die Aussage trägt den Film, nicht die Bilder.', en: 'A person tells in their own words what has changed for them. Honest, unpolished, close to the face. The statement carries the film, not the images.', es: 'Una persona cuenta con sus propias palabras lo que ha cambiado para ella. Honesto, sin pulir, cerca de la cara. La declaración es el eje de la película, no las imágenes.' }),
    beats: ['hook', 'emotion', 'proof', 'benefit', 'cta'],
    wantsSpeaker: true,
  },
  {
    id: 'visual_metaphor',
    label: 'Visuelle Metapher',
    mechanism:
      tx({ de: 'Übersetze den Nutzen in ein einziges starkes Bild, das man nicht erklären muss. Die Metapher trägt den ganzen Film und löst sich am Ende im Produkt auf.', en: 'Translate the benefit into a single strong image that doesn\'t need explanation. The metaphor carries the entire film and resolves into the product at the end.', es: 'Traduce el beneficio en una única imagen potente que no necesite explicación. La metáfora sostiene toda la película y se resuelve en el producto al final.' }),
    beats: ['hook', 'reveal', 'benefit', 'cta'],
    wantsSpeaker: false,
  },
  {
    id: 'micro_story',
    label: tx({ de: 'Mikro-Story mit Wendung', en: 'Micro story with a twist', es: 'Microhistoria con un giro' }),
    mechanism:
      tx({ de: 'Eine winzige Geschichte mit Anfang, Kippmoment und Auflösung. Der Zuschauer glaubt zuerst etwas anderes zu sehen — die Wendung macht das Produkt zur Pointe.', en: 'A tiny story with a beginning, a turning point, and a resolution. The viewer initially believes they are seeing something else — the twist makes the product the punchline.', es: 'Una pequeña historia con un principio, un punto de inflexión y una resolución. El espectador cree al principio que está viendo otra cosa — el giro convierte el producto en el remate.' }),
    beats: ['hook', 'problem', 'emotion', 'reveal', 'cta'],
    wantsSpeaker: false,
  },
  {
    id: 'product_poetry',
    label: 'Produkt-Poesie',
    mechanism:
      tx({ de: 'Reine Sinnlichkeit: Makro, Licht, Textur, Bewegung. Kein Argument, nur Begehren. Rhythmus und Ton tragen die Wirkung.', en: 'Pure sensuality: macro, light, texture, movement. No argument, just desire. Rhythm and tone carry the effect.', es: 'Sensualidad pura: macro, luz, textura, movimiento. Sin discusión, sólo deseo. El ritmo y el tono llevan el efecto.' }),
    beats: ['hook', 'reveal', 'emotion', 'benefit', 'cta'],
    wantsSpeaker: false,
  },
];

export interface AutopilotStrategy {
  /** Who exactly is watching. */
  audience: string;
  /** The one concrete benefit, in the customer's words. */
  benefit: string;
  /** What stops them from buying. */
  objection: string;
  /** Tone in three adjectives. */
  tone: string;
  /** What the viewer should have thought after three seconds. */
  threeSecondThought: string;
  /** The one thing to remember. */
  takeaway: string;
}

export interface IdeaBeat {
  beat: string;
  /** One sentence, customer-readable, in the user's language. */
  description: string;
  /** Rough seconds — the rhythm planner refines this later. */
  seconds: number;
}

export interface AutopilotIdea {
  index: number;
  angle: NarrativeAngle;
  title: string;
  /** The first-second hook, written as it will be seen. */
  hook: string;
  logline: string;
  beats: IdeaBeat[];
  /** Colour, light and texture direction, customer-readable. */
  visualWorld: string;
  /** Why this idea works for the stated strategy. One sentence. */
  rationale: string;
  /** Suggested genre recipe id. */
  genre: string;
  /** How many people are visible at most in any single shot. */
  maxPeopleInShot: number;
  /** Scenes with an on-camera speaker. */
  speakingScenes: number;
  /** Which uploaded assets appear, by asset id. */
  usesAssetIds: string[];
  /** 0-100, set by the feasibility filter, never by the model. */
  feasibilityScore?: number;
  feasibilityNotes?: string[];
}

export interface IdeaRoundResult {
  ideaRecordId: string;
  strategy: AutopilotStrategy;
  ideas: AutopilotIdea[];
}
