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
    const { action } = await req.json();

    if (action === 'getMetrics') {
      // Return mock metrics data
      // TODO: Implement real PostHog API calls when POSTHOG_API_KEY is configured
      const metrics = getMockMetrics();

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

function getMockMetrics() {
  return {
    // Overview metrics
    signupToPostRate: 38.5,
    signupToPostTrend: { value: 5.2, isPositive: true },
    onboardingCompletionRate: 72.3,
    onboardingTrend: { value: 3.1, isPositive: true },
    upgradeConversionRate: 4.8,
    upgradeTrend: { value: 0.8, isPositive: true },
    activeUsers: 1243,

    // Signup to Post Funnel
    signupFunnel: {
      signups: 1243,
      firstPostCreated: 478,
      conversionRate: 38.5,
      avgTimeToFirstPost: 4.2
    },

    // Onboarding Metrics
    onboardingMetrics: {
      started: 1243,
      completed: 899,
      completionRate: 72.3,
      avgDuration: 245,
      dropoffByStep: [
        { step: 1, name: 'Social Connections', dropoff: 12.5 },
        { step: 2, name: 'Brand Setup', dropoff: 8.2 },
        { step: 3, name: 'First Post', dropoff: 7.0 }
      ]
    },

    // Upgrade Funnel
    upgradeFunnel: {
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
    },

    // Retention Metrics (Phase 3)
    retentionMetrics: {
      day1Retention: 52.3,
      day1Trend: { value: 3.8, isPositive: true },
      day7Retention: 34.6,
      day7Trend: { value: 2.1, isPositive: true },
      day30Retention: 22.8,
      day30Trend: { value: 1.5, isPositive: true },
      cohorts: [
        { cohortDate: 'KW 50 2024', signups: 287, day1: 54.7, day7: 36.2, day30: 24.4 },
        { cohortDate: 'KW 51 2024', signups: 312, day1: 52.9, day7: 35.6, day30: 23.7 },
        { cohortDate: 'KW 52 2024', signups: 198, day1: 51.5, day7: 34.1, day30: 22.2 },
        { cohortDate: 'KW 1 2025', signups: 256, day1: 53.1, day7: 35.2, day30: 23.1 },
        { cohortDate: 'KW 2 2025', signups: 190, day1: 50.0, day7: 32.6, day30: 21.1 }
      ]
    }
  };
}
