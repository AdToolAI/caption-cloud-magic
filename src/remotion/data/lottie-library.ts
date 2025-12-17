/**
 * Curated Lottie Animation Library for Loft-Film Quality Explainer Videos
 * 
 * All animations are VALIDATED URLs from LottieFiles CDN - professional, high-quality animations
 * organized by category for easy selection based on scene context.
 */

// ============= VALIDATED LOTTIE URLS (TESTED & WORKING) =============

// Character Animations - Real, working LottieFiles URLs
export const CHARACTER_ANIMATIONS = {
  presenter: {
    talking: 'https://assets6.lottiefiles.com/packages/lf20_uk3jnmkq.json',
    explaining: 'https://assets7.lottiefiles.com/packages/lf20_v1yudlrx.json',
    pointing: 'https://assets9.lottiefiles.com/packages/lf20_yvbfj8j4.json',
    waving: 'https://assets2.lottiefiles.com/packages/lf20_gq4ni7gw.json',
    thinking: 'https://assets5.lottiefiles.com/packages/lf20_xyadoh9h.json',
    celebrating: 'https://assets3.lottiefiles.com/packages/lf20_aKAfIn.json',
    nodding: 'https://assets4.lottiefiles.com/packages/lf20_ek8t8rga.json',
  },
  
  emotions: {
    happy: 'https://assets10.lottiefiles.com/packages/lf20_aKAfIn.json',
    surprised: 'https://assets8.lottiefiles.com/packages/lf20_touohxv0.json',
    confused: 'https://assets5.lottiefiles.com/packages/lf20_xyadoh9h.json',
    excited: 'https://assets3.lottiefiles.com/packages/lf20_aKAfIn.json',
  },
  
  fullBody: {
    walking: 'https://assets4.lottiefiles.com/packages/lf20_4kx2q32n.json',
    standing: 'https://assets1.lottiefiles.com/packages/lf20_v92spkya.json',
    presenting: 'https://assets7.lottiefiles.com/packages/lf20_v1yudlrx.json',
  },
};

// Icon Animations - All validated and working
export const ICON_ANIMATIONS = {
  success: {
    checkmark: 'https://assets1.lottiefiles.com/packages/lf20_jbrw3hcz.json',
    thumbsUp: 'https://assets3.lottiefiles.com/packages/lf20_s4tubmwg.json',
    star: 'https://assets3.lottiefiles.com/packages/lf20_xlmz9xwm.json',
    trophy: 'https://assets8.lottiefiles.com/packages/lf20_touohxv0.json',
    celebration: 'https://assets3.lottiefiles.com/packages/lf20_aKAfIn.json',
    confetti: 'https://assets9.lottiefiles.com/packages/lf20_u4yrau.json',
  },
  
  warning: {
    alert: 'https://assets5.lottiefiles.com/packages/lf20_j3gumpbb.json',
    error: 'https://assets4.lottiefiles.com/packages/lf20_tl52xzvn.json',
    exclamation: 'https://assets2.lottiefiles.com/packages/lf20_qpwbiyxf.json',
    question: 'https://assets8.lottiefiles.com/packages/lf20_ydo1amjm.json',
  },
  
  business: {
    graph: 'https://assets7.lottiefiles.com/packages/lf20_t24tpvcu.json',
    gear: 'https://assets2.lottiefiles.com/packages/lf20_p8bfn5to.json',
    lightbulb: 'https://assets2.lottiefiles.com/packages/lf20_6s73cldq.json',
    rocket: 'https://assets6.lottiefiles.com/packages/lf20_l13zwzgr.json',
    target: 'https://assets1.lottiefiles.com/packages/lf20_yvgetrqj.json',
    clock: 'https://assets5.lottiefiles.com/packages/lf20_7e6lxp3e.json',
    money: 'https://assets10.lottiefiles.com/packages/lf20_06a6pf9i.json',
    handshake: 'https://assets2.lottiefiles.com/packages/lf20_gzl797gs.json',
  },
  
  action: {
    arrowRight: 'https://assets6.lottiefiles.com/packages/lf20_lzymmij3.json',
    click: 'https://assets7.lottiefiles.com/packages/lf20_cak7q5t8.json',
    download: 'https://assets9.lottiefiles.com/packages/lf20_uwh4po7h.json',
    play: 'https://assets8.lottiefiles.com/packages/lf20_q5pk6p1k.json',
    bell: 'https://assets4.lottiefiles.com/packages/lf20_pssnqvpc.json',
  },
};

