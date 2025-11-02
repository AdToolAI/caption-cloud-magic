# 🚀 Production Deployment Guide

## Pre-Deployment Checklist

### 1. Security Validation ✅
```bash
# Run security audit
chmod +x scripts/security-audit.sh
./scripts/security-audit.sh
```

### 2. Load Testing ✅
```bash
# Install k6
brew install k6  # macOS
# or visit https://k6.io/docs/getting-started/installation/

# Run load tests locally
k6 run tests/load/generate-campaign.js -e ANON_KEY=your_anon_key
k6 run tests/load/planner-list.js -e ANON_KEY=your_anon_key
k6 run tests/load/publish-dispatch.js -e ANON_KEY=your_anon_key
```

### 3. Database Migrations ✅
All migrations are already applied. Verify with:
```bash
# Check migration status in Lovable Cloud Backend
```

### 4. Edge Functions Deployment ✅
Edge functions are auto-deployed with preview builds. Verify all functions are running:
- Check Edge Function logs in Lovable Cloud
- Test critical endpoints manually

---

## Production Environment Setup

### 1. PostHog Configuration 📊

**Create Feature Flags:**
1. Go to PostHog → Feature Flags
2. Create the following flags:
   - `worker_queue_enabled` (boolean, default: true)
   - `new_rate_limits` (boolean, default: false)
   - `advanced_analytics` (boolean, default: false)
   - `circuit_breaker_enabled` (boolean, default: true)

**Setup Dashboards:**
- **Performance SLO**: P95 latency, success rate, error rate
- **Queue Health**: Pending jobs, processing rate, failures
- **Rate Limit Monitoring**: Hit rate, blocked requests
- **Business Metrics**: DAU, campaigns created, posts published

**Configure Alerts:**
- High P95 Latency (>2000ms for 5 min)
- High Error Rate (>5% for 3 min)
- Queue Backlog (>100 jobs for 10 min)
- Circuit Breaker Open (immediate)

### 2. Cron Jobs Activation ⏰

**Enable AI Queue Worker:**
```sql
-- Run this in Lovable Cloud Backend SQL Editor
SELECT cron.schedule(
  'ai-queue-worker',
  '* * * * *', -- Every minute
  $$
  SELECT net.http_post(
    url := 'https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/ai-queue-worker',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxidW5hZnB4dXNrd21zcnJhcXhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxMjA3NzUsImV4cCI6MjA3NTY5Njc3NX0.gRvY8kUzrELzlhSdGNJj_CXsaT8mqaUO7F1jCEi2T7Y"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);
```

**Verify Cron Jobs:**
```sql
-- Check active cron jobs
SELECT * FROM cron.job;
```

### 3. Stripe Configuration 💳

**Switch to LIVE mode:**
1. Update Stripe secret key to LIVE key in Lovable Cloud secrets
2. Create live products and prices
3. Update webhook endpoint to production URL
4. Test checkout flow end-to-end

**Create Promo Codes:**
```bash
# Via Stripe Dashboard or CLI
stripe coupons create --percent-off 20 --duration once
```

### 4. Uptime Monitoring 📡

**Setup UptimeRobot monitors:**
- Main app: `https://your-app.lovable.app`
- Health endpoints:
  - `/functions/v1/health-ig`
  - `/functions/v1/health-tt`
  - `/functions/v1/health-li`
- Check interval: 5 minutes
- Alert channels: Email + Slack

---

## Deployment Process

### Step 1: Final Code Review
- [ ] All PRs merged to main branch
- [ ] No console.logs with PII
- [ ] All TODOs resolved
- [ ] Security audit passed

### Step 2: Database Backup
- [ ] Export current database state
- [ ] Store backup in secure location
- [ ] Document backup timestamp

### Step 3: Deploy
```bash
# Lovable auto-deploys on push to main
git push origin main

# Monitor deployment logs
# Check Lovable Cloud deployment status
```

### Step 4: Smoke Tests
- [ ] User signup/login works
- [ ] Campaign generation works
- [ ] Post publishing works
- [ ] Payment flow works
- [ ] Social media connections work

### Step 5: Monitor
- [ ] Check PostHog dashboards
- [ ] Monitor error rates in logs
- [ ] Verify cron jobs running
- [ ] Check queue processing

---

## Rollback Procedures

### Option 1: Quick Rollback (via Git)
```bash
# Revert to previous commit
git revert HEAD
git push origin main
```

### Option 2: Database Rollback
```sql
-- Restore from backup (if needed)
-- Contact Lovable support for database restoration
```

### Option 3: Feature Flag Rollback
```typescript
// Disable problematic features via PostHog
// No code deployment needed
```

---

## Performance Targets 🎯

| Metric | Target | Alert Threshold |
|--------|--------|----------------|
| P95 Latency | <1500ms | >2000ms |
| Error Rate | <2% | >5% |
| Uptime | >99.5% | <99% |
| Queue Processing | <30s | >60s |

---

## Emergency Contacts 🆘

- **Lovable Support**: support@lovable.dev
- **On-Call Engineer**: [Your contact]
- **PostHog Status**: https://status.posthog.com
- **Supabase Status**: https://status.supabase.com

---

## Post-Deployment Tasks

### Week 1
- [ ] Monitor error rates daily
- [ ] Check PostHog dashboards twice daily
- [ ] Review user feedback
- [ ] Analyze performance metrics

### Week 2
- [ ] Optimize slow queries (if any)
- [ ] Adjust rate limits based on usage
- [ ] Fine-tune circuit breaker thresholds
- [ ] Review and update alerts

### Month 1
- [ ] Conduct load test with real traffic patterns
- [ ] Review and optimize database indexes
- [ ] Analyze cost and optimize where possible
- [ ] Plan next iteration features

---

## Success Criteria ✨

- ✅ Zero critical bugs in first 48 hours
- ✅ P95 latency under target
- ✅ Error rate under 2%
- ✅ All cron jobs running successfully
- ✅ Payment processing working flawlessly
- ✅ No user-reported auth issues

---

**Last Updated**: 2025-11-02  
**Version**: 1.0.0  
**Status**: Production Ready 🚀
