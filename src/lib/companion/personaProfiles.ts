/**
 * Companion learning-pace profiles.
 *
 * Steers popup frequency, tone, and system-prompt hints for the AI companion
 * when it acts as the onboarding concierge. Kept small and declarative — the
 * runtime (useCompanionCoach) reads these values, never hard-codes them.
 */

export type LearningPace = 'espresso' | 'balanced' | 'guided' | 'playful';

export interface PersonaProfile {
  id: LearningPace;
  labelDe: string;
  labelEn: string;
  descriptionDe: string;
  descriptionEn: string;
  /** Max proactive popups per calendar day. */
  dailyPopupCap: number;
  /** Cooldown (seconds) between two popups within a session. */
  minGapSeconds: number;
  /** Tonalitäts-Hint that gets injected into the companion system prompt. */
  toneHint: string;
  /** UI accent used in the concierge dialog. */
  accent: 'gold' | 'cyan' | 'amber' | 'violet';
}

export const PERSONA_PROFILES: Record<LearningPace, PersonaProfile> = {
  espresso: {
    id: 'espresso',
    labelDe: 'Espresso',
    labelEn: 'Espresso',
    descriptionDe: 'Nur das Nötigste. Ein Tipp pro Session, keine Umwege.',
    descriptionEn: 'Only what matters. One tip per session, no detours.',
    dailyPopupCap: 1,
    minGapSeconds: 60 * 60 * 4,
    toneHint:
      'Speak with precision. Skip pleasantries. One clear sentence, then stop. Never use emoji.',
    accent: 'cyan',
  },
  balanced: {
    id: 'balanced',
    labelDe: 'Balanced',
    labelEn: 'Balanced',
    descriptionDe: 'Freundlich, kurz, hilft bei Meilensteinen. Empfohlener Standard.',
    descriptionEn: 'Friendly, concise, appears at milestones. Recommended default.',
    dailyPopupCap: 3,
    minGapSeconds: 60 * 25,
    toneHint:
      'Warm and concise. Two short sentences max. Emoji only when it genuinely helps clarity.',
    accent: 'gold',
  },
  guided: {
    id: 'guided',
    labelDe: 'Guided Tour',
    labelEn: 'Guided Tour',
    descriptionDe: 'Schritt für Schritt durch jedes Studio. Für Einsteiger.',
    descriptionEn: 'Step-by-step across every studio. For newcomers.',
    dailyPopupCap: 6,
    minGapSeconds: 60 * 5,
    toneHint:
      'Encouraging teacher voice. Explain WHY before HOW. Offer one next action at the end.',
    accent: 'amber',
  },
  playful: {
    id: 'playful',
    labelDe: 'Playful',
    labelEn: 'Playful',
    descriptionDe: 'Balanced + dezente Micro-Achievements. Nie albern.',
    descriptionEn: 'Balanced + subtle micro-achievements. Never silly.',
    dailyPopupCap: 4,
    minGapSeconds: 60 * 20,
    toneHint:
      'Lightly playful, still professional. One tasteful emoji allowed. Celebrate small wins in one line.',
    accent: 'violet',
  },
};

export const DEFAULT_LEARNING_PACE: LearningPace = 'balanced';

export function getPersona(pace: LearningPace | undefined | null): PersonaProfile {
  if (pace && PERSONA_PROFILES[pace]) return PERSONA_PROFILES[pace];
  return PERSONA_PROFILES[DEFAULT_LEARNING_PACE];
}
