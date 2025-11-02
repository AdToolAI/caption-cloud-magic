# PostHog Dashboard Setup Guide

## 📊 Dashboard 1: Performance SLO

### Insight 1: P95 Latenz pro Function
```
Type: Trend (Line Chart)
Event: edge_fn_call
Metric: Property Value (duration_ms) - Percentile 95
Group by: function_name
Time Range: Last 24 hours
Interval: Hourly
```

**Alert:** P95 > 800ms for 5 minutes → Slack

### Insight 2: Success Rate %
```
Type: Number
Formula: (countIf(success = true) / count()) * 100
Event: edge_fn_call
Time Range: Last 1 hour
```

### Insight 3: Error Rate by Function
```
Type: Bar Chart
Event: edge_fn_call
Filter: success = false
Metric: Total Count
Group by: function_name
Time Range: Last 6 hours
```

**Alert:** Error rate > 0.5% for 5 minutes → Slack + Email

### Insight 4: Requests per Minute
```
Type: Trend (Line Chart)
Event: edge_fn_call
Metric: Total Count
Group by: function_name
Interval: 1 minute
Time Range: Last 3 hours
```

---

## 🔄 Dashboard 2: Queue Health

### Insight 1: Pending Jobs Count (Live)
```
Type: Number
Source: Direct SQL Query to Supabase
Query: SELECT COUNT(*) FROM ai_jobs WHERE status = 'pending'
Refresh: Every 30 seconds
```

### Insight 2: Average Job Processing Time
```
Type: Trend
Event: ai_job_completed
Metric: Property Value (duration_ms) - Average
Time Range: Last 1 hour
Interval: 5 minutes
```

### Insight 3: Job Completion vs Failed
```
Type: Stacked Bar Chart
Events: ai_job_completed, ai_job_failed
Metric: Total Count
Time Range: Last 24 hours
Interval: Hourly
```

### Insight 4: Retry Rate by Job Type
```
Type: Pie Chart
Event: ai_job_failed
Filter: retry_count > 0
Group by: job_type
Time Range: Last 24 hours
```

**Alert:** Job backlog > 500 → Slack

---

## 🚦 Dashboard 3: Rate Limit Monitoring

### Insight 1: 429 Errors by Plan
```
Type: Bar Chart
Event: rate_limit_hit
Metric: Total Count
Group by: plan
Time Range: Last 1 hour
```

### Insight 2: Top 10 Rate-Limited Users
```
Type: Table
Event: rate_limit_hit
Columns: distinct_id, plan, count()
Sort by: count() DESC
Limit: 10
Time Range: Last 24 hours
```

### Insight 3: Rate Limit Hit Rate %
```
Type: Number
Formula: (count(rate_limit_hit) / count(edge_fn_call)) * 100
Time Range: Last 1 hour
```

**Target:** < 5% rate limit hit rate

### Insight 4: Concurrent Jobs Timeline
```
Type: Trend
Event: ai_job_started
Metric: Property Value (current_jobs)
Time Range: Last 6 hours
Interval: 10 minutes
```

---

## 💼 Dashboard 4: Business Metrics

### Insight 1: User Journey Funnel
```
Type: Funnel
Steps:
  1. User Sign Up (auth.users table)
  2. campaign_generated (first)
  3. post_published (first)
  4. Subscription Active (profiles.plan != 'free')
  
Time Range: Last 30 days
```

**Target Conversion Rates:**
- Step 1→2: > 60%
- Step 2→3: > 80%
- Step 3→4: > 15%

### Insight 2: Daily Active Users (DAU)
```
Type: Trend
Event: Any event
Metric: Unique Users
Time Range: Last 30 days
Interval: Daily
```

### Insight 3: Feature Usage
```
Type: Bar Chart
Events: 
  - campaign_generated
  - post_published
  - workspace_created
  - bio_generated
Metric: Total Count
Time Range: Last 7 days
```

### Insight 4: Revenue Events
```
Type: Trend
Event: subscription_activated
Properties: plan, amount
Time Range: Last 90 days
Interval: Weekly
```

---

## 🔔 Alert Configuration

### Critical Alerts (P0) - Immediate Response

