/**
 * 🎬 EMBEDDED LOTTIE ANIMATIONS
 * 95%+ Loft-Film Quality - Frame-by-Frame Animations
 * 
 * Vollständige Lottie-JSON Animationen direkt embedded für 100% Zuverlässigkeit
 */

import { LottieAnimationData } from '@remotion/lottie';

// ============================================
// VISEME MOUTH SHAPE CONFIGURATIONS
// Frame-accurate lip-sync animation data
// ============================================

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
  wide: { frame: 1, width: 36, height: 22, roundness: 0.1, teethVisible: true, tongueVisible: false },      // A, I
  medium: { frame: 2, width: 28, height: 16, roundness: 0.2, teethVisible: true, tongueVisible: false },    // E
  round: { frame: 3, width: 20, height: 20, roundness: 0.9, teethVisible: false, tongueVisible: false },    // O
  small_round: { frame: 4, width: 14, height: 14, roundness: 0.95, teethVisible: false, tongueVisible: false }, // U
  closed: { frame: 5, width: 26, height: 2, roundness: 0, teethVisible: false, tongueVisible: false },      // M, B, P
  teeth_lip: { frame: 6, width: 24, height: 12, roundness: 0.1, teethVisible: true, tongueVisible: false }, // F, V, W
  teeth: { frame: 7, width: 28, height: 14, roundness: 0.15, teethVisible: true, tongueVisible: false },    // T, D, S, Z
  tongue_up: { frame: 8, width: 24, height: 14, roundness: 0.2, teethVisible: true, tongueVisible: true },  // L, N
  back: { frame: 9, width: 22, height: 18, roundness: 0.7, teethVisible: false, tongueVisible: true },      // R
  back_open: { frame: 10, width: 26, height: 20, roundness: 0.6, teethVisible: true, tongueVisible: true }, // K, G
};

// ============================================
// PROFESSIONAL EMBEDDED LOTTIE: IDLE
// Breathing, subtle movement, blink cycle
// ============================================
export const createEmbeddedIdleAnimation = (shirtColor: string, skinTone: string): LottieAnimationData => {
  const shirtRGB = hexToRGB(shirtColor);
  const skinRGB = hexToRGB(skinTone);
  
  return {
    v: "5.7.4",
    fr: 30,
    ip: 0,
    op: 120, // 4 seconds loop
    w: 200,
    h: 300,
    nm: "Presenter_Idle_Professional",
    ddd: 0,
    assets: [],
    layers: [
      // Body with breathing animation
      createBodyLayer(shirtRGB, 120),
      // Head with subtle movement
      createHeadLayer(skinRGB, 120, 'idle'),
      // Eyes with blink cycle
      createEyesLayer(120),
      // Arms at rest with micro-movement
      createArmsLayer(shirtRGB, skinRGB, 'idle', 120),
    ],
    markers: []
  } as unknown as LottieAnimationData;
};

// ============================================
// PROFESSIONAL EMBEDDED LOTTIE: WAVING
// Enthusiastic wave animation
// ============================================
export const createEmbeddedWavingAnimation = (shirtColor: string, skinTone: string): LottieAnimationData => {
  const shirtRGB = hexToRGB(shirtColor);
  const skinRGB = hexToRGB(skinTone);
  
  return {
    v: "5.7.4",
    fr: 30,
    ip: 0,
    op: 60, // 2 seconds loop
    w: 200,
    h: 300,
    nm: "Presenter_Waving_Professional",
    ddd: 0,
    assets: [],
    layers: [
      createBodyLayer(shirtRGB, 60),
      createHeadLayer(skinRGB, 60, 'waving'),
      createEyesLayer(60),
      createArmsLayer(shirtRGB, skinRGB, 'waving', 60),
    ],
    markers: []
  } as unknown as LottieAnimationData;
};

