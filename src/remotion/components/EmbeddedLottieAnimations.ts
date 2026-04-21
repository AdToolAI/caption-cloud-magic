/**
 * 🚫 LOTTIE DEPRECATED — STUB FILE
 */

import type { LottieAnimationData } from '../utils/premiumLottieLoader';

export interface MouthFrameConfig {
  frame: number;
  width: number;
  height: number;
  roundness: number;
  teethVisible: boolean;
  tongueVisible: boolean;
}

export const VISEME_FRAME_MAP: Record<string, MouthFrameConfig> = {
  neutral: { frame: 0, width: 20, height: 4, roundness: 0, teethVisible: false, tongueVisible: false },
  wide: { frame: 1, width: 36, height: 22, roundness: 0.1, teethVisible: true, tongueVisible: false },
  medium: { frame: 2, width: 28, height: 16, roundness: 0.2, teethVisible: true, tongueVisible: false },
  round: { frame: 3, width: 20, height: 20, roundness: 0.9, teethVisible: false, tongueVisible: false },
  small_round: { frame: 4, width: 14, height: 14, roundness: 0.95, teethVisible: false, tongueVisible: false },
  closed: { frame: 5, width: 26, height: 2, roundness: 0, teethVisible: false, tongueVisible: false },
};

const NULL_ANIM: LottieAnimationData = {};

export const createEmbeddedIdleAnimation = (_color?: string, _skin?: string): LottieAnimationData => NULL_ANIM;
export const createEmbeddedWavingAnimation = (_color?: string, _skin?: string): LottieAnimationData => NULL_ANIM;
export const createEmbeddedThinkingAnimation = (_color?: string, _skin?: string): LottieAnimationData => NULL_ANIM;
export const createEmbeddedCelebratingAnimation = (_color?: string, _skin?: string): LottieAnimationData => NULL_ANIM;
export const createEmbeddedPointingAnimation = (_color?: string, _skin?: string): LottieAnimationData => NULL_ANIM;
export const createEmbeddedExplainingAnimation = (_color?: string, _skin?: string): LottieAnimationData => NULL_ANIM;
export const createEmbeddedMouthShapesAnimation = (_color?: string, _skin?: string): LottieAnimationData => NULL_ANIM;