**1. High P95 Latency**
```
Name: High P95 Latency
Insight: Performance SLO → P95 Latenz
Threshold: > 800ms
Duration: 5 minutes
Channels: Slack (#alerts), Email (ops@useadtool.ai)
```

**2. High Error Rate**
```
Name: High Error Rate
Insight: Performance SLO → Error Rate
Threshold: > 1%
Duration: 5 minutes
Channels: Slack (#alerts), Email
```

**3. DB Connection Pool Critical**
```
Name: DB Pool Exhausted
Custom Metric: Supabase DB Connections
Threshold: > 90 connections (of 100)
Duration: 2 minutes
Channels: Slack, PagerDuty (if available)
```

### Warning Alerts (P1) - Monitor

**4. Queue Backlog Growing**
```
Name: AI Queue Backlog
Insight: Queue Health → Pending Jobs
Threshold: > 500 jobs
Duration: 10 minutes
Channels: Slack (#dev)
```

**5. High Rate Limit Hit Rate**
```
Name: High Rate Limiting
Insight: Rate Limit → Hit Rate
Threshold: > 10% of requests
Duration: 10 minutes
Channels: Slack (#dev)
```

**6. Stale Jobs**
```
Name: Jobs Stuck in Processing
Custom SQL: SELECT COUNT(*) FROM ai_jobs WHERE status='processing' AND processing_started_at < now() - INTERVAL '10 minutes'
Threshold: > 10
Channels: Slack (#dev)
```

### Info Alerts (P2) - Daily Summary

**7. Daily Report**
```
Name: Daily Performance Report
Schedule: Every day at 8:00 AM
Content:
  - Total Requests (edge_fn_call)
  - Average P95 Latency
  - Error Rate
  - New Signups
  - Revenue Generated
Channels: Email (team@useadtool.ai)
```

---

## 📈 Custom Metrics für PostHog

### Metric 1: API Throughput (RPS)
```javascript
// In Edge Functions
posthog.capture('api_throughput', {
  requests_per_second: currentRPS,
  timestamp: Date.now()
});
```

### Metric 2: Database Query Performance
```javascript
posthog.capture('db_query_performance', {
  query_name: 'fetch_content_items',
  duration_ms: queryDuration,
  rows_returned: data.length
});
```

### Metric 3: Credit Usage
```javascript
posthog.capture('credit_deducted', {
  user_id: userId,
  feature: 'campaign_generation',
  credits: 5,
  remaining_balance: newBalance
});
```

---

## 🔍 Analysis Queries

### User Cohort Analysis
```
Cohort: Users who signed up in January 2025
Metric: campaign_generated (count)
Time Range: First 30 days after signup
Group by: Week
```

### Feature Retention
```
Event: campaign_generated
Metric: Unique Users (Daily)
Time Range: Last 30 days
Retention Window: 7 days
```

### Performance Degradation Detection
```
Event: edge_fn_call
Metric: duration_ms (P95)
Comparison: Current week vs Previous week
Filter: function_name = 'generate-campaign'
```

---

## Integration mit Frontend (Optional)

### PostHog Client-Side Events
```typescript
// src/lib/analytics.ts
export function trackUserAction(action: string, properties?: Record<string, any>) {
  if (typeof window !== 'undefined' && (window as any).posthog) {
    (window as any).posthog.capture(action, properties);
  }
}

// Usage in React Components:
trackUserAction('campaign_created_ui', {
  post_count: 5,
  platforms: ['instagram'],
  timestamp: Date.now()
});
```

---

## Testing der Telemetrie

### 1. Manual Event Test
```bash
curl -X POST https://eu.i.posthog.com/capture/ \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "YOUR_POSTHOG_KEY",
    "event": "test_event",
    "properties": {
      "test": true
    },
    "distinct_id": "test-user"
  }'
```

### 2. Edge Function Call Test
```bash
# Generate test load
for i in {1..50}; do
  curl -X POST https://lbunafpxuskwmsrraqxl.supabase.co/functions/v1/generate-campaign \
    -H "Authorization: Bearer YOUR_ANON_KEY" \
    -H "Content-Type: application/json" \
    -d '{"topic": "Test"}' &
done

# Check PostHog for edge_fn_call events
```

---

**Status: ✅ WEEK 2 COMPLETE**

Next: Week 3 (Circuit-Breaker + Exactly-Once Guarantees) 🎯
