import { z } from 'zod';

// Base Schema
export const mediaProfileConfigSchema = z.object({
  // Required fields
  aspect: z.string()
    .regex(/^\d+:\d+$/, 'Format muss "width:height" sein (z.B. 16:9)'),
  width: z.number()
    .int('Breite muss eine Ganzzahl sein')
    .min(100, 'Breite muss mindestens 100px sein')
    .max(8192, 'Breite darf maximal 8192px sein'),
  height: z.number()
    .int('Höhe muss eine Ganzzahl sein')
    .min(100, 'Höhe muss mindestens 100px sein')
    .max(8192, 'Höhe darf maximal 8192px sein'),
  fitMode: z.enum({cover: 'cover', contain: 'contain', pad: 'pad', smart: 'smart'}, {
    error: 'FitMode muss cover, contain, pad oder smart sein'
  }),
  sizeLimitMb: z.number()
    .int('Größenlimit muss eine Ganzzahl sein')
    .min(1, 'Größenlimit muss mindestens 1 MB sein')
    .max(4000, 'Größenlimit darf maximal 4000 MB sein'),
  type: z.enum(['image', 'video'], {
    errorMap: () => ({ message: 'Typ muss image oder video sein' })
  }),

  // Optional fields
  background: z.string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Hintergrund muss ein HEX-Farbcode sein (z.B. #000000)')
    .optional(),
  
  safeMargins: z.object({
    top: z.number().int().min(0).max(500).default(0),
    bottom: z.number().int().min(0).max(500).default(0),
    left: z.number().int().min(0).max(500).default(0),
    right: z.number().int().min(0).max(500).default(0)
  }).optional(),

  formats: z.object({
    imageOut: z.array(z.enum(['jpg', 'png', 'webp'])).optional(),
    videoOut: z.array(z.enum(['mp4', 'mov'])).optional()
  }).optional(),

  video: z.object({
    maxDurationSec: z.number().int().positive().optional(),
    minDurationSec: z.number().int().nonnegative().optional(),
    targetFps: z.number().int().positive().max(120).optional(),
    targetBitrateMbps: z.number().positive().max(100).optional(),
    codec: z.enum(['h264', 'hevc']).optional(),
    audioCodec: z.enum(['aac', 'opus']).optional(),
    audioKbps: z.number().int().positive().max(512).optional()
  }).optional(),

  rules: z.object({
    minWidth: z.number().int().positive().optional(),
    minHeight: z.number().int().positive().optional(),
    maxFps: z.number().int().positive().optional()
  }).optional()
}).refine(
  (data) => {
    // Check aspect ratio matches width:height (tolerance ±1px)
    const [aspectW, aspectH] = data.aspect.split(':').map(Number);
    const calculatedRatio = data.width / data.height;
    const expectedRatio = aspectW / aspectH;
    const tolerance = 1 / Math.max(data.width, data.height);
    return Math.abs(calculatedRatio - expectedRatio) <= tolerance;
  },
  {
    message: 'Aspect Ratio stimmt nicht mit width:height überein (Toleranz: ±1px)',
    path: ['aspect']
  }
).refine(
  (data) => {
    // If type is video, video config should be present
    if (data.type === 'video' && !data.video) {
      return false;
    }
    return true;
  },
  {
    message: 'Video-Typ benötigt video-Konfiguration',
    path: ['video']
  }
);

export type MediaProfileConfig = z.infer<typeof mediaProfileConfigSchema>;

// Platform type
export type Platform = 'instagram' | 'tiktok' | 'youtube' | 'x' | 'facebook' | 'linkedin';
export type MediaType = 'image' | 'video';

// Full profile type
export const mediaProfileSchema = z.object({
  id: z.string().uuid().optional(),
  workspace_id: z.string().uuid(),
  name: z.string()
    .min(1, 'Name ist erforderlich')
    .max(100, 'Name darf maximal 100 Zeichen haben'),
  platform: z.enum(['instagram', 'tiktok', 'youtube', 'x', 'facebook', 'linkedin']),
  type: z.enum(['image', 'video']),
  config: mediaProfileConfigSchema,
  is_default: z.boolean().default(false),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional()
});

export type MediaProfile = z.infer<typeof mediaProfileSchema>;
