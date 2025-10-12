# CaptionGenie Production Setup Guide

## ✅ Completed Features

### 1. Database & Authentication
- ✅ Extended `profiles` table with subscription fields (plan, stripe_customer_id, subscription_status, etc.)
- ✅ Added brand customization fields (brand_name, brand_color)
- ✅ Added onboarding tracking (onboarding_completed)
- ✅ Auth system already configured (email/password supported)

### 2. Pricing & Plans
- ✅ Pricing configuration in `src/config/pricing.ts`
- ✅ Three tiers: Free (€0), Basic (€9.99), Pro (€29.99)
- ✅ Feature access control utilities
- ✅ Upgrade modal component for locked features

### 3. Onboarding Flow
- ✅ Route: `/onboarding`
- ✅ 3-step wizard: Language → Plan → Brand setup
- ✅ Integrated with Stripe checkout
- ✅ Persists language preference

### 4. Billing & Invoices
- ✅ Route: `/billing`
- ✅ Stripe Customer Portal integration
- ✅ Invoice list with download links
- ✅ Multilingual (EN/DE/ES)
- ✅ Edge functions: `customer-portal`, `get-invoices`, `create-checkout`

### 5. Internationalization (i18n)
- ✅ Language switcher component (EN/DE/ES)
- ✅ Persistent language preference
- ✅ Translated: Billing, FAQ, Support, Legal pages

### 6. Legal Pages
- ✅ Route: `/legal/:page`
- ✅ Privacy Policy (`/legal/privacy`)
- ✅ Terms of Service (`/legal/terms`)
- ✅ Imprint (`/legal/imprint`)
- ✅ Multilingual content

### 7. Navigation & Routes
- ✅ All routes working: /pricing, /faq, /billing, /support, /onboarding
- ✅ Updated Footer with legal links
- ✅ Updated Sidebar with Support link

### 8. TypeScript & Build
- ✅ Fixed all TypeScript errors in edge functions
- ✅ Type-safe pricing configuration
- ✅ Build passing

## ⚙️ Required Configuration

### 1. Stripe Setup

