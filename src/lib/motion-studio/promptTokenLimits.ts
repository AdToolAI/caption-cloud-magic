// Block K-3 — Per-Engine Prompt Limits
//
// Each AI video model accepts very different prompt lengths and reacts
// differently to over-long inputs. These limits are derived from production
// tests (truncation point at which the model starts ignoring the tail).
//
// Usage:
//   const status = evaluatePromptLength(text, 'ai-sora');
//   // -> { count, unit, level: 'ok' | 'warn' | 'over' }

export type PromptModelKey =
  | 'ai-sora'
  | 'ai-kling'
  | 'ai-hailuo'
  | 'ai-wan'
  | 'ai-seedance'
  | 'ai-luma';

export interface PromptLimit {
  /** Soft limit — green zone, model performs best below this. */
  soft: number;
  /** Hard limit — model starts dropping content beyond this. */
  hard: number;
  /** Counting unit shown in the UI. */
  unit: 'words' | 'chars';
  /** Friendly model label for the UI. */
  label: string;
}

export const MODEL_PROMPT_LIMITS: Record<PromptModelKey, PromptLimit> = {
  'ai-sora':     { soft: 400,  hard: 800,  unit: 'words', label: 'Sora 2' },
  'ai-kling':    { soft: 500,  hard: 2000, unit: 'chars', label: 'Kling 3.0' },
  'ai-hailuo':   { soft: 800,  hard: 1500, unit: 'chars', label: 'Hailuo 2.3' },
  'ai-wan':      { soft: 300,  hard: 600,  unit: 'words', label: 'Wan 2.5' },
  'ai-seedance': { soft: 400,  hard: 800,  unit: 'words', label: 'Seedance 1' },
  'ai-luma':     { soft: 500,  hard: 1200, unit: 'chars', label: 'Luma Ray 2' },
};

export type PromptStatusLevel = 'ok' | 'warn' | 'over';

export interface PromptStatus {
  count: number;
  unit: 'words' | 'chars';
  soft: number;
  hard: number;
  level: PromptStatusLevel;
  /** Percentage filled relative to hard limit (clamped 0–100 for UI bars). */
  percent: number;
}

const WORD_REGEX = /\S+/g;

export function countTokens(text: string, unit: 'words' | 'chars'): number {
  if (!text) return 0;
  if (unit === 'chars') return text.length;
  return text.match(WORD_REGEX)?.length ?? 0;
}

export function evaluatePromptLength(
  text: string,
  model: PromptModelKey
): PromptStatus {
  const limit = MODEL_PROMPT_LIMITS[model];
  const count = countTokens(text, limit.unit);
  let level: PromptStatusLevel = 'ok';
  if (count >= limit.hard) level = 'over';
  else if (count > limit.soft) level = 'warn';
  return {
    count,
    unit: limit.unit,
    soft: limit.soft,
    hard: limit.hard,
    level,
    percent: Math.min(100, Math.round((count / limit.hard) * 100)),
  };
}

/**
 * Map a `ClipSource` (`ai-sora`, `ai-kling`, ...) to a `PromptModelKey`.
 * Returns null for non-AI sources (`upload`, `stock`, …).
 */
export function clipSourceToModelKey(source: string): PromptModelKey | null {
  if (!source.startsWith('ai-')) return null;
  if (source in MODEL_PROMPT_LIMITS) return source as PromptModelKey;
  // Fallback: unknown ai-* model → treat as Sora (most permissive default).
  return 'ai-sora';
}
