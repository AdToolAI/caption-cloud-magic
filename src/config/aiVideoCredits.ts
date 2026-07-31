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
    totalCredits: {
      EUR: 10.00,
      USD: 10.00,
    },
    description: {
      EUR: 'Perfekt zum Ausprobieren',
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
      EUR: 'Für regelmäßige Nutzung',
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
      EUR: 'Beste Preis-Leistung',
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
      EUR: 'Maximaler Bonus',
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

// Margin policy: exactly 3.00× Replicate cost (normalized 14.07.2026)
// Std: $0.20/s → €0.60/s | Pro: $0.45/s → €1.35/s
export const AI_VIDEO_MODELS = {
  'sora-2-standard': {
    name: 'Sora 2 Standard',
    provider: 'OpenAI (Replicate)',
    costPerSecond: {
      EUR: 0.60,
      USD: 0.60,
    },
    maxDuration: 30,
    description: 'Hochwertige AI-Videos ab 6,00€ pro 10 Sekunden',
    badge: 'Premium-Engine',
  },
  'sora-2-pro': {
    name: 'Sora 2 Pro',
    provider: 'OpenAI (Replicate)',
    costPerSecond: {
      EUR: 1.35,
      USD: 1.35,
    },
    maxDuration: 30,
    description: 'Premium-Qualität ab 13,50€ pro 10 Sekunden',
    badge: 'Premium-Engine',
  },
} as const;

export type AIVideoModel = keyof typeof AI_VIDEO_MODELS;
