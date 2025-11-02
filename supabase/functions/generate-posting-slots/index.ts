import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { withTelemetry } from '../_shared/telemetry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Platform peak times (baseline when no history available)
const PLATFORM_PEAKS: Record<string, any> = {
  instagram: {
    weekday: [[11, 13], [17, 20]],
    saturday: [[10, 13]],
    sunday: [[18, 21]]
  },
  tiktok: {
    daily: [[18, 23]],
    weekend: [[10, 12]]
  },
  linkedin: {
    tuesday_thursday: [[8, 10], [12, 14], [17, 18]]
  },
  x: {
    weekday: [[7, 9], [12, 14], [17, 20]],
    weekend: [[12, 15]]
  },
  facebook: {
    daily: [[12, 15], [18, 21]]
  },
  youtube: {
    weekday: [[16, 20]],
    weekend_morning: [[10, 12]],
    weekend_evening: [[17, 21]]
  }
};

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function normalize(value: number, min: number = 0, max: number = 100): number {
  if (max === min) return 0;
  return (value - min) / (max - min);
}

function getPlatformPeakBoost(platform: string, hour: number, dayOfWeek: number): number {
  const peaks = PLATFORM_PEAKS[platform];
  if (!peaks) return 0;

  let boost = 0;
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  // Check if hour falls in any peak window
  if (platform === 'instagram') {
    const windows = isWeekend 
      ? (dayOfWeek === 6 ? peaks.saturday : peaks.sunday)
      : peaks.weekday;
    
    for (const [start, end] of windows) {
      if (hour >= start && hour < end) boost = 1;
    }
  } else if (platform === 'tiktok') {
    for (const [start, end] of peaks.daily) {
      if (hour >= start && hour < end) boost = 1;
    }
    if (isWeekend) {
      for (const [start, end] of peaks.weekend) {
        if (hour >= start && hour < end) boost = 1.2;
      }
    }
  } else if (platform === 'linkedin') {
    if (dayOfWeek >= 2 && dayOfWeek <= 4) {
      for (const [start, end] of peaks.tuesday_thursday) {
        if (hour >= start && hour < end) boost = 1;
      }
    }
  } else if (platform === 'x') {
    const windows = isWeekend ? peaks.weekend : peaks.weekday;
    for (const [start, end] of windows) {
      if (hour >= start && hour < end) boost = 1;
    }
  } else if (platform === 'facebook') {
    for (const [start, end] of peaks.daily) {
      if (hour >= start && hour < end) boost = 1;
    }
  } else if (platform === 'youtube') {
    if (!isWeekend) {
      for (const [start, end] of peaks.weekday) {
        if (hour >= start && hour < end) boost = 1;
      }
    } else {
      for (const [start, end] of peaks.weekend_morning) {
        if (hour >= start && hour < end) boost = 1;
      }
      for (const [start, end] of peaks.weekend_evening) {
        if (hour >= start && hour < end) boost = 1;
      }
    }
  }

  return boost;
}

