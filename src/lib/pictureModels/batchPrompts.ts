/**
 * Robust batch prompt parsing.
 *
 * The old counter split strictly on "\n", so pasted lists using CRLF,
 * bullets, numbering ("1. …"), or semicolons showed "0 prompts detected"
 * even though text was present.
 */
export function parseBatchPrompts(raw: string): string[] {
  if (!raw || !raw.trim()) return [];

  const normalized = raw.replace(/\r\n?/g, '\n');

  let parts = normalized
    .split('\n')
    .map((p) => cleanPrompt(p))
    .filter(Boolean);

  // Single pasted line that clearly contains a numbered or bulleted list.
  if (parts.length <= 1) {
    const single = parts[0] ?? cleanPrompt(normalized);
    const numbered = single.split(/(?:^|\s)(?:\d{1,2}[.)]\s+|[•\-–]\s+)/g);
    const cleanedNumbered = numbered.map(cleanPrompt).filter(Boolean);
    if (cleanedNumbered.length > 1) return cleanedNumbered;

    const semis = single.split(';').map(cleanPrompt).filter(Boolean);
    if (semis.length > 1) return semis;

    return single ? [single] : [];
  }

  return parts;
}

function cleanPrompt(value: string): string {
  return value
    .trim()
    .replace(/^\s*(?:\d{1,2}[.)]|[•\-–*])\s+/, '')
    .trim();
}

export const BATCH_PROMPT_LIMIT = 20;
