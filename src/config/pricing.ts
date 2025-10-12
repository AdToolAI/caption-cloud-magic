export const pricing = {
  free: {
    name: "Free",
    price: 0,
    currency: "€",
    period: "forever",
    path: "/auth?plan=free",
    features: {
      captions: 20,
      brands: 1,
      watermark: true,
      hashtags: false,
      analytics: false,
      team: false,
      support: "community"
    }
  },
  basic: {
    name: "Basic",
    price: 9.99,
    currency: "€",
    period: "month",
    checkout: process.env.VITE_STRIPE_LINK_BASIC || "",
    priceId: process.env.VITE_STRIPE_PRICE_BASIC || "",
    features: {
      captions: 200,
      brands: 2,
      watermark: false,
      hashtags: true,
      analytics: false,
      team: false,
      support: "email"
    }
  },
  pro: {
    name: "Pro",
    price: 29.99,
    currency: "€",
    period: "month",
    checkout: process.env.VITE_STRIPE_LINK_PRO || "",
    priceId: process.env.VITE_STRIPE_PRICE_PRO || "",
    features: {
      captions: Infinity,
      brands: Infinity,
      watermark: false,
      hashtags: true,
      analytics: true,
      team: true,
      support: "priority"
    }
  }
};

export type PlanTier = keyof typeof pricing;

export function hasAccess(userPlan: PlanTier, feature: string): boolean {
  const plan = pricing[userPlan];
  if (!plan) return false;

  switch (feature) {
    case "analytics":
      return plan.features.analytics;
    case "team":
      return plan.features.team;
    case "hashtags":
      return plan.features.hashtags;
    case "unlimited_brands":
      return plan.features.brands === Infinity;
    case "no_watermark":
      return !plan.features.watermark;
    default:
      return true;
  }
}
