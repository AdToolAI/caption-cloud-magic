import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getRedisCache } from '../_shared/redis-cache.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const POSTHOG_PROJECT_ID = Deno.env.get('POSTHOG_PROJECT_ID');
const POSTHOG_API_KEY = Deno.env.get('POSTHOG_PERSONAL_API_KEY');
const redis = getRedisCache();

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, startDate, endDate, compareEnabled, filters, forceRefresh } = await req.json();

    if (action === 'getMetrics') {
      console.log('[PostHog Analytics] Fetching metrics from PostHog API');
      
      if (!POSTHOG_PROJECT_ID || !POSTHOG_API_KEY) {
        console.error('[PostHog Analytics] Missing API credentials');
        return new Response(
          JSON.stringify({ error: 'PostHog credentials not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const metrics = await getCachedMetrics(
        startDate, 
        endDate, 
        compareEnabled || false, 
        filters || {},
        forceRefresh || false
      );

      return new Response(
        JSON.stringify(metrics),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[PostHog Analytics] Error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function queryPostHog(query: string) {
  const response = await fetch(`https://eu.i.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/query/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${POSTHOG_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('[PostHog API] Error:', error);
    throw new Error(`PostHog API error: ${response.status}`);
  }

  return await response.json();
}

async function getRecentEvents() {
  console.log('[PostHog Analytics] Fetching recent events...');
  
  const query = `
    SELECT 
      event,
      timestamp,
      distinct_id,
      properties
    FROM events
    WHERE timestamp >= now() - INTERVAL 1 HOUR
    ORDER BY timestamp DESC
    LIMIT 50
  `;

  const result = await queryPostHog(query);
  return result.results || [];
}

interface AnalyticsFilters {
  planTypes?: string[];
  signupMethods?: string[];
  userStatus?: string[];
}

// Generate cache key for Redis
function generateCacheKey(
  startDate: string | undefined,
  endDate: string | undefined,
  compareEnabled: boolean,
  filters: AnalyticsFilters
): string {
  // Round to 5-minute interval for better hit rate
  const roundedTime = Math.floor(Date.now() / (5 * 60 * 1000)) * (5 * 60 * 1000);
  
  const start = startDate ? startDate.split('T')[0] : 'last30d';
  const end = endDate ? endDate.split('T')[0] : 'today';
  
  const filterHash = JSON.stringify({
    plans: filters.planTypes?.sort() || [],
    methods: filters.signupMethods?.sort() || [],
    status: filters.userStatus?.sort() || []
  });
  
  return redis.generateKeyHash('posthog_metrics', {
    start,
    end,
    compare: compareEnabled,
    filters: filterHash,
    interval: roundedTime
  });
}

// Cached wrapper for getRealMetrics
async function getCachedMetrics(
  startDate?: string,
  endDate?: string,
  compareEnabled = false,
  filters: AnalyticsFilters = {},
  forceRefresh = false
) {
  const cacheKey = generateCacheKey(startDate, endDate, compareEnabled, filters);
  
  // Check cache first (unless forceRefresh)
  if (!forceRefresh && redis.isEnabled()) {
    const cached = await redis.get(cacheKey, { logHits: true });
    if (cached) {
      console.log('[PostHog Analytics] ✅ Cache HIT:', cacheKey);
      return { ...cached, _cached: true };
    }
  }
  
  console.log('[PostHog Analytics] ❌ Cache MISS - fetching from PostHog API');
  
  // Fetch fresh data
  const metrics = await getRealMetrics(startDate, endDate, compareEnabled, filters);
  
  // Cache result with 5-minute TTL (300 seconds)
  if (redis.isEnabled()) {
    await redis.set(cacheKey, metrics, 300);
    console.log('[PostHog Analytics] 💾 Cached metrics for 5 minutes');
  }
  
  return { ...metrics, _cached: false };
}

function buildFilterClauses(filters: AnalyticsFilters): string {
  const clauses: string[] = [];

  if (filters.planTypes && filters.planTypes.length > 0) {
    const planList = filters.planTypes.map(p => `'${p}'`).join(', ');
    clauses.push(`JSONExtractString(properties, 'plan_type') IN (${planList})`);
  }

  if (filters.signupMethods && filters.signupMethods.length > 0) {
    const methodList = filters.signupMethods.map(m => `'${m}'`).join(', ');
    clauses.push(`JSONExtractString(properties, 'signup_method') IN (${methodList})`);
  }

  if (filters.userStatus && filters.userStatus.length > 0) {
    const statusClauses: string[] = [];
    if (filters.userStatus.includes('new')) {
      statusClauses.push(`JSONExtractInt(properties, 'account_age_days') <= 7`);
    }
    if (filters.userStatus.includes('active')) {
      statusClauses.push(`JSONExtractInt(properties, 'days_since_last_active') <= 7`);
    }
    if (filters.userStatus.includes('churned')) {
      statusClauses.push(`JSONExtractInt(properties, 'days_since_last_active') >= 30`);
    }
    if (statusClauses.length > 0) {
      clauses.push(`(${statusClauses.join(' OR ')})`);
    }
  }

  return clauses.length > 0 ? `AND ${clauses.join(' AND ')}` : '';
}

async function getRealMetrics(startDate?: string, endDate?: string, compareEnabled = false, filters: AnalyticsFilters = {}) {
  console.log('[PostHog Analytics] Fetching real metrics from PostHog');
  
  // Default to last 30 days if no date range provided
  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const end = endDate || new Date().toISOString();
  
  // Calculate previous period for comparison (same length as current period)
  const periodLength = new Date(end).getTime() - new Date(start).getTime();
  const prevStart = new Date(new Date(start).getTime() - periodLength).toISOString();
  const prevEnd = start;
  
  const filterClauses = buildFilterClauses(filters);
  console.log('[PostHog Analytics] Date range:', { start, end, compareEnabled, prevStart, prevEnd });
  console.log('[PostHog Analytics] Active filters:', filters, 'Filter clauses:', filterClauses);
  
  try {
    // Parallel queries for all metrics including retention, time-based metrics, payment tracking, dropoff analysis, and recent events
    const [
      signups,
      firstPosts,
      activeUsers,
      onboardingStarted,
      onboardingCompleted,
      upgradeClicked,
      limitReached,
      retentionDay1,
      retentionDay7,
      retentionDay30,
      cohortData,
      avgTimeToPost,
      avgOnboardingDuration,
      paymentCompleted,
      topUpgradeTriggers,
      onboardingDropoff,
      signupToPreviousPeriod,
      onboardingPreviousPeriod,
      upgradePreviousPeriod,
      recentEventsResult
    ] = await Promise.all([
      // Signup count
      queryPostHog(`
        SELECT count() as signups
        FROM events
        WHERE event = 'user_signed_up'
        AND timestamp >= '${start}' AND timestamp < '${end}'
        ${filterClauses}
      `),
      
      // First posts
      queryPostHog(`
        SELECT count(DISTINCT person_id) as first_posts
        FROM events
        WHERE event = 'post_created'
        AND timestamp >= '${start}' AND timestamp < '${end}'
        ${filterClauses}
      `),
      
      // Active users (within selected date range)
      queryPostHog(`
        SELECT count(DISTINCT person_id) as active_users
        FROM events
        WHERE timestamp >= '${start}' AND timestamp < '${end}'
        ${filterClauses}
      `),
      
      // Onboarding started
      queryPostHog(`
        SELECT count() as started
        FROM events
        WHERE event = 'onboarding_started'
        AND timestamp >= '${start}' AND timestamp < '${end}'
        ${filterClauses}
      `),
      
      // Onboarding completed
      queryPostHog(`
        SELECT count() as completed
        FROM events
        WHERE event = 'onboarding_completed'
        AND timestamp >= '${start}' AND timestamp < '${end}'
        ${filterClauses}
      `),
      
      // Upgrade clicks
      queryPostHog(`
        SELECT count() as clicks
        FROM events
        WHERE event = 'upgrade_clicked'
        AND timestamp >= '${start}' AND timestamp < '${end}'
        ${filterClauses}
      `),
      
      // Usage limit reached
      queryPostHog(`
        SELECT count() as reached
        FROM events
        WHERE event = 'usage_limit_reached'
        AND timestamp >= '${start}' AND timestamp < '${end}'
        ${filterClauses}
      `),
      
      // Day 1 Retention (current vs previous 30 days)
      queryPostHog(`
        WITH user_signups AS (
          SELECT 
            person_id,
            min(timestamp) as signup_date
          FROM events
          WHERE event = 'user_signed_up'
          AND timestamp >= now() - INTERVAL 60 DAY
          GROUP BY person_id
        ),
        day1_activity AS (
          SELECT DISTINCT us.person_id, us.signup_date
          FROM user_signups us
          INNER JOIN events e ON us.person_id = e.person_id
          WHERE e.timestamp >= us.signup_date + INTERVAL 1 DAY
          AND e.timestamp < us.signup_date + INTERVAL 2 DAY
          AND e.event != 'user_signed_up'
        )
        SELECT 
          countIf(signup_date >= now() - INTERVAL 30 DAY) as current_signups,
          countIf(signup_date >= now() - INTERVAL 30 DAY AND person_id IN (SELECT person_id FROM day1_activity)) as current_retained,
          countIf(signup_date < now() - INTERVAL 30 DAY) as previous_signups,
          countIf(signup_date < now() - INTERVAL 30 DAY AND person_id IN (SELECT person_id FROM day1_activity)) as previous_retained
        FROM user_signups
      `),
      
      // Day 7 Retention (current vs previous 30 days, excluding last 7 days)
      queryPostHog(`
        WITH user_signups AS (
          SELECT 
            person_id,
            min(timestamp) as signup_date
          FROM events
          WHERE event = 'user_signed_up'
          AND timestamp >= now() - INTERVAL 67 DAY
          AND timestamp <= now() - INTERVAL 7 DAY
          GROUP BY person_id
        ),
        day7_activity AS (
          SELECT DISTINCT us.person_id, us.signup_date
          FROM user_signups us
          INNER JOIN events e ON us.person_id = e.person_id
          WHERE e.timestamp >= us.signup_date + INTERVAL 7 DAY
          AND e.timestamp < us.signup_date + INTERVAL 8 DAY
          AND e.event != 'user_signed_up'
        )
        SELECT 
          countIf(signup_date >= now() - INTERVAL 37 DAY AND signup_date <= now() - INTERVAL 7 DAY) as current_signups,
          countIf(signup_date >= now() - INTERVAL 37 DAY AND signup_date <= now() - INTERVAL 7 DAY AND person_id IN (SELECT person_id FROM day7_activity)) as current_retained,
          countIf(signup_date < now() - INTERVAL 37 DAY) as previous_signups,
          countIf(signup_date < now() - INTERVAL 37 DAY AND person_id IN (SELECT person_id FROM day7_activity)) as previous_retained
        FROM user_signups
      `),
      
      // Day 30 Retention (users who signed up 30-60 days ago)
      queryPostHog(`
        WITH user_signups AS (
          SELECT 
            person_id,
            min(timestamp) as signup_date
          FROM events
          WHERE event = 'user_signed_up'
          AND timestamp >= now() - INTERVAL 90 DAY
          AND timestamp <= now() - INTERVAL 30 DAY
          GROUP BY person_id
        ),
        day30_activity AS (
          SELECT DISTINCT us.person_id, us.signup_date
          FROM user_signups us
          INNER JOIN events e ON us.person_id = e.person_id
          WHERE e.timestamp >= us.signup_date + INTERVAL 30 DAY
          AND e.timestamp < us.signup_date + INTERVAL 31 DAY
          AND e.event != 'user_signed_up'
        )
        SELECT 
          countIf(signup_date >= now() - INTERVAL 60 DAY AND signup_date <= now() - INTERVAL 30 DAY) as current_signups,
          countIf(signup_date >= now() - INTERVAL 60 DAY AND signup_date <= now() - INTERVAL 30 DAY AND person_id IN (SELECT person_id FROM day30_activity)) as current_retained,
          countIf(signup_date < now() - INTERVAL 60 DAY) as previous_signups,
          countIf(signup_date < now() - INTERVAL 60 DAY AND person_id IN (SELECT person_id FROM day30_activity)) as previous_retained
        FROM user_signups
      `),
      
      // Cohort Analysis (last 8 weeks)
      queryPostHog(`
        WITH user_signups AS (
          SELECT 
            person_id,
            min(timestamp) as signup_date,
            toStartOfWeek(min(timestamp)) as cohort_week
          FROM events
          WHERE event = 'user_signed_up'
          AND timestamp >= now() - INTERVAL 56 DAY
          GROUP BY person_id
        ),
        day1_retention AS (
          SELECT DISTINCT us.person_id, us.cohort_week
          FROM user_signups us
          INNER JOIN events e ON us.person_id = e.person_id
          WHERE e.timestamp >= us.signup_date + INTERVAL 1 DAY
          AND e.timestamp < us.signup_date + INTERVAL 2 DAY
          AND e.event != 'user_signed_up'
        ),
        day7_retention AS (
          SELECT DISTINCT us.person_id, us.cohort_week
          FROM user_signups us
          INNER JOIN events e ON us.person_id = e.person_id
          WHERE e.timestamp >= us.signup_date + INTERVAL 7 DAY
          AND e.timestamp < us.signup_date + INTERVAL 8 DAY
          AND e.event != 'user_signed_up'
        ),
        day30_retention AS (
          SELECT DISTINCT us.person_id, us.cohort_week
          FROM user_signups us
          INNER JOIN events e ON us.person_id = e.person_id
          WHERE e.timestamp >= us.signup_date + INTERVAL 30 DAY
          AND e.timestamp < us.signup_date + INTERVAL 31 DAY
          AND e.event != 'user_signed_up'
        )
        SELECT 
          cohort_week,
          count(DISTINCT us.person_id) as signups,
          count(DISTINCT d1.person_id) as day1,
          count(DISTINCT d7.person_id) as day7,
          count(DISTINCT d30.person_id) as day30
        FROM user_signups us
        LEFT JOIN day1_retention d1 ON us.person_id = d1.person_id AND us.cohort_week = d1.cohort_week
        LEFT JOIN day7_retention d7 ON us.person_id = d7.person_id AND us.cohort_week = d7.cohort_week
        LEFT JOIN day30_retention d30 ON us.person_id = d30.person_id AND us.cohort_week = d30.cohort_week
        GROUP BY cohort_week
        ORDER BY cohort_week DESC
        LIMIT 8
      `),
      
      // Average Time to First Post (in hours)
      queryPostHog(`
        WITH user_timeline AS (
          SELECT 
            person_id,
            min(CASE WHEN event = 'user_signed_up' THEN timestamp END) as signup_time,
            min(CASE WHEN event = 'post_created' THEN timestamp END) as first_post_time
          FROM events
          WHERE timestamp >= '${start}' AND timestamp < '${end}'
          GROUP BY person_id
          HAVING signup_time IS NOT NULL AND first_post_time IS NOT NULL
        )
        SELECT avg(date_diff('hour', signup_time, first_post_time)) as avg_hours
        FROM user_timeline
      `),
      
      // Average Onboarding Duration (in seconds)
      queryPostHog(`
        WITH onboarding_timeline AS (
          SELECT 
            person_id,
            min(CASE WHEN event = 'onboarding_started' THEN timestamp END) as start_time,
            min(CASE WHEN event = 'onboarding_completed' THEN timestamp END) as complete_time
          FROM events
          WHERE timestamp >= '${start}' AND timestamp < '${end}'
          GROUP BY person_id
          HAVING start_time IS NOT NULL AND complete_time IS NOT NULL
        )
        SELECT avg(date_diff('second', start_time, complete_time)) as avg_seconds
        FROM onboarding_timeline
      `),
      
      // Payment Completed Count
      queryPostHog(`
        SELECT count() as completed
        FROM events
        WHERE event = 'payment_completed'
        AND timestamp >= '${start}' AND timestamp < '${end}'
        ${filterClauses}
      `),
      
      // Top Upgrade Triggers
      queryPostHog(`
        SELECT 
          JSONExtractString(properties, 'feature') as feature,
          count() as trigger_count
        FROM events
        WHERE event = 'upgrade_clicked'
        AND timestamp >= '${start}' AND timestamp < '${end}'
        AND JSONExtractString(properties, 'feature') != ''
        ${filterClauses}
        GROUP BY feature
        ORDER BY trigger_count DESC
        LIMIT 5
      `),
      
      // Onboarding Step Dropoff Analysis
      queryPostHog(`
        WITH step_events AS (
          SELECT 
            person_id,
            event,
            toInt32(JSONExtractInt(properties, 'step')) as step_number,
            JSONExtractString(properties, 'step_name') as step_name
          FROM events
          WHERE event IN ('onboarding_step_started', 'onboarding_step_completed')
          AND timestamp >= '${start}' AND timestamp < '${end}'
          AND JSONExtractInt(properties, 'step') > 0
        )
        SELECT 
          step_number,
          any(step_name) as step_name,
          count(DISTINCT CASE WHEN event = 'onboarding_step_started' THEN person_id END) as started,
          count(DISTINCT CASE WHEN event = 'onboarding_step_completed' THEN person_id END) as completed
        FROM step_events
        GROUP BY step_number
        ORDER BY step_number
      `),
      
      // Previous Period Signup-to-Post for Trend Calculation
      queryPostHog(`
        WITH period_data AS (
          SELECT 
            count(DISTINCT CASE WHEN event = 'user_signed_up' THEN person_id END) as signups,
            count(DISTINCT CASE WHEN event = 'post_created' THEN person_id END) as posts
          FROM events
          WHERE timestamp >= '${prevStart}' AND timestamp < '${prevEnd}'
        )
        SELECT 
          CASE WHEN signups > 0 THEN (posts::FLOAT / signups) * 100 ELSE 0 END as rate
        FROM period_data
      `),
      
      // Previous Period Onboarding for Trend Calculation
      queryPostHog(`
        WITH period_data AS (
          SELECT 
            count(CASE WHEN event = 'onboarding_started' THEN 1 END) as started,
            count(CASE WHEN event = 'onboarding_completed' THEN 1 END) as completed
          FROM events
          WHERE timestamp >= '${prevStart}' AND timestamp < '${prevEnd}'
        )
        SELECT 
          CASE WHEN started > 0 THEN (completed::FLOAT / started) * 100 ELSE 0 END as rate
        FROM period_data
      `),
      
      // Previous Period Upgrade for Trend Calculation
      queryPostHog(`
        WITH period_data AS (
          SELECT 
            count(CASE WHEN event = 'usage_limit_reached' THEN 1 END) as limits,
            count(CASE WHEN event = 'upgrade_clicked' THEN 1 END) as upgrades
          FROM events
          WHERE timestamp >= '${prevStart}' AND timestamp < '${prevEnd}'
        )
        SELECT 
          CASE WHEN limits > 0 THEN (upgrades::FLOAT / limits) * 100 ELSE 0 END as rate
        FROM period_data
      `),
      
      // Recent Events for Live Stream
      getRecentEvents()
    ]);

    // Extract counts
    const signupCount = signups.results?.[0]?.[0] || 0;
    const firstPostCount = firstPosts.results?.[0]?.[0] || 0;
    const activeUserCount = activeUsers.results?.[0]?.[0] || 0;
    const onboardingStartedCount = onboardingStarted.results?.[0]?.[0] || 0;
    const onboardingCompletedCount = onboardingCompleted.results?.[0]?.[0] || 0;
    const upgradeClickedCount = upgradeClicked.results?.[0]?.[0] || 0;
    const limitReachedCount = limitReached.results?.[0]?.[0] || 0;

    // Calculate basic conversion rates
    const signupToPostConversion = signupCount > 0 ? (firstPostCount / signupCount) * 100 : 0;
    const onboardingCompletionRate = onboardingStartedCount > 0 
      ? (onboardingCompletedCount / onboardingStartedCount) * 100 
      : 0;
    const upgradeConversionRate = limitReachedCount > 0 
      ? (upgradeClickedCount / limitReachedCount) * 100 
      : 0;

    // Parse Day 1 Retention
    const day1Data = retentionDay1.results?.[0]?.[0] || {};
    const day1CurrentRate = day1Data.current_signups > 0 
      ? (day1Data.current_retained / day1Data.current_signups) * 100 
      : 0;
    const day1PreviousRate = day1Data.previous_signups > 0 
      ? (day1Data.previous_retained / day1Data.previous_signups) * 100 
      : 0;
    const day1TrendValue = day1PreviousRate > 0 
      ? ((day1CurrentRate - day1PreviousRate) / day1PreviousRate) * 100 
      : 0;

    // Parse Day 7 Retention
    const day7Data = retentionDay7.results?.[0]?.[0] || {};
    const day7CurrentRate = day7Data.current_signups > 0 
      ? (day7Data.current_retained / day7Data.current_signups) * 100 
      : 0;
    const day7PreviousRate = day7Data.previous_signups > 0 
      ? (day7Data.previous_retained / day7Data.previous_signups) * 100 
      : 0;
    const day7TrendValue = day7PreviousRate > 0 
      ? ((day7CurrentRate - day7PreviousRate) / day7PreviousRate) * 100 
      : 0;

    // Parse Day 30 Retention
    const day30Data = retentionDay30.results?.[0]?.[0] || {};
    const day30CurrentRate = day30Data.current_signups > 0 
      ? (day30Data.current_retained / day30Data.current_signups) * 100 
      : 0;
    const day30PreviousRate = day30Data.previous_signups > 0 
      ? (day30Data.previous_retained / day30Data.previous_signups) * 100 
      : 0;
    const day30TrendValue = day30PreviousRate > 0 
      ? ((day30CurrentRate - day30PreviousRate) / day30PreviousRate) * 100 
      : 0;

    // Parse Cohort Data
    const cohorts = (cohortData.results || []).map((row: any) => {
      const weekData = row[0];
      return {
        cohortDate: new Date(weekData.cohort_week).toLocaleDateString('de-DE', { 
          year: 'numeric', 
          month: '2-digit', 
          day: '2-digit' 
        }),
        signups: weekData.signups || 0,
        day1: weekData.signups > 0 ? Math.round((weekData.day1 / weekData.signups) * 100 * 10) / 10 : 0,
        day7: weekData.signups > 0 ? Math.round((weekData.day7 / weekData.signups) * 100 * 10) / 10 : 0,
        day30: weekData.signups > 0 ? Math.round((weekData.day30 / weekData.signups) * 100 * 10) / 10 : 0
      };
    });

    // Parse Time-based Metrics
    const avgTimeToFirstPost = avgTimeToPost.results?.[0]?.[0] || 0;
    const avgOnboardingSeconds = avgOnboardingDuration.results?.[0]?.[0] || 0;
    
    // Parse Payment Data
    const paymentCompletedCount = paymentCompleted.results?.[0]?.[0] || 0;
    const clickToPaymentRate = upgradeClickedCount > 0 
      ? (paymentCompletedCount / upgradeClickedCount) * 100 
      : 0;
    
    // Parse Top Triggers
    const topTriggers = (topUpgradeTriggers.results || []).map((row: any) => ({
      feature: row[0]?.feature || 'unknown',
      count: row[0]?.trigger_count || 0
    })).slice(0, 5);
    
    // If no triggers found, use fallback
    const finalTopTriggers = topTriggers.length > 0 ? topTriggers : [
      { feature: 'unknown', count: upgradeClickedCount }
    ];
    
    // Parse Onboarding Dropoff
    const dropoffSteps = (onboardingDropoff.results || []).map((row: any) => {
      const stepData = row[0];
      const started = stepData.started || 0;
      const completed = stepData.completed || 0;
      const dropoffRate = started > 0 ? ((started - completed) / started) * 100 : 0;
      
      return {
        step: stepData.step_number || 0,
        name: stepData.step_name || `Step ${stepData.step_number}`,
        dropoff: Math.round(dropoffRate * 10) / 10
      };
    });
    
    // Parse Previous Period Rates for Trends
    const previousSignupToPostRate = signupToPreviousPeriod.results?.[0]?.[0] || 0;
    const previousOnboardingRate = onboardingPreviousPeriod.results?.[0]?.[0] || 0;
    const previousUpgradeRate = upgradePreviousPeriod.results?.[0]?.[0] || 0;
    
    // Calculate Trends
    const signupToPostTrendValue = previousSignupToPostRate > 0 
      ? ((signupToPostConversion - previousSignupToPostRate) / previousSignupToPostRate) * 100 
      : 0;
    const onboardingTrendValue = previousOnboardingRate > 0 
      ? ((onboardingCompletionRate - previousOnboardingRate) / previousOnboardingRate) * 100 
      : 0;
    const upgradeTrendValue = previousUpgradeRate > 0 
      ? ((upgradeConversionRate - previousUpgradeRate) / previousUpgradeRate) * 100 
      : 0;

    console.log('[PostHog Analytics] All metrics fetched successfully - 100% real data');
    
    // Parse Recent Events
    const recentEvents = (recentEventsResult || []).map((row: any) => ({
      event: row[0] || 'unknown',
      timestamp: row[1] || new Date().toISOString(),
      distinctId: row[2] || 'anonymous',
      properties: row[3] || {}
    }));

    return {
      // Overview metrics - NOW WITH REAL TRENDS
      signupToPostRate: Math.round(signupToPostConversion * 10) / 10,
      signupToPostTrend: { 
        value: Math.abs(Math.round(signupToPostTrendValue * 10) / 10), 
        isPositive: signupToPostTrendValue >= 0 
      },
      onboardingCompletionRate: Math.round(onboardingCompletionRate * 10) / 10,
      onboardingTrend: { 
        value: Math.abs(Math.round(onboardingTrendValue * 10) / 10), 
        isPositive: onboardingTrendValue >= 0 
      },
      upgradeConversionRate: Math.round(upgradeConversionRate * 10) / 10,
      upgradeTrend: { 
        value: Math.abs(Math.round(upgradeTrendValue * 10) / 10), 
        isPositive: upgradeTrendValue >= 0 
      },
      activeUsers: activeUserCount,
      
      // Live Events for Real-time Monitoring
      recentEvents,

      // Signup to Post Funnel - NOW WITH REAL TIME DATA
      signupFunnel: {
        signups: signupCount,
        firstPostCreated: firstPostCount,
        conversionRate: Math.round(signupToPostConversion * 10) / 10,
        avgTimeToFirstPost: Math.round(avgTimeToFirstPost * 10) / 10
      },

      // Onboarding Metrics - NOW WITH REAL DROPOFF DATA
      onboardingMetrics: {
        started: onboardingStartedCount,
        completed: onboardingCompletedCount,
        completionRate: Math.round(onboardingCompletionRate * 10) / 10,
        avgDuration: Math.round(avgOnboardingSeconds),
        dropoffByStep: dropoffSteps.length > 0 ? dropoffSteps : [
          { step: 1, name: 'No dropoff data', dropoff: 0 }
        ]
      },

      // Upgrade Funnel - NOW WITH REAL PAYMENT & TRIGGER DATA
      upgradeFunnel: {
        freeUsers: signupCount,
        limitReached: limitReachedCount,
        upgradeClicked: upgradeClickedCount,
        paymentCompleted: paymentCompletedCount,
        conversionRates: {
          limitToClick: Math.round(upgradeConversionRate * 10) / 10,
          clickToPayment: Math.round(clickToPaymentRate * 10) / 10,
          overallConversion: limitReachedCount > 0 
            ? Math.round((paymentCompletedCount / limitReachedCount) * 100 * 10) / 10 
            : 0
        },
        topTriggers: finalTopTriggers
      },

      // Retention Metrics - NOW WITH REAL DATA
      retentionMetrics: {
        day1Retention: Math.round(day1CurrentRate * 10) / 10,
        day1Trend: { 
          value: Math.abs(Math.round(day1TrendValue * 10) / 10), 
          isPositive: day1TrendValue >= 0 
        },
        day7Retention: Math.round(day7CurrentRate * 10) / 10,
        day7Trend: { 
          value: Math.abs(Math.round(day7TrendValue * 10) / 10), 
          isPositive: day7TrendValue >= 0 
        },
        day30Retention: Math.round(day30CurrentRate * 10) / 10,
        day30Trend: { 
          value: Math.abs(Math.round(day30TrendValue * 10) / 10), 
          isPositive: day30TrendValue >= 0 
        },
        cohorts
      }
    };
  } catch (error) {
    console.error('[PostHog Analytics] Error fetching metrics:', error);
    throw error;
  }
}