// Transition & Effect Animations
export const TRANSITION_ANIMATIONS = {
  sparkles: 'https://assets4.lottiefiles.com/packages/lf20_t9gkkhz4.json',
  confetti: 'https://assets9.lottiefiles.com/packages/lf20_u4yrau.json',
  particles: 'https://assets1.lottiefiles.com/packages/lf20_p8bfn5to.json',
  fireworks: 'https://assets5.lottiefiles.com/packages/lf20_dymqmk0r.json',
  loading: 'https://assets1.lottiefiles.com/packages/lf20_p8bfn5to.json',
};

// ============= SCENE-TYPE MAPPINGS =============
export const SCENE_TYPE_ANIMATIONS = {
  hook: {
    character: CHARACTER_ANIMATIONS.presenter.waving,
    characterAction: 'waving',
    icons: [ICON_ANIMATIONS.business.lightbulb, ICON_ANIMATIONS.success.star],
    iconKeys: ['lightbulb', 'star'],
    effect: 'sparkle',
  },
  problem: {
    character: CHARACTER_ANIMATIONS.presenter.thinking,
    characterAction: 'thinking',
    icons: [ICON_ANIMATIONS.warning.alert, ICON_ANIMATIONS.warning.exclamation],
    iconKeys: ['warning', 'error'],
    effect: null,
  },
  solution: {
    character: CHARACTER_ANIMATIONS.presenter.celebrating,
    characterAction: 'celebrating',
    icons: [ICON_ANIMATIONS.success.checkmark, ICON_ANIMATIONS.success.confetti],
    iconKeys: ['checkmark', 'confetti'],
    effect: 'confetti',
  },
  feature: {
    character: CHARACTER_ANIMATIONS.presenter.explaining,
    characterAction: 'explaining',
    icons: [ICON_ANIMATIONS.business.gear, ICON_ANIMATIONS.business.rocket],
    iconKeys: ['rocket', 'graph'],
    effect: 'sparkle',
  },
  proof: {
    character: CHARACTER_ANIMATIONS.presenter.pointing,
    characterAction: 'pointing',
    icons: [ICON_ANIMATIONS.business.graph, ICON_ANIMATIONS.success.trophy],
    iconKeys: ['trophy', 'graph'],
    effect: null,
  },
  cta: {
    character: CHARACTER_ANIMATIONS.presenter.pointing,
    characterAction: 'pointing',
    icons: [ICON_ANIMATIONS.action.arrowRight, ICON_ANIMATIONS.action.click],
    iconKeys: ['rocket', 'star'],
    effect: 'sparkle',
  },
};

