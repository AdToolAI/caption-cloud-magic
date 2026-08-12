/**
 * estimateSpokenSeconds — rough client-side estimate of how long a dialog
 * script will take once the voiceover engine has rendered it.
 *
 * Purpose is preflight honesty, not precision: `compose-twoshot-audio` fails
 * hard with `dialog_too_long_for_plate` when the spoken track exceeds the
 * plate duration by more than 5 s. That failure used to surface only after
 * the run had already started. This estimate lets the UI warn beforehand.
 *
 * Model: ~2.6 spoken words per second plus a short breath between lines.
 */
const WORDS_PER_SECOND = 2.6;
const PAUSE_PER_LINE_SEC = 0.35;

export function estimateSpokenSeconds(script: string | null | undefined): number {
  const raw = (script ?? '').trim();
  if (!raw) return 0;

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let words = 0;
  let spokenLines = 0;
  for (const line of lines) {
    // Drop a leading "Name:" / "@mention:" speaker label — it is never spoken.
    const text = line.replace(/^\s*@?[^:]{1,48}:\s*/, '');
    const count = (text.match(/\S+/g) ?? []).length;
    if (count === 0) continue;
    words += count;
    spokenLines += 1;
  }
  if (words === 0) return 0;

  const seconds = words / WORDS_PER_SECOND + Math.max(0, spokenLines - 1) * PAUSE_PER_LINE_SEC;
  return Math.round(seconds * 10) / 10;
}

/** Server grace before `compose-twoshot-audio` extends instead of failing. */
export const DIALOG_OVERFLOW_GRACE_SEC = 0.3;
/** Server ceiling for auto-extending the plate; beyond this the run fails. */
export const DIALOG_MAX_EXTEND_SEC = 5.0;

/**
 * True when the estimated speech is so far beyond the plate that the server
 * would abort with `dialog_too_long_for_plate` instead of auto-extending.
 */
export function dialogExceedsPlate(
  spokenSec: number,
  sceneDurationSec: number,
  providerMaxSec: number,
): boolean {
  if (spokenSec <= 0) return false;
  const extendable = Math.min(
    providerMaxSec,
    sceneDurationSec + DIALOG_MAX_EXTEND_SEC,
  );
  return spokenSec > extendable + DIALOG_OVERFLOW_GRACE_SEC;
}
