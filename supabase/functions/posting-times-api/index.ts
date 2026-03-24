// Posting Times API - Returns optimal posting times based on historical data or industry benchmarks
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';
import { getRedisCache } from '../_shared/redis-cache.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface PostingSlot {
  slot_start: string;
  slot_end: string;
  score: number;
  reasons: string[];
  features: any;
  platform: string;
}

interface PlatformPeak {
  hour: number;
  dayTypes: ('weekday' | 'weekend' | 'tue-thu' | 'all')[];
  score: number;
  reason: string;
}

const PLATFORM_PEAKS: Record<string, PlatformPeak[]> = {
  instagram: [
    { hour: 11, dayTypes: ['weekday'], score: 85, reason: 'Mittagspause - Hohe Aktivität' },
    { hour: 14, dayTypes: ['weekday'], score: 80, reason: 'Nachmittags-Engagement' },
    { hour: 19, dayTypes: ['all'], score: 90, reason: 'Prime-Time Abends' },
    { hour: 21, dayTypes: ['weekend'], score: 88, reason: 'Wochenend-Entspannung' },
    { hour: 9, dayTypes: ['weekday'], score: 65, reason: 'Morgen-Check' },
    { hour: 13, dayTypes: ['weekday'], score: 70, reason: 'Mittags-Pause' },
    { hour: 17, dayTypes: ['weekday'], score: 68, reason: 'Feierabend' },
    { hour: 20, dayTypes: ['all'], score: 72, reason: 'Abend-Entspannung' },
  ],
  tiktok: [
    { hour: 18, dayTypes: ['all'], score: 88, reason: 'Nach Arbeit/Schule' },
    { hour: 21, dayTypes: ['all'], score: 92, reason: 'Abend Peak-Zeit' },
    { hour: 12, dayTypes: ['weekend'], score: 85, reason: 'Wochenend-Mittagspause' },
    { hour: 16, dayTypes: ['weekday'], score: 70, reason: 'Nachmittags-Scroll' },
    { hour: 19, dayTypes: ['weekday'], score: 75, reason: 'Early Evening' },
    { hour: 22, dayTypes: ['weekend'], score: 68, reason: 'Spätabend' },
  ],
  linkedin: [
    { hour: 8, dayTypes: ['tue-thu'], score: 87, reason: 'Frühe Business-Stunden' },
    { hour: 12, dayTypes: ['weekday'], score: 85, reason: 'Mittagspause' },
    { hour: 17, dayTypes: ['weekday'], score: 83, reason: 'Feierabend' },
    { hour: 9, dayTypes: ['weekday'], score: 72, reason: 'Arbeitsstart' },
    { hour: 14, dayTypes: ['weekday'], score: 65, reason: 'Nachmittags' },
    { hour: 16, dayTypes: ['weekday'], score: 70, reason: 'Spätnachmittag' },
  ],
  x: [
    { hour: 9, dayTypes: ['weekday'], score: 83, reason: 'Morgen-Pendeln' },
    { hour: 13, dayTypes: ['weekday'], score: 80, reason: 'Mittagsstunde' },
    { hour: 17, dayTypes: ['weekday'], score: 86, reason: 'Abend-Pendeln' },
    { hour: 8, dayTypes: ['weekday'], score: 70, reason: 'Früher Morgen' },
    { hour: 12, dayTypes: ['weekday'], score: 72, reason: 'Mittag' },
    { hour: 19, dayTypes: ['all'], score: 75, reason: 'Abend' },
  ],
  facebook: [
    { hour: 13, dayTypes: ['weekday'], score: 82, reason: 'Mittags-Check' },
    { hour: 19, dayTypes: ['all'], score: 85, reason: 'Abend-Entspannung' },
    { hour: 21, dayTypes: ['weekend'], score: 88, reason: 'Wochenend-Social' },
    { hour: 11, dayTypes: ['weekday'], score: 68, reason: 'Vormittags' },
    { hour: 15, dayTypes: ['weekday'], score: 65, reason: 'Nachmittags-Pause' },
    { hour: 20, dayTypes: ['all'], score: 70, reason: 'Abendzeit' },
  ],
  youtube: [
    { hour: 14, dayTypes: ['weekend'], score: 88, reason: 'Wochenend-Nachmittag' },
    { hour: 20, dayTypes: ['all'], score: 90, reason: 'Prime Video-Zeit' },
    { hour: 12, dayTypes: ['weekday'], score: 75, reason: 'Mittags-Entertainment' },
    { hour: 18, dayTypes: ['all'], score: 78, reason: 'Feierabend-Video' },
    { hour: 22, dayTypes: ['all'], score: 70, reason: 'Late Night' },
    { hour: 15, dayTypes: ['weekend'], score: 72, reason: 'Nachmittags' },
  ],
};

