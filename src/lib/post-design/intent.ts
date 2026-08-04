/**
 * Intent-Erkennung für Bildposts.
 *
 * Der Intent steuert, welche Layout-Familien für die Varianten gewichtet
 * werden — statt immer derselben acht Vorlagen.
 */

export type PostIntent =
  | "offer"
  | "product"
  | "knowledge"
  | "proof"
  | "launch"
  | "event"
  | "engagement"
  | "statement";

export const POST_INTENTS: PostIntent[] = [
  "offer",
  "product",
  "knowledge",
  "proof",
  "launch",
  "event",
  "engagement",
  "statement",
];

export function isPostIntent(value: unknown): value is PostIntent {
  return typeof value === "string" && (POST_INTENTS as string[]).includes(value);
}

const RULES: { intent: PostIntent; re: RegExp }[] = [
  { intent: "offer", re: /rabatt|angebot|sale|% ?off|prozent|deal|aktion|gutschein|spar|preis|kostenlos|gratis/i },
  { intent: "launch", re: /launch|neu(heit)?\b|jetzt verfügbar|premiere|vorstellung|release|ab sofort/i },
  { intent: "event", re: /event|webinar|workshop|messe|termin|live am|einladung|konferenz|stream/i },
  { intent: "proof", re: /kunde|testimonial|bewertung|ergebnis|case ?study|vorher|nachher|referenz|erfolg/i },
  { intent: "knowledge", re: /tipp|schritt|anleitung|guide|checkliste|so geht|fehler|wissen|erklär|ratgeber/i },
  { intent: "engagement", re: /frage|umfrage|was denk|kennst du|abstimm|kommentier|diskussion/i },
  { intent: "product", re: /produkt|kollektion|feature|modell|shop|bestell|sortiment|material/i },
];

/** Heuristische Erkennung als Fallback, wenn die KI keinen Intent liefert. */
export function detectIntent(brief: string): PostIntent {
  for (const rule of RULES) if (rule.re.test(brief)) return rule.intent;
  return "statement";
}

/** Gewichtete Familien-Reihenfolge je Intent. */
export const INTENT_FAMILY_BIAS: Record<PostIntent, string[]> = {
  offer: ["utility", "bold", "split", "minimal", "editorial"],
  product: ["split", "minimal", "bold", "editorial", "utility"],
  knowledge: ["utility", "editorial", "minimal", "split", "bold"],
  proof: ["editorial", "split", "minimal", "bold", "utility"],
  launch: ["bold", "split", "minimal", "utility", "editorial"],
  event: ["utility", "bold", "editorial", "split", "minimal"],
  engagement: ["minimal", "bold", "editorial", "utility", "split"],
  statement: ["bold", "minimal", "editorial", "split", "utility"],
};

/** Stabiler Seed aus dem Briefing — gleiche Eingabe, gleiche Varianten. */
export function seedFromText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}