async function generateSlotsForUser(
  supabase: any,
  userId: string,
  platform: string,
  accountId: string
) {
  console.log(`[Generate Slots] User: ${userId}, Platform: ${platform}`);

  // Fetch historical data (last 12 months)
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const { data: history, error: historyError } = await supabase
    .from('posts_history')
    .select('*')
    .eq('user_id', userId)
    .eq('platform', platform)
    .gte('published_at', twelveMonthsAgo.toISOString())
    .order('published_at', { ascending: false });

  if (historyError) {
    console.error('[Generate Slots] Error fetching history:', historyError);
    throw historyError;
  }

  console.log(`[Generate Slots] Found ${history?.length || 0} historical posts`);

  // Calculate weekly pattern (hour x day of week)
  const weeklyPattern: Record<string, number[]> = {};
  
  if (history && history.length > 0) {
    for (const post of history) {
      const date = new Date(post.published_at);
      const hour = date.getHours();
      const dow = date.getDay();
      const key = `${dow}-${hour}`;

      if (!weeklyPattern[key]) {
        weeklyPattern[key] = [];
      }

      // Use engagement_score if available, otherwise calculate
      const score = post.engagement_score || 
        ((post.likes || 0) + (post.comments || 0) * 2 + (post.shares || 0) * 3 + (post.saves || 0) * 2);
      
      weeklyPattern[key].push(score);
    }
  }

  // Calculate average for each hour/dow combination
  const avgPattern: Record<string, number> = {};
  for (const [key, scores] of Object.entries(weeklyPattern)) {
    avgPattern[key] = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  }

  // Calculate recent trend (last 30 days vs previous 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const recentPosts = history?.filter(p => new Date(p.published_at) >= thirtyDaysAgo) || [];
  const previousPosts = history?.filter(p => {
    const date = new Date(p.published_at);
    return date >= sixtyDaysAgo && date < thirtyDaysAgo;
  }) || [];

  const recentAvg = recentPosts.length > 0
    ? recentPosts.reduce((sum, p) => sum + (p.engagement_score || 0), 0) / recentPosts.length
    : 0;
  
  const previousAvg = previousPosts.length > 0
    ? previousPosts.reduce((sum, p) => sum + (p.engagement_score || 0), 0) / previousPosts.length
    : 0;

  const trendMultiplier = previousAvg > 0 ? recentAvg / previousAvg : 1;

  // Generate slots for next 14 days
  const slots: any[] = [];
  const now = new Date();

  for (let day = 0; day < 14; day++) {
    const targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + day);
    targetDate.setHours(0, 0, 0, 0);

    // Generate slots every hour (24 slots per day)
    for (let hour = 0; hour < 24; hour++) {
      const slotStart = new Date(targetDate);
      slotStart.setHours(hour, 0, 0, 0);

      const slotEnd = new Date(slotStart);
      slotEnd.setHours(hour + 1, 0, 0, 0);

      const dow = slotStart.getDay();
      const key = `${dow}-${hour}`;

      // Calculate score components
      const historyScore = avgPattern[key] || 0;
      const platformPeakBoost = getPlatformPeakBoost(platform, hour, dow);
      const hasHistory = (history?.length || 0) > 10;

      // Score calculation (0-100 scale)
      let score: number;
      const reasons: string[] = [];
      const features: any = {
        dow,
        hour,
        hasHistory,
        peakBoost: platformPeakBoost
      };

      if (hasHistory) {
        // With history: weighted combination
        const maxHistory = Math.max(...Object.values(avgPattern), 1);
        const normalizedHistory = normalize(historyScore, 0, maxHistory);
        const normalizedTrend = normalize(trendMultiplier, 0.5, 1.5);
        const normalizedPeak = normalize(platformPeakBoost, 0, 1.2);

        const raw = 
          0.5 * normalizedHistory + 
          0.3 * normalizedTrend + 
          0.15 * normalizedPeak + 
          0.05 * (dow >= 1 && dow <= 5 ? 1 : 0.5); // Slight weekday preference

        score = Math.min(100, Math.max(0, sigmoid(raw * 4 - 2) * 100));

        if (historyScore > 0) reasons.push('Historisch starke Zeit');
        if (trendMultiplier > 1.1) reasons.push('Positiver Trend (30d)');
        if (platformPeakBoost > 0) reasons.push(`${platform.charAt(0).toUpperCase() + platform.slice(1)}-Peak-Zeit`);
      } else {
        // Without history: use industry benchmarks (more generous scoring)
        if (platformPeakBoost > 0) {
          score = 60 + platformPeakBoost * 35; // 60-95 range for peak times
          reasons.push('✨ Branchen-Peak-Zeit');
          reasons.push(`Basierend auf ${platform.charAt(0).toUpperCase() + platform.slice(1)}-Standards`);
        } else {
          score = 30 + Math.random() * 15; // 30-45 range for non-peak
          reasons.push('Durchschnittliche Zeit');
        }
      }

      features.score = score;
      features.historyScore = historyScore;
      features.trendMultiplier = trendMultiplier;

      slots.push({
        user_id: userId,
        platform,
        account_id: accountId,
        slot_start: slotStart.toISOString(),
        slot_end: slotEnd.toISOString(),
        score: Math.round(score * 10) / 10,
        reasons,
        features,
        generated_at: new Date().toISOString()
      });
    }
  }

  console.log(`[Generate Slots] Generated ${slots.length} slots`);

  // Upsert slots (batch)
  const { error: upsertError } = await supabase
    .from('posting_slots')
    .upsert(slots, { 
      onConflict: 'user_id,platform,account_id,slot_start',
      ignoreDuplicates: false 
    });

  if (upsertError) {
    console.error('[Generate Slots] Error upserting slots:', upsertError);
    throw upsertError;
  }

  return slots.length;
}

Deno.serve(withTelemetry('generate-posting-slots', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[Generate Slots] Starting batch generation');

    // Get all users with connected accounts
    const { data: connections, error: connectionsError } = await supabase
      .from('social_connections')
      .select('user_id, provider, account_id');

    if (connectionsError) {
      throw connectionsError;
    }

    console.log(`[Generate Slots] Found ${connections?.length || 0} connections`);

    let totalSlots = 0;
    const processed = new Set<string>();

    for (const conn of (connections || [])) {
      const key = `${conn.user_id}-${conn.provider}`;
      if (processed.has(key)) continue;
      processed.add(key);

      try {
        const count = await generateSlotsForUser(
          supabase,
          conn.user_id,
          conn.provider,
          conn.account_id || 'default'
        );
        totalSlots += count;
      } catch (error) {
        console.error(`[Generate Slots] Error for ${key}:`, error);
        // Continue with next user
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        usersProcessed: processed.size,
        slotsGenerated: totalSlots,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: any) {
    console.error('[Generate Slots] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message || 'Internal server error',
        details: error.toString()
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}));
