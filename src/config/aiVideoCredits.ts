import { tx } from "@/lib/i18nText";
import { Currency } from './pricing';

export const AI_VIDEO_CREDIT_PACKS = {
  starter: {
    id: 'starter',
    name: {
      EUR: 'Starter Pack',
      USD: 'Starter Pack',
    },
    price: {
      EUR: 10,
      USD: 10,
    },
    bonusPercent: 0,
    bonus: {
      EUR: 0,
      USD: 0,
    },
    // Fixed payment fees (method fee + cross-border) hit the smallest pack
    // hardest, so the 10 pack grants 9 units — the entry price stays intact
    // while the fixed-cost drag is priced in. Larger packs keep their bonus.
    totalCredits: {
      EUR: 9.00,
      USD: 9.00,
    },
    description: {
      EUR: tx({ de: 'Perfekt zum Ausprobieren', en: 'Perfect to try out', es: 'Perfecto para probar' }),
      USD: 'Perfect for testing',
    },
    badge: undefined as string | undefined,
    popular: false,
    bestValue: false,
  },
  standard: {
    id: 'standard',
    name: {
      EUR: 'Standard Pack',
      USD: 'Standard Pack',
    },
    price: {
      EUR: 50,
      USD: 50,
    },
    bonusPercent: 2,
    bonus: {
      EUR: 1.00,
      USD: 1.00,
    },
    totalCredits: {
      EUR: 51.00,
      USD: 51.00,
    },
    badge: '+2% Bonus' as string | undefined,
    description: {
      EUR: tx({ de: 'Für regelmäßige Nutzung', en: 'For regular use', es: 'Para uso regular' }),
      USD: 'For regular use',
    },
    popular: false,
    bestValue: false,
  },
  pro: {
    id: 'pro',
    name: {
      EUR: 'Pro Pack',
      USD: 'Pro Pack',
    },
    price: {
      EUR: 100,
      USD: 100,
    },
    bonusPercent: 6,
    bonus: {
      EUR: 6.00,
      USD: 6.00,
    },
    totalCredits: {
      EUR: 106.00,
      USD: 106.00,
    },
    badge: '+6% Bonus' as string | undefined,
    popular: true,
    description: {
      EUR: tx({ de: 'Beste Preis-Leistung', en: 'Best value', es: 'Mejor precio-rendimiento' }),
      USD: 'Best value',
    },
    bestValue: false,
  },
  enterprise: {
    id: 'enterprise',
    name: {
      EUR: 'Enterprise Pack',
      USD: 'Enterprise Pack',
    },
    price: {
      EUR: 250,
      USD: 250,
    },
    bonusPercent: 15,
    bonus: {
      EUR: 37.50,
      USD: 37.50,
    },
    totalCredits: {
      EUR: 287.50,
      USD: 287.50,
    },
    badge: '+15% Bonus' as string | undefined,
    bestValue: true,
    description: {
      EUR: tx({ de: 'Maximaler Bonus', en: 'Maximum bonus', es: 'Bonificación máxima' }),
      USD: 'Maximum bonus',
    },
    popular: false,
  },
} as const;

export type AIVideoCreditPackId = keyof typeof AI_VIDEO_CREDIT_PACKS;

// Stripe Price ID Mapping
export const AI_VIDEO_STRIPE_PRICE_MAP: Record<AIVideoCreditPackId, Record<Currency, string>> = {
  starter: {
    EUR: 'price_1TzLPV1xgyPAUyx6NqoJ9nIK', // Deutsch - 10€
    USD: 'price_1TzLRH1xgyPAUyx6q00iYt0M', // English - $10
  },
  standard: {
    EUR: 'price_1TzLQ11xgyPAUyx6orEA7320', // Deutsch - 50€
    USD: 'price_1TzLRv1xgyPAUyx6b903vSQ8', // English - $50
  },
  pro: {
    EUR: 'price_1TzLQZ1xgyPAUyx6L7pojKRa', // Deutsch - 100€
    USD: 'price_1TzLSF1xgyPAUyx6Lu2s3dz2', // English - $100
  },
  enterprise: {
    EUR: 'price_1TzLQp1xgyPAUyx6iF7LIwKm', // Deutsch - 250€
    USD: 'price_1TzLSe1xgyPAUyx6rcWxqFo2', // English - $250
  },
};

// Helper function to get Stripe Price ID
export const getAIVideoStripePriceId = (packId: AIVideoCreditPackId, currency: Currency): string => {
  return AI_VIDEO_STRIPE_PRICE_MAP[packId][currency];
};

export const AI_VIDEO_PRICING = {
  minDuration: 5,      // seconds
  maxDuration: 30,     // seconds
  defaultDuration: 10, // seconds
} as const;

// Pricing policy (20.08.2026): sell prices cut by 35% vs. the old 3.00x catalog; margin floor is now 1.75x provider cost. Canonical source: src/lib/cost/videoPricingCatalog.ts
export const AI_VIDEO_MODELS = {
  'sora-2-standard': {
    name: 'Sora 2 Standard',
    provider: 'OpenAI (Replicate)',
    costPerSecond: {
      EUR: 0.22,
      USD: 0.22,
    },
    maxDuration: 30,
    description: tx({ de: 'Hochwertige AI-Videos ab 2,20 € pro 10 Sekunden', en: 'High-quality AI videos from €2.20 ​​per 10 seconds', es: 'Vídeos con IA de alta calidad desde 2,20 € por 10 segundos' }),
    badge: 'Premium-Engine',
  },
  'sora-2-pro': {
    name: 'Sora 2 Pro',
    provider: 'OpenAI (Replicate)',
    costPerSecond: {
      EUR: 1.08,
      USD: 1.08,
    },
    maxDuration: 30,
    description: tx({ de: 'Premium-Qualität ab 10,80 € pro 10 Sekunden', en: 'Premium quality from €10.80 per 10 seconds', es: 'Calidad premium desde 10,80 € los 10 segundos' }),
    badge: 'Premium-Engine',
  },
} as const;

export type AIVideoModel = keyof typeof AI_VIDEO_MODELS;
