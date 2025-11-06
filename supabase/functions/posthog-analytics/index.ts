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
    }
  };
}