// ============================================
// PROFESSIONAL EMBEDDED LOTTIE: THINKING
// Chin scratch, head tilt, thoughtful expression
// ============================================
export const createEmbeddedThinkingAnimation = (shirtColor: string, skinTone: string): LottieAnimationData => {
  const shirtRGB = hexToRGB(shirtColor);
  const skinRGB = hexToRGB(skinTone);
  
  return {
    v: "5.7.4",
    fr: 30,
    ip: 0,
    op: 90, // 3 seconds loop
    w: 200,
    h: 300,
    nm: "Presenter_Thinking_Professional",
    ddd: 0,
    assets: [],
    layers: [
      createBodyLayer(shirtRGB, 90),
      createHeadLayer(skinRGB, 90, 'thinking'),
      createEyesLayer(90, 'thinking'),
      createArmsLayer(shirtRGB, skinRGB, 'thinking', 90),
    ],
    markers: []
  } as unknown as LottieAnimationData;
};

// ============================================
// PROFESSIONAL EMBEDDED LOTTIE: CELEBRATING
// Arms up, jumping motion, excited expression
// ============================================
export const createEmbeddedCelebratingAnimation = (shirtColor: string, skinTone: string): LottieAnimationData => {
  const shirtRGB = hexToRGB(shirtColor);
  const skinRGB = hexToRGB(skinTone);
  
  return {
    v: "5.7.4",
    fr: 30,
    ip: 0,
    op: 45, // 1.5 seconds loop (fast celebration)
    w: 200,
    h: 300,
    nm: "Presenter_Celebrating_Professional",
    ddd: 0,
    assets: [],
    layers: [
      createBodyLayer(shirtRGB, 45, 'celebrating'),
      createHeadLayer(skinRGB, 45, 'celebrating'),
      createEyesLayer(45, 'celebrating'),
      createArmsLayer(shirtRGB, skinRGB, 'celebrating', 45),
    ],
    markers: []
  } as unknown as LottieAnimationData;
};

// ============================================
// PROFESSIONAL EMBEDDED LOTTIE: POINTING
// Forward point, confident stance
// ============================================
export const createEmbeddedPointingAnimation = (shirtColor: string, skinTone: string): LottieAnimationData => {
  const shirtRGB = hexToRGB(shirtColor);
  const skinRGB = hexToRGB(skinTone);
  
  return {
    v: "5.7.4",
    fr: 30,
    ip: 0,
    op: 75, // 2.5 seconds loop
    w: 200,
    h: 300,
    nm: "Presenter_Pointing_Professional",
    ddd: 0,
    assets: [],
    layers: [
      createBodyLayer(shirtRGB, 75),
      createHeadLayer(skinRGB, 75, 'pointing'),
      createEyesLayer(75),
      createArmsLayer(shirtRGB, skinRGB, 'pointing', 75),
      createPointingFingerLayer(skinRGB, 75),
    ],
    markers: []
  } as unknown as LottieAnimationData;
};

// ============================================
// PROFESSIONAL EMBEDDED LOTTIE: EXPLAINING
// Gesturing with hands, animated expression
// ============================================
export const createEmbeddedExplainingAnimation = (shirtColor: string, skinTone: string): LottieAnimationData => {
  const shirtRGB = hexToRGB(shirtColor);
  const skinRGB = hexToRGB(skinTone);
  
  return {
    v: "5.7.4",
    fr: 30,
    ip: 0,
    op: 90, // 3 seconds loop
    w: 200,
    h: 300,
    nm: "Presenter_Explaining_Professional",
    ddd: 0,
    assets: [],
    layers: [
      createBodyLayer(shirtRGB, 90),
      createHeadLayer(skinRGB, 90, 'explaining'),
      createEyesLayer(90),
      createArmsLayer(shirtRGB, skinRGB, 'explaining', 90),
    ],
    markers: []
  } as unknown as LottieAnimationData;
};

