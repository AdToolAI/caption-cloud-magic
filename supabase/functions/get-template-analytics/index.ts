import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Unauthorized');
    }

    const url = new URL(req.url);
    const template_id = url.searchParams.get('template_id');
    const days = parseInt(url.searchParams.get('days') || '30');
    const date_from = url.searchParams.get('date_from');
    const date_to = url.searchParams.get('date_to');

    if (!template_id) {
      throw new Error('Missing required parameter: template_id');
    }

    // Get performance summary
    const { data: summary, error: summaryError } = await supabase
      .rpc('get_template_performance_summary', {
        p_template_id: template_id,
        p_days: days,
      });

    if (summaryError) {
      console.error('Error fetching performance summary:', summaryError);
      throw summaryError;
    }

    // Get conversion funnel data
    let conversionData = null;
    if (date_from && date_to) {
      const { data: conversion, error: conversionError } = await supabase
        .rpc('calculate_template_conversion_rates', {
          p_template_id: template_id,
          p_date_from: date_from,
          p_date_to: date_to,
        });

      if (conversionError) {
        console.error('Error calculating conversion rates:', conversionError);
      } else {
        conversionData = conversion;
      }
    }

    // Get daily metrics for trend analysis
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    const { data: dailyMetrics, error: metricsError } = await supabase
      .from('template_performance_metrics')
      .select('*')
      .eq('template_id', template_id)
      .gte('date', startDateStr)
      .order('date', { ascending: true });

    if (metricsError) {
      console.error('Error fetching daily metrics:', metricsError);
    }

    // Get active A/B tests for this template
    const { data: activeTests, error: testsError } = await supabase
      .from('template_ab_tests')
      .select('*')
      .eq('template_id', template_id)
      .eq('status', 'active');

    if (testsError) {
      console.error('Error fetching active tests:', testsError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        summary: summary?.[0] || null,
        conversion: conversionData?.[0] || null,
        daily_metrics: dailyMetrics || [],
        active_tests: activeTests || [],
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in get-template-analytics:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
