import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const POSTHOG_API_KEY = Deno.env.get('POSTHOG_API_KEY');
    const POSTHOG_PROJECT_ID = Deno.env.get('VITE_PUBLIC_POSTHOG_KEY')?.split('_')[1]; // Extract project ID from public key

    if (!POSTHOG_API_KEY) {
      throw new Error('PostHog API key not configured');
    }

    const { action } = await req.json();

    if (action === 'getMetrics') {
      // Fetch metrics from PostHog API
      const metrics = await fetchPostHogMetrics(POSTHOG_API_KEY, POSTHOG_PROJECT_ID || '');

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
    console.error('PostHog Analytics Error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function fetchPostHogMetrics(apiKey: string, _projectId: string) {
  const baseUrl = 'https://eu.i.posthog.com/api';
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };

  // Calculate date range (last 30 days)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);

  try {
    // Fetch multiple insights in parallel
    const [
      signupToPost,
      onboarding,
      upgrade,
      activeUsers
    ] = await Promise.all([
      fetchSignupToPostConversion(baseUrl, headers, _projectId, startDate, endDate),
      fetchOnboardingMetrics(baseUrl, headers, _projectId, startDate, endDate),
      fetchUpgradeMetrics(baseUrl, headers, _projectId, startDate, endDate),
      fetchActiveUsers(baseUrl, headers, _projectId, startDate, endDate)
    ]);

    return {
      signupToPostRate: signupToPost.rate,
      signupToPostTrend: signupToPost.trend,
      onboardingCompletionRate: onboarding.rate,
      onboardingTrend: onboarding.trend,
      upgradeConversionRate: upgrade.rate,
      upgradeTrend: upgrade.trend,
      activeUsers: activeUsers,
      signupFunnel: signupToPost.funnel,
      onboardingMetrics: onboarding.metrics,
      upgradeFunnel: upgrade.funnel
    };
  } catch (error) {
    console.error('Error fetching PostHog metrics:', error);
    throw error;
  }
}

async function fetchSignupToPostConversion(_baseUrl: string, _headers: Record<string, string>, _projectId: string, _startDate: Date, _endDate: Date) {
  // For now, return mock data structure
  // In production, you'd make actual API calls to PostHog
  // Example query structure for reference:
  // const funnelQuery = {
  //   events: [
  //     { id: 'signup_completed', type: 'events', order: 0 },
  //     { id: 'post_generated', type: 'events', order: 1 }
  //   ],
  //   date_from: startDate.toISOString(),
  //   date_to: endDate.toISOString(),
  //   funnel_window_days: 7
  // };
  return {
    rate: 38.5,
    trend: { value: 5.2, isPositive: true },
    funnel: {
      signups: 1243,
      firstPostCreated: 478,
      conversionRate: 38.5,
      avgTimeToFirstPost: 4.2
    }
  };
}

async function fetchOnboardingMetrics(_baseUrl: string, _headers: Record<string, string>, _projectId: string, _startDate: Date, _endDate: Date) {
  return {
    rate: 72.3,
    trend: { value: 3.1, isPositive: true },
    metrics: {
      started: 1243,
      completed: 899,
      completionRate: 72.3,
      avgDuration: 245,
      dropoffByStep: [
        { step: 1, name: 'Social Connections', dropoff: 12.5 },
        { step: 2, name: 'Brand Setup', dropoff: 8.2 },
        { step: 3, name: 'First Post', dropoff: 7.0 }
      ]
    }
  };
}

async function fetchUpgradeMetrics(_baseUrl: string, _headers: Record<string, string>, _projectId: string, _startDate: Date, _endDate: Date) {
  return {
    rate: 4.8,
    trend: { value: 0.8, isPositive: true },
    funnel: {
      freeUsers: 1243,
      limitReached: 387,
      upgradeClicked: 89,
      paymentCompleted: 60,
      conversionRates: {
        limitToClick: 23.0,
        clickToPayment: 67.4,
        overallConversion: 4.8
      },
      topTriggers: [
        { feature: 'campaign_generation', count: 28 },
        { feature: 'ai_credits', count: 18 },
        { feature: 'calendar_limit', count: 14 }
      ]
    }
  };
}

async function fetchActiveUsers(_baseUrl: string, _headers: Record<string, string>, _projectId: string, _startDate: Date, _endDate: Date) {
  // Query for unique users with any event in the last 30 days
  return 1243;
}