// ============================================
// EMBEDDED MOUTH SHAPE LOTTIE
// 11 Viseme frames for true lip-sync
// ============================================
export const createEmbeddedMouthShapesAnimation = (skinTone: string): LottieAnimationData => {
  const skinRGB = hexToRGB(skinTone);
  
  return {
    v: "5.7.4",
    fr: 30,
    ip: 0,
    op: 11, // 11 frames, one per viseme
    w: 80,
    h: 50,
    nm: "MouthShapes_LipSync",
    ddd: 0,
    assets: [],
    layers: [
      // Mouth shape layer with keyframes for each viseme
      {
        ddd: 0,
        ind: 1,
        ty: 4,
        nm: "MouthShape",
        sr: 1,
        ks: {
          o: { a: 0, k: 100 },
          r: { a: 0, k: 0 },
          p: { a: 0, k: [40, 25, 0] },
          a: { a: 0, k: [0, 0, 0] },
          s: { a: 0, k: [100, 100, 100] }
        },
        ao: 0,
        shapes: [
          {
            ty: "gr",
            it: [
              // Mouth path with viseme keyframes
              {
                ty: "sh",
                ks: {
                  a: 1,
                  k: [
                    // Frame 0: Neutral
                    { t: 0, s: [{ c: true, v: [[[-10, 0], [0, 2], [10, 0], [0, -2]]], i: [[0, 0], [0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0], [0, 0]] }] },
                    // Frame 1: Wide (A, I)
                    { t: 1, s: [{ c: true, v: [[[-18, -5], [0, 10], [18, -5], [0, -8]]], i: [[0, 0], [0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0], [0, 0]] }] },
                    // Frame 2: Medium (E)
                    { t: 2, s: [{ c: true, v: [[[-14, -3], [0, 8], [14, -3], [0, -6]]], i: [[0, 0], [0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0], [0, 0]] }] },
                    // Frame 3: Round (O)
                    { t: 3, s: [{ c: true, v: [[[-10, -8], [-10, 8], [10, 8], [10, -8]]], i: [[-5, 0], [0, 5], [5, 0], [0, -5]], o: [[5, 0], [0, 5], [-5, 0], [0, -5]] }] },
                    // Frame 4: Small Round (U)
                    { t: 4, s: [{ c: true, v: [[[-7, -6], [-7, 6], [7, 6], [7, -6]]], i: [[-4, 0], [0, 4], [4, 0], [0, -4]], o: [[4, 0], [0, 4], [-4, 0], [0, -4]] }] },
                    // Frame 5: Closed (M, B, P)
                    { t: 5, s: [{ c: true, v: [[[-13, 0], [0, 1], [13, 0], [0, -1]]], i: [[0, 0], [0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0], [0, 0]] }] },
                    // Frame 6: Teeth Lip (F, V, W)
                    { t: 6, s: [{ c: true, v: [[[-12, -3], [0, 6], [12, -3], [0, -4]]], i: [[0, 0], [0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0], [0, 0]] }] },
                    // Frame 7: Teeth (T, D, S)
                    { t: 7, s: [{ c: true, v: [[[-14, -4], [0, 7], [14, -4], [0, -5]]], i: [[0, 0], [0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0], [0, 0]] }] },
                    // Frame 8: Tongue Up (L, N)
                    { t: 8, s: [{ c: true, v: [[[-12, -4], [0, 7], [12, -4], [0, -5]]], i: [[0, 0], [0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0], [0, 0]] }] },
                    // Frame 9: Back (R)
                    { t: 9, s: [{ c: true, v: [[[-11, -7], [-8, 7], [8, 7], [11, -7]]], i: [[-4, 0], [0, 3], [4, 0], [0, -3]], o: [[4, 0], [0, 3], [-4, 0], [0, -3]] }] },
                    // Frame 10: Back Open (K, G)
                    { t: 10, s: [{ c: true, v: [[[-13, -8], [-10, 8], [10, 8], [13, -8]]], i: [[-5, 0], [0, 4], [5, 0], [0, -4]], o: [[5, 0], [0, 4], [-5, 0], [0, -4]] }] },
                  ]
                }
              },
              // Mouth fill gradient
              {
                ty: "fl",
                c: { a: 0, k: [0.545, 0.137, 0.137, 1] }, // Dark red mouth interior
                o: { a: 0, k: 100 }
              },
              {
                ty: "tr",
                p: { a: 0, k: [0, 0] },
                a: { a: 0, k: [0, 0] },
                s: { a: 0, k: [100, 100] },
                r: { a: 0, k: 0 },
                o: { a: 0, k: 100 }
              }
            ],
            nm: "MouthPath"
          },
          // Teeth layer (visible in certain visemes)
          {
            ty: "gr",
            it: [
              {
                ty: "rc",
                d: 1,
                s: { 
                  a: 1, 
                  k: [
                    { t: 0, s: [0, 0] },
                    { t: 1, s: [20, 4] },
                    { t: 2, s: [16, 4] },
                    { t: 3, s: [0, 0] },
                    { t: 4, s: [0, 0] },
                    { t: 5, s: [0, 0] },
                    { t: 6, s: [14, 4] },
                    { t: 7, s: [18, 4] },
                    { t: 8, s: [16, 4] },
                    { t: 9, s: [0, 0] },
                    { t: 10, s: [18, 4] },
                  ]
                },
                p: { a: 0, k: [0, -3] },
                r: { a: 0, k: 1 }
              },
              {
                ty: "fl",
                c: { a: 0, k: [1, 1, 1, 1] },
                o: { a: 0, k: 100 }
              },
              {
                ty: "tr",
                p: { a: 0, k: [0, 0] },
                a: { a: 0, k: [0, 0] },
                s: { a: 0, k: [100, 100] },
                r: { a: 0, k: 0 },
                o: { a: 0, k: 100 }
              }
            ],
            nm: "Teeth"
          }
        ],
        ip: 0,
        op: 11,
        st: 0
      }
    ],
    markers: []
  } as unknown as LottieAnimationData;
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function hexToRGB(hex: string): [number, number, number] {
  const cleanHex = hex.replace('#', '');
  return [
    parseInt(cleanHex.substr(0, 2), 16) / 255,
    parseInt(cleanHex.substr(2, 2), 16) / 255,
    parseInt(cleanHex.substr(4, 2), 16) / 255
  ];
}

function createBodyLayer(rgb: [number, number, number], duration: number, action?: string): any {
  const bounce = action === 'celebrating' ? [
    { t: 0, s: [100, 225, 0], e: [100, 215, 0] },
    { t: Math.floor(duration / 4), s: [100, 215, 0], e: [100, 225, 0] },
    { t: Math.floor(duration / 2), s: [100, 225, 0], e: [100, 215, 0] },
    { t: Math.floor(duration * 3 / 4), s: [100, 215, 0], e: [100, 225, 0] },
    { t: duration, s: [100, 225, 0] }
  ] : [
    { t: 0, s: [100, 225, 0], e: [100, 223, 0] },
    { t: Math.floor(duration / 2), s: [100, 223, 0], e: [100, 225, 0] },
    { t: duration, s: [100, 225, 0] }
  ];

  return {
    ddd: 0,
    ind: 1,
    ty: 4,
    nm: "Body",
    sr: 1,
    ks: {
      o: { a: 0, k: 100 },
      r: { a: 0, k: 0 },
      p: { a: 1, k: bounce },
      a: { a: 0, k: [0, 0, 0] },
      s: { a: 0, k: [100, 100, 100] }
    },
    ao: 0,
    shapes: [
      {
        ty: "gr",
        it: [
          {
            ty: "rc",
            d: 1,
            s: { a: 0, k: [70, 90] },
            p: { a: 0, k: [0, 0] },
            r: { a: 0, k: 12 }
          },
          {
            ty: "fl",
            c: { a: 0, k: [...rgb, 1] },
            o: { a: 0, k: 100 }
          },
          {
            ty: "tr",
            p: { a: 0, k: [0, 0] },
            a: { a: 0, k: [0, 0] },
            s: { a: 0, k: [100, 100] },
            r: { a: 0, k: 0 },
            o: { a: 0, k: 100 }
          }
        ],
        nm: "Torso"
      },
      // Collar
      {
        ty: "gr",
        it: [
          {
            ty: "sh",
            ks: {
              a: 0,
              k: {
                c: false,
                v: [[-15, -45], [0, -30], [15, -45]],
                i: [[0, 0], [0, 0], [0, 0]],
                o: [[0, 0], [0, 0], [0, 0]]
              }
            }
          },
          {
            ty: "fl",
            c: { a: 0, k: [1, 1, 1, 1] },
            o: { a: 0, k: 100 }
          },
          {
            ty: "tr",
            p: { a: 0, k: [0, 0] },
            a: { a: 0, k: [0, 0] },
            s: { a: 0, k: [100, 100] },
            r: { a: 0, k: 0 },
            o: { a: 0, k: 100 }
          }
        ],
        nm: "Collar"
      }
    ],
    ip: 0,
    op: duration,
    st: 0
  };
}

function createHeadLayer(skinRGB: [number, number, number], duration: number, action: string): any {
  const headTilt = action === 'thinking' ? [
    { t: 0, s: [8], e: [12] },
    { t: Math.floor(duration / 2), s: [12], e: [8] },
    { t: duration, s: [8] }
  ] : action === 'celebrating' ? [
    { t: 0, s: [-5], e: [5] },
    { t: Math.floor(duration / 4), s: [5], e: [-5] },
    { t: Math.floor(duration / 2), s: [-5], e: [5] },
    { t: Math.floor(duration * 3 / 4), s: [5], e: [-5] },
    { t: duration, s: [-5] }
  ] : 0;

  const headBob = action === 'waving' || action === 'explaining' ? [
    { t: 0, s: [100, 135, 0], e: [100, 132, 0] },
    { t: Math.floor(duration / 3), s: [100, 132, 0], e: [100, 135, 0] },
    { t: Math.floor(duration * 2 / 3), s: [100, 135, 0], e: [100, 132, 0] },
    { t: duration, s: [100, 132, 0] }
  ] : [
    { t: 0, s: [100, 135, 0], e: [100, 133, 0] },
    { t: Math.floor(duration / 2), s: [100, 133, 0], e: [100, 135, 0] },
    { t: duration, s: [100, 135, 0] }
  ];

  return {
    ddd: 0,
    ind: 2,
    ty: 4,
    nm: "Head",
    sr: 1,
    ks: {
      o: { a: 0, k: 100 },
      r: { a: Array.isArray(headTilt) ? 1 : 0, k: headTilt },
      p: { a: 1, k: headBob },
      a: { a: 0, k: [0, 0, 0] },
      s: { a: 0, k: [100, 100, 100] }
    },
    ao: 0,
    shapes: [
      {
        ty: "gr",
        it: [
          {
            ty: "el",
            d: 1,
            s: { a: 0, k: [75, 85] },
            p: { a: 0, k: [0, 0] }
          },
          {
            ty: "fl",
            c: { a: 0, k: [...skinRGB, 1] },
            o: { a: 0, k: 100 }
          },
          {
            ty: "tr",
            p: { a: 0, k: [0, 0] },
            a: { a: 0, k: [0, 0] },
            s: { a: 0, k: [100, 100] },
            r: { a: 0, k: 0 },
            o: { a: 0, k: 100 }
          }
        ],
        nm: "HeadShape"
      },
      // Hair
      {
        ty: "gr",
        it: [
          {
            ty: "sh",
            ks: {
              a: 0,
              k: {
                c: true,
                v: [[-35, -5], [-25, -40], [0, -48], [25, -40], [35, -5], [25, -20], [0, -25], [-25, -20]],
                i: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
                o: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]]
              }
            }
          },
          {
            ty: "fl",
            c: { a: 0, k: [0.18, 0.11, 0.055, 1] }, // Dark brown hair
            o: { a: 0, k: 100 }
          },
          {
            ty: "tr",
            p: { a: 0, k: [0, 0] },
            a: { a: 0, k: [0, 0] },
            s: { a: 0, k: [100, 100] },
            r: { a: 0, k: 0 },
            o: { a: 0, k: 100 }
          }
        ],
        nm: "Hair"
      }
    ],
    ip: 0,
    op: duration,
    st: 0
  };
}

