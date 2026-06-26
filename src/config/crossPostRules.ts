// Per-channel constraints & style guidance for Cross-Post Magic.
// Single source of truth shared between edge function + UI counters.

export type CrossPostChannel = "instagram" | "tiktok" | "linkedin" | "youtube";

export type CrossPostTone =
  | "default"
  | "hype"
  | "educational"
  | "story"
  | "bold"
  | "premium";

export const TONE_LABELS: Record<CrossPostTone, string> = {
  default: "Default",
  hype: "Hype",
  educational: "Educational",
  story: "Story",
  bold: "Bold",
  premium: "Premium",
};

export interface ChannelRule {
  channel: CrossPostChannel;
  captionMax: number;
  captionMin?: number;
  hashtagMin: number;
  hashtagMax: number;
  needsTitle?: boolean;
  needsDescription?: boolean;
  titleMax?: number;
  descriptionMax?: number;
  style: string; // short prompt-snippet for the AI
}

export const CROSS_POST_RULES: Record<CrossPostChannel, ChannelRule> = {
  instagram: {
    channel: "instagram",
    captionMax: 2200,
    captionMin: 80,
    hashtagMin: 8,
    hashtagMax: 15,
    style:
      "Hook in line 1 (≤8 words, emoji allowed). Story 1–2 paragraphs. End with soft CTA + question. Use line breaks. Emojis welcome but never spammy.",
  },
  tiktok: {
    channel: "tiktok",
    captionMax: 150,
    hashtagMin: 3,
    hashtagMax: 5,
    style:
      "Brutally short. One sharp hook sentence. Casual, conversational, lowercase ok. Use trending/niche hashtags. No corporate tone.",
  },
  linkedin: {
    channel: "linkedin",
    captionMax: 800,
    captionMin: 200,
    hashtagMin: 3,
    hashtagMax: 5,
    style:
      "Professional first-person. Lead with a single business insight or contrarian take. 1 short paragraph + 3-5 bullet learnings + CTA question. No emoji-flood (max 1–2). Hashtags must be industry-specific.",
  },
  youtube: {
    channel: "youtube",
    captionMax: 400,
    hashtagMin: 5,
    hashtagMax: 12,
    needsTitle: true,
    needsDescription: true,
    titleMax: 70,
    descriptionMax: 400,
    style:
      "Title: SEO-keywords up front, ≤70 chars, intriguing not clickbait. Description: 1-line hook + 2-3 line context + CTA to subscribe. Tags instead of #hashtags (still provide hashtags array, will be used as tags).",
  },
};

export const CHANNEL_ORDER: CrossPostChannel[] = [
  "instagram",
  "tiktok",
  "linkedin",
  "youtube",
];
