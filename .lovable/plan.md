

## Plan: Restore Pricing on Landing Page + Remove from Overview

### Problem
The previous change incorrectly removed pricing from the **landing page** (Index.tsx) instead of the **logged-in Overview/Dashboard** (Home.tsx). The pricing cards at the bottom of the Overview page (Home.tsx, lines 738-884) are what should be removed, since logged-in users can already access pricing via the nav link.

### Changes

**`src/pages/Index.tsx`** — Re-add the `PricingSection` import and component between FeatureGrid and FAQ:
```tsx
import { PricingSection } from "@/components/landing/PricingSection";
// ...
<FeatureGrid />
<PricingSection />
{/* FAQ Section */}
```

**`src/pages/Home.tsx`** — Delete the entire Pricing Section block (lines 738-884), including the `{/* Pricing Section */}` comment and the `<section>` with all three plan cards. Also remove the now-unused `PRICING_V21` import and `Check` icon import if no longer used elsewhere in the file.

