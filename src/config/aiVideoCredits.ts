export const AI_VIDEO_CREDIT_PACKS = {
  starter: {
    id: 'starter',
    name: 'Starter Pack',
    priceEuros: 10,
    bonusPercent: 0,
    bonusEuros: 0,
    totalCredits: 10.00,
    description: 'Perfekt zum Ausprobieren',
    badge: undefined as string | undefined,
    popular: false,
    bestValue: false,
  },
  standard: {
    id: 'standard',
    name: 'Standard Pack',
    priceEuros: 50,
    bonusPercent: 2,
    bonusEuros: 1.00,
    totalCredits: 51.00,
    badge: '+2% Bonus' as string | undefined,
    description: 'Für regelmäßige Nutzung',
    popular: false,
    bestValue: false,
  },
  pro: {
    id: 'pro',
    name: 'Pro Pack',
    priceEuros: 100,
    bonusPercent: 6,
    bonusEuros: 6.00,
    totalCredits: 106.00,
    badge: '+6% Bonus' as string | undefined,
    popular: true,
    description: 'Beste Preis-Leistung',
    bestValue: false,
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise Pack',
    priceEuros: 250,
    bonusPercent: 15,
    bonusEuros: 37.50,
    totalCredits: 287.50,
    badge: '+15% Bonus' as string | undefined,
    bestValue: true,
    description: 'Maximaler Bonus',
    popular: false,
  },
} as const;

export type AIVideoCreditPackId = keyof typeof AI_VIDEO_CREDIT_PACKS;

export const AI_VIDEO_PRICING = {
  costPerSecond: 0.61, // Euro per second (60% profit margin)
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
