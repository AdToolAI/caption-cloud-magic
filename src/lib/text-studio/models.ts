import { tx } from "@/lib/i18nText";
// AI Text Studio - Model Registry
// Auswahl in zwei Schritten: Anbieter -> Qualitätsstufe.
// Preise in EUR pro 1k Tokens (Endkundenpreis inkl. Marge).

export type TextModelId =
  // OpenAI
  | "openai-gpt-5-6-luna"
  | "openai-gpt-5-6-terra"
  | "openai-gpt-5-6-sol"
  // Google
  | "google-gemini-3-1-flash-lite"
  | "google-gemini-3-6-flash"
  | "google-gemini-3-1-pro"
  // Anthropic
  | "anthropic-claude-4-1-opus";

export type TextProvider = "lovable-gateway" | "anthropic";
export type TextProviderKey = "openai" | "google" | "anthropic";
export type TextTier = "fast" | "balanced" | "max";

export interface TextModel {
  id: TextModelId;
  label: string;
  provider: TextProvider;
  providerKey: TextProviderKey;
  tier: TextTier;
  /** Gateway/provider-internal model identifier */
  apiModel: string;
  description: string;
  /** End-user price in EUR per 1k input tokens */
  inputPricePer1k: number;
  /** End-user price in EUR per 1k output tokens */
  outputPricePer1k: number;
  /** Best-fit use cases shown as badges in UI */
  strengths: string[];
  /** Whether this model supports a reasoning_effort parameter */
  supportsReasoningEffort: boolean;
  /** Context window in tokens for display */
  contextWindow: number;
  /** Whether the model is enabled by default (Claude requires ANTHROPIC_API_KEY) */
  requiresExternalKey?: boolean;
}

export const PROVIDER_LABELS: Record<TextProviderKey, string> = {
  openai: "OpenAI",
  google: "Google",
  anthropic: "Anthropic",
};

export const TIER_LABELS: Record<TextTier, string> = {
  fast: tx({ de: 'Schnell', en: 'Fast', es: 'Rápido' }),
  balanced: tx({ de: 'Ausgewogen', en: 'Balanced', es: 'Equilibrado' }),
  max: tx({ de: 'Maximum', en: 'Maximum', es: 'Máximo' }),
};

export const TIER_DESCRIPTIONS: Record<TextTier, string> = {
  fast: tx({ de: "Sekundenschnell, günstig – ideal für kurze Texte und viele Varianten", en: "Lightning fast, affordable – ideal for short texts and many variations", es: "Rapidísimo, económico – ideal para textos cortos y muchas variaciones" }),
  balanced: tx({ de: "Bestes Verhältnis aus Qualität, Tempo und Preis", en: "Best balance of quality, speed, and price", es: "Mejor relación calidad, velocidad y precio" }),
  max: tx({ de: "Höchste Qualität für komplexe Analysen und lange Texte", en: "Highest quality for complex analyses and long texts", es: "Máxima calidad para análisis complejos y textos largos" }),
};