function getDayType(date: Date): string {
  const day = date.getDay();
  if (day === 0 || day === 6) return 'weekend';
  if (day >= 2 && day <= 4) return 'tue-thu';
  return 'weekday';
}

/** Apply seasonal adjustments to scores based on month and daylight patterns */
function getSeasonalMultiplier(date: Date, hour: number): number {
  const month = date.getMonth(); // 0-11
  
  // Summer months (Jun-Aug): evening slots get a boost, early morning slightly lower
  if (month >= 5 && month <= 7) {
    if (hour >= 20) return 1.08; // People stay up later
    if (hour <= 8) return 0.93;
  }
  
  // Winter months (Nov-Feb): evening slots earlier, morning check higher
  if (month >= 10 || month <= 1) {
    if (hour >= 18 && hour <= 20) return 1.06; // Earlier peak
    if (hour >= 22) return 0.90; // Less late-night activity
    if (hour >= 8 && hour <= 10) return 1.04; // Morning commute
  }
  
  // Holiday season boost (Dec)
  if (month === 11) {
    if (hour >= 10 && hour <= 15) return 1.10; // Shopping/browsing
  }
  
  return 1.0;
}

function generateIndustryBenchmarkSlots(
  platforms: string[],
  fromDate: string,
  toDate: string,
): PostingSlot[] {
  const slots: PostingSlot[] = [];
  const from = new Date(fromDate);
  const to = new Date(toDate);

  for (const platform of platforms) {
    const peaks = PLATFORM_PEAKS[platform];
    if (!peaks) continue;

    let currentDate = new Date(from);
    while (currentDate <= to) {
      const date = new Date(currentDate);
      const dayType = getDayType(date);

      for (const peak of peaks) {
        const applies = peak.dayTypes.includes('all' as any) || 
                       peak.dayTypes.includes(dayType as any);
        if (!applies) continue;

        const slotStart = new Date(date);
        slotStart.setHours(peak.hour, 0, 0, 0);
        const slotEnd = new Date(slotStart);
        slotEnd.setHours(peak.hour + 1, 0, 0, 0);

        // Apply seasonal adjustment
        const seasonalMult = getSeasonalMultiplier(date, peak.hour);
        const adjustedScore = Math.min(100, Math.round(peak.score * seasonalMult));

        const reasons = [`📊 ${peak.reason}`];
        if (seasonalMult !== 1.0) {
          reasons.push(seasonalMult > 1 ? '☀️ Saisonal begünstigt' : '❄️ Saisonal angepasst');
        }
        reasons.push('Basiert auf Branchen-Durchschnitten');

        slots.push({
          slot_start: slotStart.toISOString(),
          slot_end: slotEnd.toISOString(),
          score: adjustedScore,
          reasons,
          features: { source: 'industry_benchmark', dayType },
          platform,
        });
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  console.log(`[Posting Times API] Generated ${slots.length} benchmark slots`);
  return slots;
}

/** Blend user history slots with benchmark slots (70% history / 30% benchmark) */
function blendSlotsWithBenchmarks(
  userSlots: PostingSlot[],
  benchmarkSlots: PostingSlot[],
): PostingSlot[] {
  // Index benchmarks by platform+date+hour for fast lookup
  const benchmarkMap = new Map<string, PostingSlot>();
  for (const s of benchmarkSlots) {
    const key = `${s.platform}|${s.slot_start}`;
    benchmarkMap.set(key, s);
  }

  const result: PostingSlot[] = [];
  const usedKeys = new Set<string>();

  // For each user slot, blend with matching benchmark
  for (const us of userSlots) {
    const key = `${us.platform}|${us.slot_start}`;
    usedKeys.add(key);
    const bench = benchmarkMap.get(key);
    if (bench) {
      result.push({
        ...us,
        score: Math.round(us.score * 0.7 + bench.score * 0.3),
        reasons: [...us.reasons.filter(r => !r.includes('Branchen')), '📈 Personalisiert + Branchentrend'],
        features: { ...us.features, source: 'blended' },
      });
    } else {
      result.push(us);
    }
  }

  // Add benchmark slots that have no user data (fill gaps)
  for (const bs of benchmarkSlots) {
    const key = `${bs.platform}|${bs.slot_start}`;
    if (!usedKeys.has(key)) {
      result.push(bs);
    }
  }

  return result;
}

/** Check if cached response has actual slot data */
function isCacheValid(cached: any): boolean {
  if (!cached || !cached.platforms) return false;
  const platforms = cached.platforms;
  for (const key of Object.keys(platforms)) {
    if (Array.isArray(platforms[key]) && platforms[key].length > 0) {
      // Check at least one day has slots
      if (platforms[key].some((d: any) => d.slots && d.slots.length > 0)) {
        return true;
      }
    }
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('authorization');
    if (!authHeader) throw new Error('No authorization header');

    const userToken = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(userToken);
    if (authError || !user) throw new Error('Unauthorized');

    const url = new URL(req.url);
    let body: any = {};
    try { body = await req.json(); } catch { /* no body */ }
    
    const platform = body.platform || url.searchParams.get('platform') || 'all';
    const days = parseInt(body.days || url.searchParams.get('days') || '14');
    const tz = body.tz || url.searchParams.get('tz') || 'Europe/Berlin';

    console.log(`[Posting Times API] User: ${user.id}, Platform: ${platform}, Days: ${days}`);

    // Redis Cache (30 min TTL)
    const cache = getRedisCache();
    const cacheKey = cache.generateKeyHash('posting-times', { userId: user.id, platform, days, tz });

    const cached = await cache.get(cacheKey, { logHits: true });
    if (cached && isCacheValid(cached)) {
      console.log(`[Posting Times API] Valid cache hit`);
      return new Response(JSON.stringify(cached), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
      });
    }

    if (cached && !isCacheValid(cached)) {
      console.log(`[Posting Times API] Stale/empty cache detected, regenerating`);
      await cache.delete(cacheKey);
    }

    // Date range
    const now = new Date();
    const fromDate = now.toISOString();
    const toDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

    const platformFilter = platform === 'all' 
      ? ['instagram', 'tiktok', 'linkedin', 'x', 'facebook', 'youtube']
      : [platform];

    // ALWAYS generate benchmarks first as baseline
    const benchmarkSlots = generateIndustryBenchmarkSlots(platformFilter, fromDate, toDate);

    // Then try to get user-specific slots
    const { data: dbSlots, error: slotsError } = await supabase
      .from('posting_slots')
      .select('*')
      .eq('user_id', user.id)
      .in('platform', platformFilter)
      .gte('slot_start', fromDate)
      .lte('slot_start', toDate)
      .order('slot_start', { ascending: true });

    if (slotsError) {
      console.error('[Posting Times API] Error fetching slots:', slotsError);
    }

    // Blend user data with benchmarks, or use pure benchmarks
    let slots: PostingSlot[];
    if (dbSlots && dbSlots.length > 0) {
      console.log(`[Posting Times API] Blending ${dbSlots.length} user slots with benchmarks`);
      slots = blendSlotsWithBenchmarks(dbSlots as PostingSlot[], benchmarkSlots);
    } else {
      slots = benchmarkSlots;
    }

    // Check history
    const { count: historyCount } = await supabase
      .from('posts_history')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const hasHistory = (historyCount || 0) > 0;
    let historyDays = 0;
    if (hasHistory) {
      const { data: oldestPost } = await supabase
        .from('posts_history')
        .select('published_at')
        .eq('user_id', user.id)
        .order('published_at', { ascending: true })
        .limit(1)
        .single();
      if (oldestPost) {
        historyDays = Math.floor((now.getTime() - new Date(oldestPost.published_at).getTime()) / (1000 * 60 * 60 * 24));
      }
    }

    // Group by platform and date
    const platformData: Record<string, any[]> = {};
    for (const slot of slots) {
      if (!platformData[slot.platform]) platformData[slot.platform] = [];
      const slotDate = new Date(slot.slot_start).toISOString().split('T')[0];
      let dayEntry = platformData[slot.platform].find((d: any) => d.date === slotDate);
      if (!dayEntry) {
        dayEntry = { date: slotDate, slots: [] };
        platformData[slot.platform].push(dayEntry);
      }
      dayEntry.slots.push({
        start: slot.slot_start,
        end: slot.slot_end,
        score: slot.score,
        reasons: slot.reasons,
        features: slot.features
      });
    }

    // Sort and limit per day
    for (const p of Object.keys(platformData)) {
      for (const dayEntry of platformData[p]) {
        dayEntry.slots = dayEntry.slots
          .sort((a: any, b: any) => b.score - a.score)
          .slice(0, 5);
      }
    }

    const response = {
      timezone: tz,
      range: { from: fromDate, to: toDate },
      platforms: platformData,
      metadata: {
        hasHistory,
        historyDays,
        generatedAt: new Date().toISOString(),
        slotsCount: slots.length,
        dataSource: hasHistory ? (dbSlots && dbSlots.length > 0 ? 'blended' : 'industry_benchmark') : 'industry_benchmark',
      }
    };

    // Cache for 30 minutes
    await cache.set(cacheKey, response, 1800);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
    });

  } catch (error: any) {
    console.error('[Posting Times API] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { 
        status: error.message === 'Unauthorized' ? 401 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