function createEyesLayer(duration: number, action?: string): any {
  // Blink every 90 frames (3 seconds at 30fps)
  const blinkFrames = [];
  for (let i = 0; i < duration; i += 90) {
    blinkFrames.push({ t: i, s: [100, 100, 100] });
    blinkFrames.push({ t: i + 2, s: [100, 10, 100] });
    blinkFrames.push({ t: i + 4, s: [100, 100, 100] });
  }

  const eyeY = action === 'thinking' ? -5 : action === 'celebrating' ? 3 : 0;

  return {
    ddd: 0,
    ind: 3,
    ty: 4,
    nm: "Eyes",
    sr: 1,
    ks: {
      o: { a: 0, k: 100 },
      r: { a: 0, k: 0 },
      p: { a: 0, k: [100, 128 + eyeY, 0] },
      a: { a: 0, k: [0, 0, 0] },
      s: { a: 1, k: blinkFrames.length > 0 ? blinkFrames : [{ t: 0, s: [100, 100, 100] }] }
    },
    ao: 0,
    shapes: [
      // Left eye
      {
        ty: "gr",
        it: [
          {
            ty: "el",
            d: 1,
            s: { a: 0, k: [14, 10] },
            p: { a: 0, k: [-18, 0] }
          },
          {
            ty: "fl",
            c: { a: 0, k: [0.18, 0.11, 0.055, 1] },
            o: { a: 0, k: 100 }
          },
          {
            ty: "tr",
            p: { a: 0, k: [0, 0] },
            a: { a: 0, k: [0, 0] },
            s: { a: 0, k: [100, 100] },
            r: { a: 0, k: 0 },
            o: { a: 0, k: 100 }
          }
        ],
        nm: "LeftEye"
      },
      // Right eye
      {
        ty: "gr",
        it: [
          {
            ty: "el",
            d: 1,
            s: { a: 0, k: [14, 10] },
            p: { a: 0, k: [18, 0] }
          },
          {
            ty: "fl",
            c: { a: 0, k: [0.18, 0.11, 0.055, 1] },
            o: { a: 0, k: 100 }
          },
          {
            ty: "tr",
            p: { a: 0, k: [0, 0] },
            a: { a: 0, k: [0, 0] },
            s: { a: 0, k: [100, 100] },
            r: { a: 0, k: 0 },
            o: { a: 0, k: 100 }
          }
        ],
        nm: "RightEye"
      },
      // Eye highlights
      {
        ty: "gr",
        it: [
          {
            ty: "el",
            d: 1,
            s: { a: 0, k: [4, 3] },
            p: { a: 0, k: [-16, -2] }
          },
          {
            ty: "fl",
            c: { a: 0, k: [1, 1, 1, 1] },
            o: { a: 0, k: 80 }
          },
          {
            ty: "tr",
            p: { a: 0, k: [0, 0] },
            a: { a: 0, k: [0, 0] },
            s: { a: 0, k: [100, 100] },
            r: { a: 0, k: 0 },
            o: { a: 0, k: 100 }
          }
        ],
        nm: "LeftHighlight"
      },
      {
        ty: "gr",
        it: [
          {
            ty: "el",
            d: 1,
            s: { a: 0, k: [4, 3] },
            p: { a: 0, k: [20, -2] }
          },
          {
            ty: "fl",
            c: { a: 0, k: [1, 1, 1, 1] },
            o: { a: 0, k: 80 }
          },
          {
            ty: "tr",
            p: { a: 0, k: [0, 0] },
            a: { a: 0, k: [0, 0] },
            s: { a: 0, k: [100, 100] },
            r: { a: 0, k: 0 },
            o: { a: 0, k: 100 }
          }
        ],
        nm: "RightHighlight"
      }
    ],
    ip: 0,
    op: duration,
    st: 0
  };
}

