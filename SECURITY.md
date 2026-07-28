# Security Policy

## Reporting a Vulnerability

We take the security of AdTool AI (`useadtool.ai`, `captiongenie.app`) seriously.

**Please email:** `security@useadtool.ai`

For sensitive reports, request our PGP key in your first message and we will
provide it before you send technical details.

### What to include

- A clear description of the issue and its impact
- Steps to reproduce (proof-of-concept preferred)
- Affected URL(s), account(s), or component(s)
- Your name / handle for credit (optional)

### What to expect

| Stage             | Target                     |
| ----------------- | -------------------------- |
| First response    | within 48 hours            |
| Triage & severity | within 5 business days     |
| Fix + disclosure  | within 30 days (Critical: 7) |

### Safe-harbor

Good-faith research on the scope below is welcomed and will not be pursued
legally, provided you:

- do not access, modify, or exfiltrate data that isn't yours,
- do not run automated scans that degrade service (no DDoS, no volumetric
  brute-force),
- give us reasonable time to fix before public disclosure,
- respect user privacy at all times.

### In scope

- `useadtool.ai`, `captiongenie.app`, and their subdomains
- Supabase Edge Functions under `functions.useadtool.ai` and equivalent
- Authentication, payment, and Cast-&-World storage flows

### Out of scope

- Third-party infrastructure (Supabase-managed control plane, Cloudflare,
  Stripe, Replicate, HappyHorse, Sync.so)
- Social-engineering, physical attacks, or attacks against our staff
- Denial-of-service, volumetric abuse, or resource-exhaustion attacks
- Reports based solely on scanner output without demonstrable impact
- Missing best-practice headers on preview / staging subdomains

### Rewards

We currently run a private bounty program (Intigriti). Reach out to be
invited once your first valid report has been triaged.

Indicative reward bands (EUR):

| Severity | Reward       |
| -------- | ------------ |
| Critical | 1,500        |
| High     | 500          |
| Medium   | 150          |
| Low      | 50 or swag   |

Thank you for helping keep our users safe.
