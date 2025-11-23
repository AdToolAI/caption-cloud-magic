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
    EUR: 'price_1SWOEBDRu4kfSFxjUBaTMzcY', // Deutsch - 10€
    USD: 'price_1SWOLXDRu4kfSFxjB2f0WitH', // English - $10
  },
  standard: {
    EUR: 'price_1SWOFXDRu4kfSFxjX6amIvWL', // Deutsch - 50€
    USD: 'price_1SWOO5DRu4kfSFxj9t8ulY5g', // English - $50
  },
  pro: {
    EUR: 'price_1SWOHkDRu4kfSFxjxURoJ2JP', // Deutsch - 100€
    USD: 'price_1SWOPVDRu4kfSFxjhkMo0rqI', // English - $100
  },
  enterprise: {
    EUR: 'price_1SWOJGDRu4kfSFxj03qDB5Fj', // Deutsch - 250€
    USD: 'price_1SWOQbDRu4kfSFxjPWv0qH9u', // English - $250
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

export const AI_VIDEO_MODELS = {
  'sora-2-standard': {
    name: 'Sora 2 Standard',
    provider: 'OpenAI (Replicate)',
    costPerSecond: {
      EUR: 0.25,
      USD: 0.25,
    },
    maxDuration: 30,
    description: 'Hochwertige AI-Videos ab 2,50€ pro 10 Sekunden',
    badge: 'Empfohlen',
  },
  'sora-2-pro': {
    name: 'Sora 2 Pro',
    provider: 'OpenAI (Replicate)',
    costPerSecond: {
      EUR: 0.53,
      USD: 0.53,
    },
    maxDuration: 30,
    description: 'Premium-Qualität ab 5,30€ pro 10 Sekunden',
    badge: 'Premium',
  },
} as const;

export type AIVideoModel = keyof typeof AI_VIDEO_MODELS;