function createArmsLayer(shirtRGB: [number, number, number], skinRGB: [number, number, number], action: string, duration: number): any {
  // Different arm rotations based on action
  const rightArmRotation = getArmRotationKeyframes(action, duration, 'right');
  const leftArmRotation = getArmRotationKeyframes(action, duration, 'left');

  return {
    ddd: 0,
    ind: 4,
    ty: 4,
    nm: "Arms",
    sr: 1,
    ks: {
      o: { a: 0, k: 100 },
      r: { a: 0, k: 0 },
      p: { a: 0, k: [100, 210, 0] },
      a: { a: 0, k: [0, 0, 0] },
      s: { a: 0, k: [100, 100, 100] }
    },
    ao: 0,
    shapes: [
      // Right arm
      {
        ty: "gr",
        it: [
          {
            ty: "rc",
            d: 1,
            s: { a: 0, k: [20, 55] },
            p: { a: 0, k: [0, 25] },
            r: { a: 0, k: 10 }
          },
          {
            ty: "fl",
            c: { a: 0, k: [...shirtRGB, 1] },
            o: { a: 0, k: 100 }
          },
          {
            ty: "tr",
            p: { a: 0, k: [40, -15] },
            a: { a: 0, k: [0, 0] },
            s: { a: 0, k: [100, 100] },
            r: { a: 1, k: rightArmRotation },
            o: { a: 0, k: 100 }
          }
        ],
        nm: "RightArm"
      },
      // Right hand
      {
        ty: "gr",
        it: [
          {
            ty: "el",
            d: 1,
            s: { a: 0, k: [22, 22] },
            p: { a: 0, k: [0, 0] }
          },
          {
            ty: "fl",
            c: { a: 0, k: [...skinRGB, 1] },
            o: { a: 0, k: 100 }
          },
          {
            ty: "tr",
            p: { a: 0, k: [40, 40] },
            a: { a: 0, k: [0, 0] },
            s: { a: 0, k: [100, 100] },
            r: { a: 0, k: 0 },
            o: { a: 0, k: 100 }
          }
        ],
        nm: "RightHand"
      },
      // Left arm
      {
        ty: "gr",
        it: [
          {
            ty: "rc",
            d: 1,
            s: { a: 0, k: [20, 55] },
            p: { a: 0, k: [0, 25] },
            r: { a: 0, k: 10 }
          },
          {
            ty: "fl",
            c: { a: 0, k: [...shirtRGB, 1] },
            o: { a: 0, k: 100 }
          },
          {
            ty: "tr",
            p: { a: 0, k: [-40, -15] },
            a: { a: 0, k: [0, 0] },
            s: { a: 0, k: [100, 100] },
            r: { a: 1, k: leftArmRotation },
            o: { a: 0, k: 100 }
          }
        ],
        nm: "LeftArm"
      },
      // Left hand
      {
        ty: "gr",
        it: [
          {
            ty: "el",
            d: 1,
            s: { a: 0, k: [22, 22] },
            p: { a: 0, k: [0, 0] }
          },
          {
            ty: "fl",
            c: { a: 0, k: [...skinRGB, 1] },
            o: { a: 0, k: 100 }
          },
          {
            ty: "tr",
            p: { a: 0, k: [-40, 40] },
            a: { a: 0, k: [0, 0] },
            s: { a: 0, k: [100, 100] },
            r: { a: 0, k: 0 },
            o: { a: 0, k: 100 }
          }
        ],
        nm: "LeftHand"
      }
    ],
    ip: 0,
    op: duration,
    st: 0
  };
}

