import { TEXT_MODELS, type TextModelId } from "./models";

/** Roughly estimate token count for a string (1 token ≈ 4 chars for English/German). */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateCost(
  modelId: TextModelId,
  inputTokens: number,
  estimatedOutputTokens: number = 500,
): number {
  const m = TEXT_MODELS[modelId];
  if (!m) return 0;
  const inCost = (inputTokens / 1000) * m.inputPricePer1k;
  const outCost = (estimatedOutputTokens / 1000) * m.outputPricePer1k;
  return Number((inCost + outCost).toFixed(4));
}

export function actualCost(
  modelId: TextModelId,
  inputTokens: number,
  outputTokens: number,
): number {
  return estimateCost(modelId, inputTokens, outputTokens);
}

export function formatEUR(amount: number): string {
  if (amount < 0.01) return `< €0.01`;
  return `€${amount.toFixed(2)}`;
}
