

## Plan: Remove Pricing Section from Landing Page

### Problem
The pricing cards are shown on the landing page overview, but they're redundant since pricing is already accessible via the top-right navigation ("Preise" / "Pricing" link).

### Changes

**`src/pages/Index.tsx`** — Remove lines 95-96 (the `<PricingSection />` component and its comment). Also remove the unused import of `PricingSection` on line 12.

That's it — a 3-line deletion. The `PricingSection` component file itself stays in the codebase in case it's used elsewhere (e.g. the dedicated pricing page).