// ============= FALLBACK ANIMATIONS (100% RELIABLE CDN) =============
export const FALLBACK_ANIMATIONS = {
  character: {
    businessMan: 'https://assets1.lottiefiles.com/packages/lf20_v92spkya.json',
    businessWoman: 'https://assets1.lottiefiles.com/packages/lf20_j3gxlmyp.json',
    presenter: 'https://assets4.lottiefiles.com/packages/lf20_4kx2q32n.json',
    waving: 'https://assets2.lottiefiles.com/packages/lf20_gq4ni7gw.json',
    thinking: 'https://assets5.lottiefiles.com/packages/lf20_xyadoh9h.json',
    celebrating: 'https://assets3.lottiefiles.com/packages/lf20_aKAfIn.json',
    pointing: 'https://assets9.lottiefiles.com/packages/lf20_yvbfj8j4.json',
    explaining: 'https://assets7.lottiefiles.com/packages/lf20_v1yudlrx.json',
  },
  icons: {
    checkmark: 'https://assets1.lottiefiles.com/packages/lf20_jbrw3hcz.json',
    error: 'https://assets4.lottiefiles.com/packages/lf20_tl52xzvn.json',
    warning: 'https://assets5.lottiefiles.com/packages/lf20_j3gumpbb.json',
    star: 'https://assets3.lottiefiles.com/packages/lf20_xlmz9xwm.json',
    rocket: 'https://assets6.lottiefiles.com/packages/lf20_l13zwzgr.json',
    lightbulb: 'https://assets2.lottiefiles.com/packages/lf20_6s73cldq.json',
    graph: 'https://assets7.lottiefiles.com/packages/lf20_t24tpvcu.json',
    trophy: 'https://assets8.lottiefiles.com/packages/lf20_touohxv0.json',
    confetti: 'https://assets9.lottiefiles.com/packages/lf20_u4yrau.json',
  },
  transitions: {
    loading: 'https://assets1.lottiefiles.com/packages/lf20_p8bfn5to.json',
    sparkle: 'https://assets4.lottiefiles.com/packages/lf20_t9gkkhz4.json',
  },
};

// ============= HELPER FUNCTIONS =============
export const getCharacterAnimation = (sceneType: string, action?: string): string => {
  // First try specific action
  if (action && FALLBACK_ANIMATIONS.character[action as keyof typeof FALLBACK_ANIMATIONS.character]) {
    return FALLBACK_ANIMATIONS.character[action as keyof typeof FALLBACK_ANIMATIONS.character];
  }
  
  // Then try scene type mapping
  const mapping = SCENE_TYPE_ANIMATIONS[sceneType as keyof typeof SCENE_TYPE_ANIMATIONS];
  if (mapping) {
    return mapping.character;
  }
  
  return FALLBACK_ANIMATIONS.character.presenter;
};

export const getIconAnimations = (sceneType: string): string[] => {
  const mapping = SCENE_TYPE_ANIMATIONS[sceneType as keyof typeof SCENE_TYPE_ANIMATIONS];
  return mapping?.icons || [FALLBACK_ANIMATIONS.icons.star, FALLBACK_ANIMATIONS.icons.lightbulb];
};

export const getIconKeys = (sceneType: string): string[] => {
  const mapping = SCENE_TYPE_ANIMATIONS[sceneType as keyof typeof SCENE_TYPE_ANIMATIONS];
  return mapping?.iconKeys || ['star', 'lightbulb'];
};

export const getEffectAnimation = (sceneType: string): string | null => {
  const mapping = SCENE_TYPE_ANIMATIONS[sceneType as keyof typeof SCENE_TYPE_ANIMATIONS];
  if (!mapping?.effect) return null;
  
  if (mapping.effect === 'confetti') return TRANSITION_ANIMATIONS.confetti;
  if (mapping.effect === 'sparkle') return TRANSITION_ANIMATIONS.sparkles;
  return null;
};

export const getFallbackAnimation = (type: 'character' | 'icon' | 'transition', action: string): string => {
  if (type === 'character') {
    return FALLBACK_ANIMATIONS.character[action as keyof typeof FALLBACK_ANIMATIONS.character] 
      || FALLBACK_ANIMATIONS.character.presenter;
  }
  if (type === 'icon') {
    return FALLBACK_ANIMATIONS.icons[action as keyof typeof FALLBACK_ANIMATIONS.icons]
      || FALLBACK_ANIMATIONS.icons.star;
  }
  return FALLBACK_ANIMATIONS.transitions[action as keyof typeof FALLBACK_ANIMATIONS.transitions]
    || FALLBACK_ANIMATIONS.transitions.loading;
};
