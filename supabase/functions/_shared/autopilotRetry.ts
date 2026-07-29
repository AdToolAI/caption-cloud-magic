/**
 * Autopilot v297 — Wiederholung statt Loch im Film.
 *
 * Ein zweiter Anlauf, der exakt dasselbe versucht, ist Geldverschwendung. Die
 * Helfer hier reparieren den Prompt zwischen den Anläufen entlang der Gründe,
 * an denen die Strecke real scheitert: zu viele Personen im Bild, zu wilde
 * Bewegung, oder ein Gesicht, das für den Lip-Sync zu klein im Rahmen sitzt.
 */

/** Zwei Anläufe pro Szene — mehr lohnt sich nicht, es kostet nur Zeit. */
export const MAX_SCENE_ATTEMPTS = 2;

const CROWD = /\b(crowd|crowds|audience|stadium|hundreds of|masses of people|bustling throng)\b/gi;
const RISKY = /\b(explosion|stunt|parkour|fireworks|car crash|acrobat|leaping off|somersault)\b/gi;

/**
 * Anker-Reparatur: weniger gleichzeitige Personen, ruhigere Bewegung, klare
 * Bildmitte. Bewusst konservativ — das Bild soll durchkommen, nicht glänzen.
 */
export function repairAnchorPrompt(prompt: string): string {
  let out = prompt
    .replace(CROWD, "a few people in the background")
    .replace(RISKY, "a controlled, grounded movement");

  out = out.replace(/\s+/g, " ").trim();

  return [
    out,
    "Simplified staging: at most two people clearly visible, unobstructed faces, centred composition, even lighting, shallow background.",
  ].join(" ");
}

/**
 * Motion-Reparatur: Gesicht groß und stabil im Rahmen. Das ist genau die
 * Geometrie, die das Face-Gate der Lip-Sync-Strecke verlangt.
 */
export function repairMotionPrompt(prompt: string, opts?: { faceFocus?: boolean }): string {
  const base = prompt.replace(RISKY, "a controlled, grounded movement").replace(/\s+/g, " ").trim();
  const suffix = opts?.faceFocus
    ? "Framing: medium close-up, the speaking face fills a large, stable part of the frame, camera nearly static, no occlusion of the mouth."
    : "Camera: slow and steady, minimal motion, subject stays centred and fully visible.";
  return `${base} ${suffix}`;
}

/** Fehlerklassen, bei denen ein zweiter Motion-Versuch mit Gesichtsfokus hilft. */
const FRAMING_FAILURE = /(face_validation_failed|no_face|bbox_geometry_insane|min_face_size|face_too_small|precheck_face_mismatch)/i;

export function isFramingFailure(reason?: string | null): boolean {
  return !!reason && FRAMING_FAILURE.test(reason);
}

/** Vorübergehende Provider-Aussetzer — die verdienen immer einen zweiten Anlauf. */
const TRANSIENT = /(timeout|timed out|429|rate.?limit|502|503|504|ECONNRESET|network|fetch failed|temporarily)/i;

export function isTransient(reason?: string | null): boolean {
  return !!reason && TRANSIENT.test(reason);
}

/** Kennzeichen für eine Szene, die als Standbild gerettet wurde. */
export const FALLBACK_STILL = "still";
