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
    label: 'Problem → Lösung',
    mechanism:
      'Zeige zuerst den konkreten Ärger im Alltag der Zielgruppe, dann die Lösung als sichtbare Erleichterung. Kein Text erklärt das Problem — man sieht es.',
    beats: ['hook', 'problem', 'reveal', 'proof', 'cta'],
    wantsSpeaker: false,
  },
  {
    id: 'testimonial',
    label: 'Testimonial',
    mechanism:
      'Ein Mensch erzählt in eigenen Worten, was sich für ihn verändert hat. Ehrlich, unpoliert, nah am Gesicht. Die Aussage trägt den Film, nicht die Bilder.',
    beats: ['hook', 'emotion', 'proof', 'benefit', 'cta'],
    wantsSpeaker: true,
  },
  {
    id: 'visual_metaphor',
    label: 'Visuelle Metapher',
    mechanism:
      'Übersetze den Nutzen in ein einziges starkes Bild, das man nicht erklären muss. Die Metapher trägt den ganzen Film und löst sich am Ende im Produkt auf.',
    beats: ['hook', 'reveal', 'benefit', 'cta'],
    wantsSpeaker: false,
  },
  {
    id: 'micro_story',
    label: 'Mikro-Story mit Wendung',
    mechanism:
      'Eine winzige Geschichte mit Anfang, Kippmoment und Auflösung. Der Zuschauer glaubt zuerst etwas anderes zu sehen — die Wendung macht das Produkt zur Pointe.',
    beats: ['hook', 'problem', 'emotion', 'reveal', 'cta'],
    wantsSpeaker: false,
  },
  {
    id: 'product_poetry',
    label: 'Produkt-Poesie',
    mechanism:
      'Reine Sinnlichkeit: Makro, Licht, Textur, Bewegung. Kein Argument, nur Begehren. Rhythmus und Ton tragen die Wirkung.',
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
