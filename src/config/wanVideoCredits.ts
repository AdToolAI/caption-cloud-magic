import { Currency } from './pricing';
import { tx } from '@/lib/i18nText';

// Pricing policy (20.08.2026): sell prices cut by 35% vs. the old 3.00x catalog; margin floor is now 1.75x provider cost. Canonical source: src/lib/cost/videoPricingCatalog.ts
export const WAN_VIDEO_MODELS = {
  'wan-standard': {
    name: 'Wan 2.5 Standard',
    provider: 'Wan Video (Replicate)',
    quality: '720p',
    version: '2.5',
    costPerSecond: {
      EUR: 0.09,
      USD: 0.09,
    },
    minDuration: 5,
    maxDuration: 10,
    allowedDurations: [5, 10] as const,
    description: {
      EUR: tx({ de: 'Schnelle AI-Videos ab 0,45 € pro 5 Sekunden', en: 'Fast AI videos from €0.45 per 5 seconds', es: 'Vídeos rápidos con IA desde 0,45 € por 5 segundos' }),
      USD: 'Fast AI videos from $0.45 per 5 seconds',
    },
    badge: 'Standard',
  },
  'wan-pro': {
    name: 'Wan 2.5 Pro',
    provider: 'Wan Video (Replicate)',
    quality: '1080p',
    version: '2.5',
    costPerSecond: {
      EUR: 0.155,
      USD: 0.155,
    },
    minDuration: 5,
    maxDuration: 10,
    allowedDurations: [5, 10] as const,
    description: {
      EUR: tx({ de: 'Premium 1080p-Qualität ab 0,78 € pro 5 Sekunden', en: 'Premium 1080p quality from €0.78 per 5 seconds', es: 'Calidad premium 1080p desde 0,78 € por 5 segundos' }),
      USD: 'Premium 1080p quality from $0.78 per 5 seconds',
    },
    badge: 'Premium',
  },
  'wan-2-6-standard': {
    name: 'Wan 2.6 Standard',
    provider: 'Wan Video (Replicate)',
    quality: '720p',
    version: '2.6',
    costPerSecond: {
      EUR: 0.09,
      USD: 0.09,
    },
    minDuration: 5,
    maxDuration: 10,
    allowedDurations: [5, 10] as const,
    description: {
      EUR: 'Improved motion consistency · same price',
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
      EUR: 0.155,
      USD: 0.155,
    },
    minDuration: 5,
    maxDuration: 10,
    allowedDurations: [5, 10] as const,
    description: {
      EUR: 'Wan 2.6 Pro · 1080p · best motion consistency',
      USD: 'Wan 2.6 Pro · 1080p · best motion consistency',
    },
    badge: 'New Premium',
  },
  'wan-2-7-standard': {
    name: 'Wan 2.7',
    provider: 'Wan Video (Replicate)',
    quality: '720p',
    version: '2.7',
    costPerSecond: {
      EUR: 0.22,
      USD: 0.22,
    },
    minDuration: 5,
    maxDuration: 15,
    allowedDurations: [5, 10, 15] as const,
    description: {
      EUR: '27B MoE · native audio · 720p',
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
      EUR: 0.32,
      USD: 0.32,
    },
    minDuration: 5,
    maxDuration: 15,
    allowedDurations: [5, 10, 15] as const,
    description: {
      EUR: '27B MoE · native audio · 1080p',
      USD: '27B MoE · native audio · 1080p',
    },
    badge: 'Premium',
  },
} as const;

export type WanVideoModel = keyof typeof WAN_VIDEO_MODELS;

export const WAN_ASPECT_RATIOS = ['16:9', '9:16', '1:1'] as const;
export type WanAspectRatio = typeof WAN_ASPECT_RATIOS[number];
