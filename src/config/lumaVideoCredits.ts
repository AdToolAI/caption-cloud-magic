import { Currency } from './pricing';

// Margin policy: exactly 3.00× Replicate cost (normalized 14.07.2026)
// Std: $0.07/s → €0.21/s | Pro: $0.12/s → €0.36/s
export const LUMA_VIDEO_MODELS = {
  'luma-standard': {
    name: 'Luma Ray 2 Standard',
    provider: 'Luma AI (Replicate)',
    quality: '720p',
    costPerSecond: {
      EUR: 0.21,
      USD: 0.21,
    },
    minDuration: 5,
    maxDuration: 9,
    allowedDurations: [5, 9] as const,
    description: {
      EUR: 'Cinematic AI-Videos ab 1,05€ pro 5 Sekunden',
      USD: 'Cinematic AI videos from $1.05 per 5 seconds',
    },
    badge: 'Empfohlen',
  },
  'luma-pro': {
    name: 'Luma Ray 2 Pro',
    provider: 'Luma AI (Replicate)',
    quality: '720p',
    costPerSecond: {
      EUR: 0.36,
      USD: 0.36,
    },
    minDuration: 5,
    maxDuration: 9,
    allowedDurations: [5, 9] as const,
    description: {
      EUR: 'Premium cinematic Qualität ab 1,80€ pro 5 Sekunden',
      USD: 'Premium cinematic quality from $1.80 per 5 seconds',
    },
    badge: 'Premium',
  },
} as const;

export type LumaVideoModel = keyof typeof LUMA_VIDEO_MODELS;

export const LUMA_ASPECT_RATIOS = ['16:9', '9:16', '1:1'] as const;
export type LumaAspectRatio = typeof LUMA_ASPECT_RATIOS[number];

export const LUMA_CAMERA_CONCEPTS = [
  { id: 'none', label: 'Keine', description: 'Standard' },
  { id: 'orbit_left', label: 'Orbit Left', description: 'Kamera kreist links' },
  { id: 'orbit_right', label: 'Orbit Right', description: 'Kamera kreist rechts' },
  { id: 'zoom_in', label: 'Zoom In', description: 'Hereinzoomen' },
  { id: 'zoom_out', label: 'Zoom Out', description: 'Herauszoomen' },
  { id: 'dolly_in', label: 'Dolly In', description: 'Kamerabewegung nach vorne' },
  { id: 'dolly_out', label: 'Dolly Out', description: 'Kamerabewegung zurück' },
  { id: 'pan_left', label: 'Pan Left', description: 'Schwenk nach links' },
  { id: 'pan_right', label: 'Pan Right', description: 'Schwenk nach rechts' },
  { id: 'tilt_up', label: 'Tilt Up', description: 'Neigung nach oben' },
  { id: 'tilt_down', label: 'Tilt Down', description: 'Neigung nach unten' },
] as const;

export type LumaCameraConcept = typeof LUMA_CAMERA_CONCEPTS[number]['id'];
