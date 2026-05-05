// AI Text Studio - Model Registry
// Pricing in EUR per 1M tokens (with 30% margin applied)

export type TextModelId =
  | "google-gemini-3-1-pro"
  | "openai-gpt-5-5-pro"
  | "anthropic-claude-4-1-opus";

export type TextProvider = "lovable-gateway" | "anthropic";

export interface TextModel {
  id: TextModelId;
  label: string;
  provider: TextProvider;
  /** Gateway/provider-internal model identifier */
  apiModel: string;
  description: string;
  /** End-user price in EUR per 1k input tokens (provider price * 1.30) */
  inputPricePer1k: number;
  /** End-user price in EUR per 1k output tokens (provider price * 1.30) */
  outputPricePer1k: number;
  /** Best-fit use cases shown as badges in UI */
  strengths: string[];
  /** Whether this model supports a reasoning_effort parameter */
  supportsReasoningEffort: boolean;
  /** Optional context window in tokens for display */
  contextWindow: number;
  /** Whether the model is enabled by default (Claude requires ANTHROPIC_API_KEY) */
  requiresExternalKey?: boolean;
}

export const TEXT_MODELS: Record<TextModelId, TextModel> = {
  "google-gemini-3-1-pro": {
    id: "google-gemini-3-1-pro",
    label: "Gemini 3.1 Pro",
    provider: "lovable-gateway",
    apiModel: "google/gemini-3.1-pro-preview",
    description: "Multimodal Powerhouse · 1M Context · günstigstes Pro-Modell",
    inputPricePer1k: 0.0016,
    outputPricePer1k: 0.013,
    strengths: ["Multimodal", "1M Context", "Günstig"],
    supportsReasoningEffort: false,
    contextWindow: 1_000_000,
  },
  "openai-gpt-5-5-pro": {
    id: "openai-gpt-5-5-pro",
    label: "GPT-5.5 Pro",
    provider: "lovable-gateway",
    apiModel: "openai/gpt-5.5-pro",
    description: "State-of-the-Art Reasoning · komplexe Logik & Code",
    inputPricePer1k: 0.0195,
    outputPricePer1k: 0.0975,
    strengths: ["Reasoning", "Code", "Premium"],
    supportsReasoningEffort: true,
    contextWindow: 400_000,
  },
  "anthropic-claude-4-1-opus": {
    id: "anthropic-claude-4-1-opus",
    label: "Claude 4.1 Opus",
    provider: "anthropic",
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

export const DEFAULT_TEXT_MODEL: TextModelId = "google-gemini-3-1-pro";

export type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh";
export const REASONING_EFFORT_OPTIONS: ReasoningEffort[] = [
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
];