function getArmRotationKeyframes(action: string, duration: number, side: 'left' | 'right'): any[] {
  const isRight = side === 'right';
  
  switch (action) {
    case 'waving':
      return isRight ? [
        { t: 0, s: [-70], e: [-100] },
        { t: Math.floor(duration / 6), s: [-100], e: [-70] },
        { t: Math.floor(duration / 3), s: [-70], e: [-100] },
        { t: Math.floor(duration / 2), s: [-100], e: [-70] },
        { t: Math.floor(duration * 2 / 3), s: [-70], e: [-100] },
        { t: Math.floor(duration * 5 / 6), s: [-100], e: [-70] },
        { t: duration, s: [-70] }
      ] : [
        { t: 0, s: [15], e: [20] },
        { t: Math.floor(duration / 2), s: [20], e: [15] },
        { t: duration, s: [15] }
      ];
      
    case 'pointing':
      return isRight ? [
        { t: 0, s: [-60], e: [-65] },
        { t: Math.floor(duration / 2), s: [-65], e: [-60] },
        { t: duration, s: [-60] }
      ] : [
        { t: 0, s: [20] },
        { t: duration, s: [20] }
      ];
      
    case 'celebrating':
      return isRight ? [
        { t: 0, s: [-120], e: [-140] },
        { t: Math.floor(duration / 4), s: [-140], e: [-120] },
        { t: Math.floor(duration / 2), s: [-120], e: [-140] },
        { t: Math.floor(duration * 3 / 4), s: [-140], e: [-120] },
        { t: duration, s: [-120] }
      ] : [
        { t: 0, s: [120], e: [140] },
        { t: Math.floor(duration / 4), s: [140], e: [120] },
        { t: Math.floor(duration / 2), s: [120], e: [140] },
        { t: Math.floor(duration * 3 / 4), s: [140], e: [120] },
        { t: duration, s: [120] }
      ];
      
    case 'thinking':
      return isRight ? [
        { t: 0, s: [-80] },
        { t: duration, s: [-80] }
      ] : [
        { t: 0, s: [15] },
        { t: duration, s: [15] }
      ];
      
    case 'explaining':
      return isRight ? [
        { t: 0, s: [-45], e: [-55] },
        { t: Math.floor(duration / 3), s: [-55], e: [-40] },
        { t: Math.floor(duration * 2 / 3), s: [-40], e: [-55] },
        { t: duration, s: [-55] }
      ] : [
        { t: 0, s: [45], e: [55] },
        { t: Math.floor(duration / 3), s: [55], e: [40] },
        { t: Math.floor(duration * 2 / 3), s: [40], e: [55] },
        { t: duration, s: [55] }
      ];
      
    default: // idle
      return isRight ? [
        { t: 0, s: [15], e: [18] },
        { t: Math.floor(duration / 2), s: [18], e: [15] },
        { t: duration, s: [15] }
      ] : [
        { t: 0, s: [-15], e: [-18] },
        { t: Math.floor(duration / 2), s: [-18], e: [-15] },
        { t: duration, s: [-15] }
      ];
  }
}

