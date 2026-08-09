import { z } from 'zod';
import { tx } from '@/lib/i18nText';

// Base Schema
export const mediaProfileConfigSchema = z.object({
  // Required fields
  aspect: z.string()
    .regex(/^\d+:\d+$/, tx({ de: 'Format muss "width:height" sein (z.B. 16:9)', en: 'Format must be "width:height" (e.g. 16:9)', es: 'El formato debe ser "width:height" (p. ej. 16:9)' })),
  width: z.number()
    .int(tx({ de: 'Breite muss eine Ganzzahl sein', en: 'Width must be an integer', es: 'El ancho debe ser un número entero' }))
    .min(100, tx({ de: 'Breite muss mindestens 100px sein', en: 'Width must be at least 100px', es: 'El ancho debe ser de al menos 100px' }))
    .max(8192, tx({ de: 'Breite darf maximal 8192px sein', en: 'Width may be at most 8192px', es: 'El ancho puede ser de máximo 8192px' })),
  height: z.number()
    .int(tx({ de: 'Höhe muss eine Ganzzahl sein', en: 'Height must be an integer', es: 'La altura debe ser un número entero' }))
    .min(100, tx({ de: 'Höhe muss mindestens 100px sein', en: 'Height must be at least 100px', es: 'La altura debe ser de al menos 100px' }))
    .max(8192, tx({ de: 'Höhe darf maximal 8192px sein', en: 'Height may be at most 8192px', es: 'La altura puede ser de máximo 8192px' })),
  fitMode: z.enum({cover: 'cover', contain: 'contain', pad: 'pad', smart: 'smart'}, {
    error: tx({ de: 'FitMode muss cover, contain, pad oder smart sein', en: 'FitMode must be cover, contain, pad or smart', es: 'FitMode debe ser cover, contain, pad o smart' })
  }),
  sizeLimitMb: z.number()
    .int(tx({ de: 'Größenlimit muss eine Ganzzahl sein', en: 'Size limit must be an integer', es: 'El límite de tamaño debe ser un número entero' }))
    .min(1, tx({ de: 'Größenlimit muss mindestens 1 MB sein', en: 'Size limit must be at least 1 MB', es: 'El límite de tamaño debe ser de al menos 1 MB' }))
    .max(4000, tx({ de: 'Größenlimit darf maximal 4000 MB sein', en: 'Size limit may be at most 4000 MB', es: 'El límite de tamaño puede ser de máximo 4000 MB' })),
  type: z.enum({image: 'image', video: 'video'}, {
    error: tx({ de: 'Typ muss image oder video sein', en: 'Type must be image or video', es: 'El tipo debe ser image o video' })
  }),

  // Optional fields
  background: z.string()
    .regex(/^#[0-9A-Fa-f]{6}$/, tx({ de: 'Hintergrund muss ein HEX-Farbcode sein (z.B. #000000)', en: 'Background must be a HEX color code (e.g. #000000)', es: 'El fondo debe ser un código de color HEX (p. ej. #000000)' }))
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
    message: tx({ de: 'Aspect Ratio stimmt nicht mit width:height überein (Toleranz: ±1px)', en: 'Aspect ratio does not match width:height (tolerance: ±1px)', es: 'La relación de aspecto no coincide con width:height (tolerancia: ±1px)' }),
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
    message: tx({ de: 'Video-Typ benötigt video-Konfiguration', en: 'Video type requires video configuration', es: 'El tipo video requiere configuración de video' }),
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
    .min(1, tx({ de: 'Name ist erforderlich', en: 'Name is required', es: 'El nombre es obligatorio' }))
    .max(100, tx({ de: 'Name darf maximal 100 Zeichen haben', en: 'Name may be at most 100 characters', es: 'El nombre puede tener máximo 100 caracteres' })),
  platform: z.enum(['instagram', 'tiktok', 'youtube', 'x', 'facebook', 'linkedin']),
  type: z.enum(['image', 'video']),
  config: mediaProfileConfigSchema,
  is_default: z.boolean().default(false),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional()
});

export type MediaProfile = z.infer<typeof mediaProfileSchema>;