export const TEXT_MODELS: Record<TextModelId, TextModel> = {
  // ---------- OpenAI ----------
  "openai-gpt-5-6-luna": {
    id: "openai-gpt-5-6-luna",
    label: "GPT-5.6 Luna",
    provider: "lovable-gateway",
    providerKey: "openai",
    tier: "fast",
    apiModel: "openai/gpt-5.6-luna",
    description: tx({ de: "Schnell & günstig für kurze Texte, Varianten und Umschreibungen", en: "Fast & affordable for short texts, variations, and rephrasing", es: "Rápido y económico para textos cortos, variaciones y reformulaciones" }),
    inputPricePer1k: 0.0004,
    outputPricePer1k: 0.0026,
    strengths: [tx({ de: "Schnell", en: "Fast", es: "Rápido" }), tx({ de: "Günstig", en: "Affordable", es: "Asequible" }), tx({ de: "Varianten", en: "Variations", es: "Variaciones" })],
    supportsReasoningEffort: true,
    contextWindow: 400_000,
  },
  "openai-gpt-5-6-terra": {
    id: "openai-gpt-5-6-terra",
    label: "GPT-5.6 Terra",
    provider: "lovable-gateway",
    providerKey: "openai",
    tier: "balanced",
    apiModel: "openai/gpt-5.6-terra",
    description: tx({ de: "Alltags-Arbeitspferd: starke Qualität zu moderatem Preis", en: "Everyday Workhorse: strong quality at a moderate price", es: "Caballo de batalla diario: gran calidad a un precio moderado" }),
    inputPricePer1k: 0.0021,
    outputPricePer1k: 0.0169,
    strengths: ["Ausgewogen", "Marketing", "Struktur"],
    supportsReasoningEffort: true,
    contextWindow: 400_000,
  },
  "openai-gpt-5-6-sol": {
    id: "openai-gpt-5-6-sol",
    label: "GPT-5.6 Sol",
    provider: "lovable-gateway",
    providerKey: "openai",
    tier: "max",
    apiModel: "openai/gpt-5.6-sol",
    description: tx({ de: "Flaggschiff für die härtesten Reasoning- und Strategieaufgaben", en: "Flagship for the toughest reasoning and strategy tasks", es: "Modelo insignia para las tareas de razonamiento y estrategia más difíciles" }),
    inputPricePer1k: 0.0195,
    outputPricePer1k: 0.0975,
    strengths: ["Reasoning", "Strategie", "Premium"],
    supportsReasoningEffort: true,
    contextWindow: 400_000,
  },

  // ---------- Google ----------
  "google-gemini-3-1-flash-lite": {
    id: "google-gemini-3-1-flash-lite",
    label: "Gemini 3.1 Flash Lite",
    provider: "lovable-gateway",
    providerKey: "google",
    tier: "fast",
    apiModel: "google/gemini-3.1-flash-lite",
    description: tx({ de: "Günstigstes Modell – perfekt für Massen-Text und Zusammenfassungen", en: "Most affordable model – perfect for bulk text and summaries", es: "El modelo más económico – perfecto para textos masivos y resúmenes" }),
    inputPricePer1k: 0.00013,
    outputPricePer1k: 0.0005,
    strengths: [tx({ de: "Sehr günstig", en: "Very affordable", es: "Muy asequible" }), tx({ de: "Schnell", en: "Fast", es: "Rápido" }), tx({ de: "Zusammenfassen", en: "Summarizing", es: "Resumir" })],
    supportsReasoningEffort: false,
    contextWindow: 1_000_000,
  },
  "google-gemini-3-6-flash": {
    id: "google-gemini-3-6-flash",
    label: "Gemini 3.6 Flash",
    provider: "lovable-gateway",
    providerKey: "google",
    tier: "balanced",
    apiModel: "google/gemini-3.6-flash",
    description: tx({ de: "Schnelles Allround-Modell mit 1M Kontext", en: "Fast all-round model with 1M context", es: "Modelo rápido y completo con contexto 1M" }),
    inputPricePer1k: 0.0005,
    outputPricePer1k: 0.0033,
    strengths: [tx({ de: "Allround", en: "All-round", es: "Multiuso" }), "1M Context", tx({ de: "Schnell", en: "Fast", es: "Rápido" })],
    supportsReasoningEffort: false,
    contextWindow: 1_000_000,
  },
  "google-gemini-3-1-pro": {
    id: "google-gemini-3-1-pro",
    label: "Gemini 3.1 Pro",
    provider: "lovable-gateway",
    providerKey: "google",
    tier: "max",
    apiModel: "google/gemini-3.1-pro-preview",
    description: tx({ de: "Multimodal Powerhouse · 1M Context · günstigstes Pro-Modell", en: "Multimodal Powerhouse · 1M Context · most affordable Pro model", es: "Potencia Multimodal · 1M Contexto · modelo Pro más asequible" }),
    inputPricePer1k: 0.0016,
    outputPricePer1k: 0.013,
    strengths: ["Multimodal", "1M Context", tx({ de: "Analyse", en: "Analysis", es: "Análisis" })],
    supportsReasoningEffort: false,
    contextWindow: 1_000_000,
  },

  // ---------- Anthropic ----------
  "anthropic-claude-4-1-opus": {
    id: "anthropic-claude-4-1-opus",
    label: "Claude 4.1 Opus",
    provider: "anthropic",
    providerKey: "anthropic",
    tier: "max",
    apiModel: "claude-opus-4-1",
    description: "Best-in-Class Schreiben · lange Texte · nuancierte Analyse",
    inputPricePer1k: 0.0195,
    outputPricePer1k: 0.0975,
    strengths: ["Schreiben", "Lange Texte", "Premium"],
    supportsReasoningEffort: false,
    contextWindow: 200_000,
    requiresExternalKey: true,
  },
};