function createPointingFingerLayer(skinRGB: [number, number, number], duration: number): any {
  return {
    ddd: 0,
    ind: 5,
    ty: 4,
    nm: "PointingFinger",
    sr: 1,
    ks: {
      o: { a: 0, k: 100 },
      r: { a: 0, k: -60 },
      p: { 
        a: 1, 
        k: [
          { t: 0, s: [155, 175, 0], e: [158, 172, 0] },
          { t: Math.floor(duration / 2), s: [158, 172, 0], e: [155, 175, 0] },
          { t: duration, s: [155, 175, 0] }
        ]
      },
      a: { a: 0, k: [0, 0, 0] },
      s: { a: 0, k: [100, 100, 100] }
    },
    ao: 0,
    shapes: [
      {
        ty: "gr",
        it: [
          {
            ty: "rc",
            d: 1,
            s: { a: 0, k: [8, 25] },
            p: { a: 0, k: [0, 12] },
            r: { a: 0, k: 4 }
          },
          {
            ty: "fl",
            c: { a: 0, k: [...skinRGB, 1] },
            o: { a: 0, k: 100 }
          },
          {
            ty: "tr",
            p: { a: 0, k: [0, 0] },
            a: { a: 0, k: [0, 0] },
            s: { a: 0, k: [100, 100] },
            r: { a: 0, k: 0 },
            o: { a: 0, k: 100 }
          }
        ],
        nm: "Finger"
      }
    ],
    ip: 0,
    op: duration,
    st: 0
  };
}

// ============================================
// EXPORT: Get Animation by Action
// ============================================
export const getEmbeddedAnimation = (
  action: string, 
  shirtColor: string = '#F5C76A', 
  skinTone: string = '#FFDAB9'
): LottieAnimationData => {
  switch (action) {
    case 'idle':
      return createEmbeddedIdleAnimation(shirtColor, skinTone);
    case 'waving':
      return createEmbeddedWavingAnimation(shirtColor, skinTone);
    case 'thinking':
      return createEmbeddedThinkingAnimation(shirtColor, skinTone);
    case 'celebrating':
      return createEmbeddedCelebratingAnimation(shirtColor, skinTone);
    case 'pointing':
      return createEmbeddedPointingAnimation(shirtColor, skinTone);
    case 'explaining':
      return createEmbeddedExplainingAnimation(shirtColor, skinTone);
    default:
      return createEmbeddedIdleAnimation(shirtColor, skinTone);
  }
};

export default {
  getEmbeddedAnimation,
  createEmbeddedMouthShapesAnimation,
  VISEME_FRAME_MAP,
};
