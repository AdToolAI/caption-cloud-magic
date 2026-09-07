import { tx } from "@/lib/i18nText";
import { Currency } from './pricing';
import type { PaymentCurrency } from './stripe';

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

// Stripe Price ID Mapping — Konto „AdTool AI" (acct_1SLqO0DRu4kfSFxj).
// Zahlungswährung ist unabhängig von der Gutschrift: jedes Paket schreibt in
// jeder Währung exakt dieselbe Credit-Menge gut (siehe totalCredits oben).
export const AI_VIDEO_STRIPE_PRICE_MAP: Record<AIVideoCreditPackId, Record<PaymentCurrency, string>> = {
  starter: {
    EUR: 'price_1SWOEBDRu4kfSFxjUBaTMzcY', // 10,00 €
    USD: 'price_1UDAYsDRu4kfSFxjEnz03Hef', // $10.00
    GBP: 'price_1UDAYsDRu4kfSFxjkUZmMpGc', // £10.00
  },
  standard: {
    EUR: 'price_1SWOFXDRu4kfSFxjX6amIvWL', // 50,00 €
    USD: 'price_1UDAciDRu4kfSFxjZzvztB3n', // $50.00
    GBP: 'price_1UDAciDRu4kfSFxjBlIx9eMA', // £50.00
  },
  pro: {
    EUR: 'price_1SWOHkDRu4kfSFxjxURoJ2JP', // 100,00 €
    USD: 'price_1UDAfdDRu4kfSFxjlkHaKdkI', // $100.00
    GBP: 'price_1UDAfdDRu4kfSFxjw46PwUY4', // £100.00
  },
  enterprise: {
    EUR: 'price_1SWOJGDRu4kfSFxj03qDB5Fj', // 250,00 €
    USD: 'price_1UDAi8DRu4kfSFxj8rhhmDUK', // $250.00
    GBP: 'price_1UDAi8DRu4kfSFxjULeSYc7c', // £250.00
  },
};

// Helper function to get Stripe Price ID
export const getAIVideoStripePriceId = (
  packId: AIVideoCreditPackId,
  currency: PaymentCurrency,
): string => {
  return AI_VIDEO_STRIPE_PRICE_MAP[packId][currency] ?? AI_VIDEO_STRIPE_PRICE_MAP[packId].EUR;
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