export const TEXT_MODEL_LIST = Object.values(TEXT_MODELS);

export const PROVIDER_ORDER: TextProviderKey[] = ["openai", "google", "anthropic"];
export const TIER_ORDER: TextTier[] = ["fast", "balanced", "max"];

export function modelsByProvider(providerKey: TextProviderKey): TextModel[] {
  return TEXT_MODEL_LIST.filter((m) => m.providerKey === providerKey).sort(
    (a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier),
  );
}

export function findModel(providerKey: TextProviderKey, tier: TextTier): TextModel | undefined {
  return TEXT_MODEL_LIST.find((m) => m.providerKey === providerKey && m.tier === tier);
}

export const DEFAULT_TEXT_MODEL: TextModelId = "google-gemini-3-6-flash";

/** Legacy IDs from the previous registry -> current equivalents */
export const LEGACY_MODEL_ALIASES: Record<string, TextModelId> = {
  "openai-gpt-5-5-pro": "openai-gpt-5-6-sol",
  "google-gemini-3-1-pro": "google-gemini-3-1-pro",
};

export function resolveModelId(id: string | null | undefined): TextModelId {
  if (!id) return DEFAULT_TEXT_MODEL;
  if ((TEXT_MODELS as Record<string, TextModel>)[id]) return id as TextModelId;
  return LEGACY_MODEL_ALIASES[id] ?? DEFAULT_TEXT_MODEL;
}

export type ReasoningEffort = "none" | "low" | "medium" | "high";
export const REASONING_EFFORT_OPTIONS: ReasoningEffort[] = ["none", "low", "medium", "high"];
export const REASONING_EFFORT_LABELS: Record<ReasoningEffort, string> = {
  none: tx({ de: 'Aus', en: 'Off', es: 'Desactivado' }),
  low: tx({ de: 'Leicht', en: 'Low', es: 'Bajo' }),
  medium: tx({ de: 'Mittel', en: 'Medium', es: 'Medio' }),
  high: tx({ de: 'Tief', en: 'High', es: 'Alto' }),
};

export type ResponseLength = "short" | "normal" | "long";
export const RESPONSE_LENGTH_LABELS: Record<ResponseLength, string> = {
  short: tx({ de: 'Kurz', en: 'Short', es: 'Corto' }),
  normal: tx({ de: 'Normal', en: 'Normal', es: 'Normal' }),
  long: tx({ de: 'Ausführlich', en: 'Long', es: 'Extenso' }),
};
export const RESPONSE_LENGTH_TOKENS: Record<ResponseLength, number> = {
  short: 600,
  normal: 1800,
  long: 4096,
};

export type CreativityLevel = "precise" | "balanced" | "creative";
export const CREATIVITY_LABELS: Record<CreativityLevel, string> = {
  precise: tx({ de: 'Präzise', en: 'Precise', es: 'Preciso' }),
  balanced: tx({ de: 'Ausgewogen', en: 'Balanced', es: 'Equilibrado' }),
  creative: tx({ de: 'Kreativ', en: 'Creative', es: 'Creativo' }),
};
export const CREATIVITY_TEMPERATURE: Record<CreativityLevel, number> = {
  precise: 0.2,
  balanced: 0.7,
  creative: 1.1,
};
