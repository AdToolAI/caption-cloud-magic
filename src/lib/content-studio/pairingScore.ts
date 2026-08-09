import { tx } from "@/lib/i18nText";
/**
 * Heuristische Bewertung, wie gut Motiv und Text zusammenpassen.
 * Läuft komplett lokal — keine zusätzlichen Kosten, kein KI-Call.
 */

const STOPWORDS = new Set([
  "und", "oder", "der", "die", "das", "ein", "eine", "mit", "für", "von", "den", "dem",
  "the", "and", "for", "with", "a", "an", "of", "to", "in", "on", "your", "our",
  "los", "las", "para", "con", "una", "uno",
]);

function tokens(value: string): string[] {
  return (value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

export interface PairingVerdict {
  /** 0–100 */
  score: number;
  label: string;
  hint: string;
  tone: "good" | "ok" | "weak";
}

/**
 * Vergleicht den Bild-Prompt (bzw. das Briefing) mit der gewählten Copy.
 * Ein hoher Wert heißt: das Motiv erzählt dieselbe Geschichte wie der Text.
 */
export function scorePairing(input: {
  imagePrompt?: string | null;
  brief?: string | null;
  headline?: string | null;
  subline?: string | null;
  caption?: string | null;
  hasImage: boolean;
}): PairingVerdict {
  if (!input.hasImage) {
    return {
      score: 0,
      label: "Kein Motiv",
      hint: "Reine Typografie — das Layout trägt die Aussage allein.",
      tone: "ok",
    };
  }

  const motif = new Set(tokens(`${input.imagePrompt ?? ""} ${input.brief ?? ""}`));
  const text = tokens(`${input.headline ?? ""} ${input.subline ?? ""} ${input.caption ?? ""}`);
  if (!motif.size || !text.length) {
    return {
      score: 55,
      label: "Nicht bewertbar",
      hint: tx({ de: "Zu wenig Text für eine Einschätzung.", en: "Too little text for an assessment.", es: "Muy poco texto para una evaluación." }),
      tone: "ok",
    };
  }

  const hits = text.filter((w) => motif.has(w)).length;
  const overlap = hits / Math.min(text.length, 14);
  const score = Math.max(28, Math.min(98, Math.round(45 + overlap * 70)));

  if (score >= 75) {
    return {
      score,
      label: "Starke Paarung",
      hint: tx({ de: "Motiv und Text erzählen dieselbe Geschichte.", en: "The motif and text tell the same story.", es: "El motivo y el texto cuentan la misma historia." }),
      tone: "good",
    };
  }
  if (score >= 55) {
    return {
      score,
      label: "Solide Paarung",
      hint: "Passt. Ein konkreteres Motiv würde die Aussage schärfen.",
      tone: "ok",
    };
  }
  return {
    score,
    label: "Schwache Paarung",
    hint: tx({ de: "Motiv und Text laufen auseinander — Motiv neu denken oder Copy schärfen.", en: "Visual and text diverge — rethink visual or sharpen copy.", es: "El visual y el texto divergen — replantea el visual o afina el copy." }),
    tone: "weak",
  };
}