#### a) Create Products & Prices in Stripe Dashboard
1. Go to [Stripe Dashboard](https://dashboard.stripe.com/products)
2. Create two products:
   - **Basic Plan**: €9.99/month
   - **Pro Plan**: €29.99/month
3. Copy the price IDs (they look like `price_1AbCdEfG...`)

#### b) Update Pricing Config
Edit `src/config/pricing.ts` and replace:
```typescript
basic: {
  priceId: "price_YOUR_BASIC_PRICE_ID", // Replace with actual ID
  // ...
}
pro: {
  priceId: "price_YOUR_PRO_PRICE_ID", // Replace with actual ID
  // ...
}
```

#### c) Configure Stripe Portal
1. Go to [Stripe Customer Portal Settings](https://dashboard.stripe.com/settings/billing/portal)
2. Enable the Customer Portal
3. Configure which features customers can manage (payment methods, subscriptions, etc.)

#### d) Environment Variables
The following are already configured in Lovable Cloud:
- ✅ `STRIPE_SECRET_KEY` - Already set
- ✅ `STRIPE_PUBLISHABLE_KEY` - Already set

### 2. Email Setup (Support Tickets)

#### Option A: Use Resend (Recommended)
1. Sign up at [resend.com](https://resend.com)
2. Validate your email domain
3. Create an API key
4. The `RESEND_API_KEY` secret is already configured - just update it with your key

#### Option B: Use SMTP
Configure these environment variables (not yet set):
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SUPPORT_FROM="CaptionGenie <noreply@captiongenie.app>"`
- `SUPPORT_TO="support@captiongenie.app"`

### 3. Optional: Live Chat (Crisp)
To enable live chat on the Support page:
1. Sign up at [crisp.chat](https://crisp.chat)
2. Get your Website ID
3. Add environment variable: `CRISP_WEBSITE_ID`

### 4. Legal Content
Update the placeholder content in `src/pages/Legal.tsx`:
- Replace `[Your Company Name]` with your actual company name
- Replace `[Your Address]` with your actual address
- Replace `[Your Phone]` with your actual phone number
- Replace `[Your Name]` with your name
- Update email addresses to match your domain

## 🚀 Deployment Checklist

### Pre-Launch
- [ ] Update Stripe price IDs in `src/config/pricing.ts`
- [ ] Configure Stripe Customer Portal
- [ ] Set up Resend or SMTP for email
- [ ] Update legal pages with real company information
- [ ] Test full checkout flow (Free → Basic → Pro)
- [ ] Test billing portal access
- [ ] Test invoice downloads
- [ ] Test support contact form
- [ ] Verify all three languages (EN/DE/ES)

### Security
- [ ] Enable Stripe webhook security (if using webhooks)
- [ ] Review RLS policies on profiles table
- [ ] Configure password strength requirements in Supabase Auth
- [ ] Enable email confirmation (disable auto-confirm for production)

### SEO & Performance
- [ ] Update meta tags for each page
- [ ] Add proper page titles
- [ ] Test mobile responsiveness
- [ ] Test loading performance

## 📋 Feature Access Control

### Implementation Example
```typescript
import { hasAccess } from '@/lib/access-control';
import { UpgradeModal } from '@/components/UpgradeModal';

function MyFeature() {
  const { user } = useAuth();
  const [showUpgrade, setShowUpgrade] = useState(false);
  
  // Get user's plan from profile
  const userPlan = user?.plan || 'free';
  
  const handleFeatureClick = () => {
    if (!hasAccess(userPlan, 'analytics')) {
      setShowUpgrade(true);
      return;
    }
    // Use feature...
  };
  
  return (
    <>
      <Button onClick={handleFeatureClick}>
        Analytics Dashboard
      </Button>
      <UpgradeModal 
        open={showUpgrade} 
        onOpenChange={setShowUpgrade}
        feature="Advanced Analytics"
        requiredPlan="pro"
      />
    </>
  );
}
```

## 🔄 User Journey Flow

### New User
1. Visits `/` (redirects to `/home`)
2. Signs up at `/auth`
3. Redirected to `/onboarding`
   - Selects language (EN/DE/ES)
   - Chooses plan (Free/Basic/Pro)
   - Sets up brand (name + color)
4. Lands on `/home` with onboarding complete

### Upgrading User
1. Tries to use locked feature
2. Sees upgrade modal
3. Clicks "Upgrade Plan"
4. Redirected to `/pricing`
5. Clicks plan button → Opens Stripe Checkout (new tab)
6. Completes payment
7. Redirected back to app with active subscription

### Managing Billing
1. Goes to `/billing`
2. Clicks "Open Billing Portal"
3. Opens Stripe Customer Portal (new tab)
4. Can update payment method, cancel subscription, download invoices

## 🆘 Support

### Contact Form (`/support`)
- Sends email via Resend/SMTP
- Shows success confirmation
- Optional: Live chat widget if Crisp configured
- Links to FAQ

## 📝 Next Steps

### High Priority
1. **Configure Stripe** - Update price IDs and enable Customer Portal
2. **Set up Resend** - Enable support email functionality
3. **Update Legal Pages** - Replace placeholder content
4. **Test Checkout Flow** - End-to-end payment testing

### Medium Priority
5. Add subscription status display in header/account page
6. Implement feature usage tracking (e.g., captions used this month)
7. Add email templates for welcome, payment success, etc.
8. Configure Google Auth (optional)

### Low Priority
9. Add more FAQ content
10. Create onboarding walkthrough tour
11. Add analytics dashboard
12. Implement team workspace features

## 📧 Email Templates (Future)

When implementing transactional emails, create templates for:
- Welcome email (after signup)
- Payment successful
- Payment failed
- Subscription ending soon
- Plan changed
- Invoice receipt

Use Resend's template system or your SMTP provider's templates.

## 🔧 Troubleshooting

### "No Stripe customer found"
- User hasn't subscribed yet
- Check if `stripe_customer_id` is set in profiles table
- Verify Stripe webhook is working (if implemented)

### "Invoices not loading"
- Check `get-invoices` edge function logs
- Verify `STRIPE_SECRET_KEY` is set
- Ensure user has `stripe_customer_id` in profile

### "Checkout not opening"
- Verify price IDs are correct in `src/config/pricing.ts`
- Check `create-checkout` edge function logs
- Ensure Stripe publishable key is valid

## 📚 Additional Resources

- [Stripe Documentation](https://stripe.com/docs)
- [Resend Documentation](https://resend.com/docs)
- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Crisp Chat Setup](https://help.crisp.chat/en/)

---

**Status**: Core infrastructure ready for production. Requires Stripe configuration and email setup to go live.
