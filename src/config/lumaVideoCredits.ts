import { tx } from "@/lib/i18nText";
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
      EUR: tx({ de: 'Cinematic AI-Videos ab 1,05€ pro 5 Sekunden', en: 'Cinematic AI videos from €1.05 per 5 seconds', es: 'Vídeos cinematográficos con IA desde 1,05 € por 5 segundos' }),
      USD: 'Cinematic AI videos from $1.05 per 5 seconds',
    },
    badge: tx({ de: 'Empfohlen', en: 'Recommended', es: 'Recomendado' }),
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
      EUR: tx({ de: 'Premium cinematic Qualität ab 1,80€ pro 5 Sekunden', en: 'Premium cinematic quality from €1.80 per 5 seconds', es: 'Calidad cinematográfica premium desde 1,80 € por 5 segundos' }),
      USD: 'Premium cinematic quality from $1.80 per 5 seconds',
    },
    badge: tx({ de: 'Premium', en: 'Premium', es: 'Premium' }),
  },
  'luma-ray32-5s': {
    name: 'Luma Ray 3.2 (5s)',
    provider: 'Luma AI (Replicate)',
    quality: '720p',
    costPerSecond: {
      EUR: 0.18,
      USD: 0.18,
    },
    minDuration: 5,
    maxDuration: 5,
    allowedDurations: [5] as const,
    description: {
      EUR: tx({ de: 'Ray 3.2 · neueste Luma-Generation — 0,90€ pro Clip', en: 'Ray 3.2 · latest Luma generation — €0.90 per clip', es: 'Ray 3.2 · última generación de Luma — 0,90 € por clip' }),
      USD: 'Ray 3.2 · latest Luma generation — $0.90 per clip',
    },
    badge: tx({ de: 'Neu', en: 'New', es: 'Nuevo' }),
  },
  'luma-ray32-10s': {
    name: 'Luma Ray 3.2 (10s)',
    provider: 'Luma AI (Replicate)',
    quality: '720p',
    costPerSecond: {
      EUR: 0.27,
      USD: 0.27,
    },
    minDuration: 10,
    maxDuration: 10,
    allowedDurations: [10] as const,
    description: {
      EUR: tx({ de: 'Ray 3.2 · 10s Langclip — 2,70€ pro Clip', en: 'Ray 3.2 · 10s long clip — €2.70 per clip', es: 'Ray 3.2 · clip largo de 10 segundos — 2,70 € por clip' }),
      USD: 'Ray 3.2 · 10s long clip — $2.70 per clip',
    },
    badge: tx({ de: 'Neu', en: 'New', es: 'Nuevo' }),
  },
} as const;

export type LumaVideoModel = keyof typeof LUMA_VIDEO_MODELS;

export const LUMA_ASPECT_RATIOS = ['16:9', '9:16', '1:1'] as const;
export type LumaAspectRatio = typeof LUMA_ASPECT_RATIOS[number];

export const LUMA_CAMERA_CONCEPTS = [
  { id: 'none', label: tx({ de: 'Keine', en: 'None', es: 'Ninguno' }), description: tx({ de: 'Standard', en: 'Standard', es: 'Estándar' }) },
  { id: 'orbit_left', label: 'Orbit Left', description: tx({ de: 'Kamera kreist links', en: 'Camera orbits left', es: 'Cámara orbita a la izquierda' }) },
  { id: 'orbit_right', label: 'Orbit Right', description: tx({ de: 'Kamera kreist rechts', en: 'Camera orbits right', es: 'Cámara orbita a la derecha' }) },
  { id: 'zoom_in', label: 'Zoom In', description: tx({ de: 'Hereinzoomen', en: 'Zooming in', es: 'Acercar zoom' }) },
  { id: 'zoom_out', label: 'Zoom Out', description: tx({ de: 'Herauszoomen', en: 'Zooming out', es: 'Alejar zoom' }) },
  { id: 'dolly_in', label: 'Dolly In', description: tx({ de: 'Kamerabewegung nach vorne', en: 'Camera movement forward', es: 'Movimiento de cámara hacia adelante' }) },
  { id: 'dolly_out', label: 'Dolly Out', description: tx({ de: 'Kamerabewegung zurück', en: 'Camera movement back', es: 'Movimiento de cámara hacia atrás' }) },
  { id: 'pan_left', label: 'Pan Left', description: tx({ de: 'Schwenk nach links', en: 'Pan left', es: 'Panorámica a la izquierda' }) },
  { id: 'pan_right', label: 'Pan Right', description: tx({ de: 'Schwenk nach rechts', en: 'Pan right', es: 'Panorámica a la derecha' }) },
  { id: 'tilt_up', label: 'Tilt Up', description: tx({ de: 'Neigung nach oben', en: 'Tilt up', es: 'Inclinación hacia arriba' }) },
  { id: 'tilt_down', label: 'Tilt Down', description: tx({ de: 'Neigung nach unten', en: 'Tilt down', es: 'Inclinación hacia abajo' }) },
] as const;

export type LumaCameraConcept = typeof LUMA_CAMERA_CONCEPTS[number]['id'];
