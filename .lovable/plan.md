

## Plan: Language-Based Currency Display (EN→USD, DE/ES→EUR)

### Problem
All pricing displays are hardcoded to show € (EUR) regardless of UI language. The user wants English UI to show USD ($) and Spanish UI to keep EUR (€).

### Approach
Add a helper that maps language to currency: `en→USD`, `de→EUR`, `es→EUR`. Use this across all pricing-related components to pick the correct symbol and formatted price.

### Files to Change

| File | Changes |
|------|---------|
| **`src/lib/currency.ts`** | Add `getCurrencyForLanguage(lang): Currency` helper (`en→USD`, `de/es→EUR`) |
| **`src/lib/translations.ts`** | Update EN `pricingPage` prices to USD values with `$` symbol; keep DE/ES with `€`. Add `currency` field to EN basic/enterprise plans (currently missing). |
| **`src/pages/Pricing.tsx`** | Replace hardcoded `€{plan.price}` with dynamic currency symbol from language |
| **`src/components/landing/PricingSection.tsx`** | Replace hardcoded `€{plan.price}` with dynamic symbol |
| **`src/pages/Home.tsx`** | Replace 3 hardcoded `€` price displays with language-aware currency |
| **`src/components/performance/PlanLimitDialog.tsx`** | Use language-based currency instead of hardcoded `.price.EUR` |
| **`src/components/pricing/QuickPostUpsellModal.tsx`** | Localize hardcoded German price strings |
| **`src/components/account/SubscriptionTab.tsx`** | Replace `{planInfo.price}€` and `pro Monat` with localized versions |
| **`src/pages/Credits.tsx`** | Localize credit pack prices |
| **`src/components/ai-video/AIVideoCreditPurchase.tsx`** | Default currency from language instead of `detectUserCurrency()` |

### Translation Key Updates

**EN prices** change from `"14.95"` / `currency: "€"` to `"14.95"` / `currency: "$"` (and similar for Pro/Enterprise).
**DE/ES prices** stay as-is with `€`.

### Technical Detail

```typescript
// src/lib/currency.ts - new helper
export const getCurrencyForLanguage = (language: string): Currency => {
  return language === 'en' ? 'USD' : 'EUR';
};
```

Components will use `getCurrencyForLanguage(language)` to determine which currency symbol and price to display dynamically.

