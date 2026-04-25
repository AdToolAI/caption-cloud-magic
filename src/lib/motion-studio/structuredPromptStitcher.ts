// Block K — Structured Prompt Slot Stitcher
//
// Local, deterministic conversion between a free-text prompt and the
// 6-slot structured representation used by `StructuredPromptBuilder`.
//
// The KI-powered extractor (Free → Structured for messy inputs) lives in the
// edge function `structured-prompt-compose`. This file handles only the
// loss-less paths so toggling between modes never requires a network call
// when the user just wrote/edited their slots themselves.

export interface PromptSlots {
  subject?: string;
  action?: string;
  setting?: string;
  timeWeather?: string;
  style?: string;
  negative?: string;
}

export const EMPTY_SLOTS: PromptSlots = {};

export const SLOT_KEYS: Array<keyof PromptSlots> = [
  'subject',
  'action',
  'setting',
  'timeWeather',
  'style',
  'negative',
];

export interface SlotMeta {
  key: keyof PromptSlots;
  /** UI label per language. */
  label: { de: string; en: string; es: string };
  /** Placeholder example per language. */
  placeholder: { de: string; en: string; es: string };
  icon: string;
  /** Token used in the stitched output (English, model-friendly). */
  prefix: string;
  /** Multiline textarea? */
  multiline?: boolean;
}

export const SLOT_META: Record<keyof PromptSlots, SlotMeta> = {
  subject: {
    key: 'subject',
    icon: '🎭',
    label: { de: 'Subjekt', en: 'Subject', es: 'Sujeto' },
    placeholder: {
      de: 'Eine junge Barista mit roten Haaren',
      en: 'A young barista with red hair',
      es: 'Una joven barista con cabello rojo',
    },
    prefix: '',
  },
  action: {
    key: 'action',
    icon: '🎬',
    label: { de: 'Handlung', en: 'Action', es: 'Acción' },
    placeholder: {
      de: 'gießt langsam Milch in Latte-Art-Muster',
      en: 'slowly pours milk into a latte-art pattern',
      es: 'vierte leche lentamente en un patrón de latte art',
    },
    prefix: '',
  },
  setting: {
    key: 'setting',
    icon: '🏛️',
    label: { de: 'Setting', en: 'Setting', es: 'Escenario' },
    placeholder: {
      de: 'rustikales Café im Berliner Altbau',
      en: 'rustic café in a Berlin Altbau',
      es: 'café rústico en un edificio antiguo de Berlín',
    },
    prefix: 'in a ',
  },
  timeWeather: {
    key: 'timeWeather',
    icon: '🌅',
    label: { de: 'Zeit / Wetter', en: 'Time / Weather', es: 'Hora / Clima' },
    placeholder: {
      de: 'kurz vor Sonnenuntergang, weiches goldenes Licht',
      en: 'just before sunset, soft golden light',
      es: 'justo antes del atardecer, luz dorada suave',
    },
    prefix: '',
  },
  style: {
    key: 'style',
    icon: '🎨',
    label: { de: 'Stil / Ästhetik', en: 'Style / Aesthetic', es: 'Estilo / Estética' },
    placeholder: {
      de: 'Wes Anderson, symmetrisch, pastellfarben',
      en: 'Wes Anderson, symmetrical, pastel palette',
      es: 'Wes Anderson, simétrico, paleta pastel',
    },
    prefix: 'shot in the style of ',
    multiline: true,
  },
  negative: {
    key: 'negative',
    icon: '🚫',
    label: { de: 'Ausschluss', en: 'Negative', es: 'Negativo' },
    placeholder: {
      de: 'keine Menschen im Hintergrund, kein Text, kein Logo',
      en: 'no people in background, no text, no logos',
      es: 'sin personas al fondo, sin texto, sin logos',
    },
    prefix: 'avoid: ',
    multiline: true,
  },
};

/** Returns true if at least one slot has non-empty content. */
export function hasAnySlot(slots: PromptSlots | undefined): boolean {
  if (!slots) return false;
  return SLOT_KEYS.some((k) => (slots[k] ?? '').trim().length > 0);
}

/**
 * Stitch slots into a free-text prompt deterministically (no AI).
 *
 * Default order: Subject → Action → Setting → Time/Weather → Style → Negative.
 * An optional `order` overrides the order of all slots EXCEPT `negative`,
 * which is always emitted last (some video models only respect the negative
 * tag when it sits at the very end).
 *
 * Used when the user toggles Structured → Free, and as the *fallback*
 * client-side preview before the edge function returns its enriched version.
 */
export function stitchSlots(
  slots: PromptSlots | undefined,
  order?: Array<keyof PromptSlots>
): string {
  if (!slots) return '';

  // Build ordered key list: custom order (minus negative) + any missing
  // reorderable keys + negative pinned at end.
  const reorderable: Array<keyof PromptSlots> = ['subject', 'action', 'setting', 'timeWeather', 'style'];
  const ordered: Array<keyof PromptSlots> = [];
  if (order && order.length > 0) {
    for (const k of order) {
      if (k !== 'negative' && reorderable.includes(k) && !ordered.includes(k)) {
        ordered.push(k);
      }
    }
  }
  for (const k of reorderable) {
    if (!ordered.includes(k)) ordered.push(k);
  }

  const parts: string[] = [];

  // Subject + Action are merged when adjacent (preserves natural English).
  for (let i = 0; i < ordered.length; i++) {
    const key = ordered[i];
    const value = slots[key]?.trim();
    if (!value) continue;

    // Special case: subject + action adjacent → join without comma.
    if (
      key === 'subject' &&
      ordered[i + 1] === 'action' &&
      slots.action?.trim()
    ) {
      parts.push(`${value} ${slots.action.trim()}`);
      i++; // skip next iteration (action consumed)
      continue;
    }

    if (key === 'setting') {
      const needsPrefix = !/^(in|at|inside|outside|on)\b/i.test(value);
      parts.push(needsPrefix ? `in ${value}` : value);
    } else if (key === 'style') {
      const needsPrefix = !/^(shot|filmed|in the style|cinematic|like)\b/i.test(value);
      parts.push(needsPrefix ? `shot in the style of ${value}` : value);
    } else {
      parts.push(value);
    }
  }

  const base = parts.join(', ');
  const negative = slots.negative?.trim();
  if (!negative) return base;

  // Negative is appended on its own line so models that respect it
  // (Sora, Wan, Hailuo) can detect it; others ignore it harmlessly.
  return `${base}\nNegative: ${negative}`;
}

/**
 * Heuristic Free → Structured fallback for inputs the user has *not* yet
 * promoted via the AI extractor. Splits on sentence boundaries and dumps
 * everything into `subject` so no information is lost.
 */
export function naiveSplitToSlots(text: string): PromptSlots {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return {};
  return { subject: trimmed };
}
