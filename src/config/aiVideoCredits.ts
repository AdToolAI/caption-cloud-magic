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

// Stripe Price ID Mapping (to be filled with actual Stripe Price IDs)
export const AI_VIDEO_STRIPE_PRICE_MAP: Record<AIVideoCreditPackId, Record<Currency, string>> = {
  starter: {
    EUR: 'price_STARTER_EUR_PLACEHOLDER', // User muss echte Price ID eintragen
    USD: 'price_STARTER_USD_PLACEHOLDER',
  },
  standard: {
    EUR: 'price_STANDARD_EUR_PLACEHOLDER',
    USD: 'price_STANDARD_USD_PLACEHOLDER',
  },
  pro: {
    EUR: 'price_PRO_EUR_PLACEHOLDER',
    USD: 'price_PRO_USD_PLACEHOLDER',
  },
  enterprise: {
    EUR: 'price_ENTERPRISE_EUR_PLACEHOLDER',
    USD: 'price_ENTERPRISE_USD_PLACEHOLDER',
  },
};

// Helper function to get Stripe Price ID
export const getAIVideoStripePriceId = (packId: AIVideoCreditPackId, currency: Currency): string => {
  return AI_VIDEO_STRIPE_PRICE_MAP[packId][currency];
};

export const AI_VIDEO_PRICING = {
  costPerSecond: {
    EUR: 0.61,
    USD: 0.61,
  },
  minDuration: 5,      // seconds
  maxDuration: 30,     // seconds
  defaultDuration: 10, // seconds
} as const;

export const AI_VIDEO_MODELS = {
  'sora-2': {
    name: 'Sora 2',
    provider: 'OpenAI via Artlist.io',
    costPerSecond: 0.61,
    maxDuration: 30,
    description: 'Höchste Qualität, photorealistisch',
    badge: 'Premium',
  },
} as const;

export type AIVideoModel = keyof typeof AI_VIDEO_MODELS;
