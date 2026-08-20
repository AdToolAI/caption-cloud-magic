import { Currency } from './pricing';
import { tx } from '@/lib/i18nText';

// Margin policy: exactly 3.00× Replicate cost (normalized 14.07.2026)
// Std: $0.04/s → €0.12/s | Pro: $0.07/s → €0.21/s
export const WAN_VIDEO_MODELS = {
  'wan-standard': {
    name: 'Wan 2.5 Standard',
    provider: 'Wan Video (Replicate)',
    quality: '720p',
    version: '2.5',
    costPerSecond: {
      EUR: 0.12,
      USD: 0.12,
    },
    minDuration: 5,
    maxDuration: 10,
    allowedDurations: [5, 10] as const,
    description: {
      EUR: tx({ de: 'Schnelle AI-Videos ab 0,60€ pro 5 Sekunden', en: 'Fast AI videos from €0.60 per 5 seconds', es: 'Vídeos rápidos con IA desde 0,60 € por 5 segundos' }),
      USD: 'Fast AI videos from $0.60 per 5 seconds',
    },
    badge: 'Standard',
  },
  'wan-pro': {
    name: 'Wan 2.5 Pro',
    provider: 'Wan Video (Replicate)',
    quality: '1080p',
    version: '2.5',
    costPerSecond: {
      EUR: 0.21,
      USD: 0.21,
    },
    minDuration: 5,
    maxDuration: 10,
    allowedDurations: [5, 10] as const,
    description: {
      EUR: tx({ de: 'Premium 1080p-Qualität ab 1,05€ pro 5 Sekunden', en: 'Premium 1080p quality from €1.05 per 5 seconds', es: 'Calidad premium 1080p desde 1,05€ por 5 segundos' }),
      USD: 'Premium 1080p quality from $1.05 per 5 seconds',
    },
    badge: 'Premium',
  },
  'wan-2-6-standard': {
    name: 'Wan 2.6 Standard',
    provider: 'Wan Video (Replicate)',
    quality: '720p',
    version: '2.6',
    costPerSecond: {
      EUR: 0.12,
      USD: 0.12,
    },
    minDuration: 5,
    maxDuration: 10,
    allowedDurations: [5, 10] as const,
    description: {
      EUR: 'Verbesserte Motion-Konsistenz · gleiche Preise',
      USD: 'Improved motion consistency · same price',
    },
    badge: 'New',
  },
  'wan-2-6-pro': {
    name: 'Wan 2.6 Pro',
    provider: 'Wan Video (Replicate)',
    quality: '1080p',
    version: '2.6',
    costPerSecond: {
      EUR: 0.21,
      USD: 0.21,
    },
    minDuration: 5,
    maxDuration: 10,
    allowedDurations: [5, 10] as const,
    description: {
      EUR: 'Wan 2.6 Pro · 1080p · beste Motion-Konsistenz',
      USD: 'Wan 2.6 Pro · 1080p · best motion consistency',
    },
    badge: 'Neu Premium',
  },
  'wan-2-7-standard': {
    name: 'Wan 2.7',
    provider: 'Wan Video (Replicate)',
    quality: '720p',
    version: '2.7',
    costPerSecond: {
      EUR: 0.30,
      USD: 0.30,
    },
    minDuration: 5,
    maxDuration: 15,
    allowedDurations: [5, 10, 15] as const,
    description: {
      EUR: '27B MoE · natives Audio · 720p',
      USD: '27B MoE · native audio · 720p',
    },
    badge: 'New',
  },
  'wan-2-7-pro': {
    name: 'Wan 2.7 Pro',
    provider: 'Wan Video (Replicate)',
    quality: '1080p',
    version: '2.7',
    costPerSecond: {
      EUR: 0.45,
      USD: 0.45,
    },
    minDuration: 5,
    maxDuration: 15,
    allowedDurations: [5, 10, 15] as const,
    description: {
      EUR: '27B MoE · natives Audio · 1080p',
      USD: '27B MoE · native audio · 1080p',
    },
    badge: 'Premium',
  },
} as const;

export type WanVideoModel = keyof typeof WAN_VIDEO_MODELS;

export const WAN_ASPECT_RATIOS = ['16:9', '9:16', '1:1'] as const;
export type WanAspectRatio = typeof WAN_ASPECT_RATIOS[number];
