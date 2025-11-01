import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.75.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    // Gute Zeiten (50-70)
    { hour: 9, dayTypes: ['weekday'], score: 65, reason: 'Morgen-Check' },
    { hour: 13, dayTypes: ['weekday'], score: 70, reason: 'Mittags-Pause' },
    { hour: 17, dayTypes: ['weekday'], score: 68, reason: 'Feierabend' },
    { hour: 20, dayTypes: ['all'], score: 72, reason: 'Abend-Entspannung' },
  ],
  tiktok: [
    { hour: 18, dayTypes: ['all'], score: 88, reason: 'Nach Arbeit/Schule' },
    { hour: 21, dayTypes: ['all'], score: 92, reason: 'Abend Peak-Zeit' },
    { hour: 12, dayTypes: ['weekend'], score: 85, reason: 'Wochenend-Mittagspause' },
    // Gute Zeiten (50-70)
    { hour: 16, dayTypes: ['weekday'], score: 70, reason: 'Nachmittags-Scroll' },
    { hour: 19, dayTypes: ['weekday'], score: 75, reason: 'Early Evening' },
    { hour: 22, dayTypes: ['weekend'], score: 68, reason: 'Spätabend' },
  ],
  linkedin: [
    { hour: 8, dayTypes: ['tue-thu'], score: 87, reason: 'Frühe Business-Stunden' },
    { hour: 12, dayTypes: ['weekday'], score: 85, reason: 'Mittagspause' },
    { hour: 17, dayTypes: ['weekday'], score: 83, reason: 'Feierabend' },
    // Gute Zeiten (50-70)
    { hour: 9, dayTypes: ['weekday'], score: 72, reason: 'Arbeitsstart' },
    { hour: 14, dayTypes: ['weekday'], score: 65, reason: 'Nachmittags' },
    { hour: 16, dayTypes: ['weekday'], score: 70, reason: 'Spätnachmittag' },
  ],
  x: [
    { hour: 9, dayTypes: ['weekday'], score: 83, reason: 'Morgen-Pendeln' },
    { hour: 13, dayTypes: ['weekday'], score: 80, reason: 'Mittagsstunde' },
    { hour: 17, dayTypes: ['weekday'], score: 86, reason: 'Abend-Pendeln' },
    // Gute Zeiten (50-70)
    { hour: 8, dayTypes: ['weekday'], score: 70, reason: 'Früher Morgen' },
    { hour: 12, dayTypes: ['weekday'], score: 72, reason: 'Mittag' },
    { hour: 19, dayTypes: ['all'], score: 75, reason: 'Abend' },
  ],
  facebook: [
    { hour: 13, dayTypes: ['weekday'], score: 82, reason: 'Mittags-Check' },
    { hour: 19, dayTypes: ['all'], score: 85, reason: 'Abend-Entspannung' },
    { hour: 21, dayTypes: ['weekend'], score: 88, reason: 'Wochenend-Social' },
    // Gute Zeiten (50-70)
    { hour: 11, dayTypes: ['weekday'], score: 68, reason: 'Vormittags' },
    { hour: 15, dayTypes: ['weekday'], score: 65, reason: 'Nachmittags-Pause' },
    { hour: 20, dayTypes: ['all'], score: 70, reason: 'Abendzeit' },
  ],
  youtube: [
    { hour: 14, dayTypes: ['weekend'], score: 88, reason: 'Wochenend-Nachmittag' },
    { hour: 20, dayTypes: ['all'], score: 90, reason: 'Prime Video-Zeit' },
    { hour: 12, dayTypes: ['weekday'], score: 75, reason: 'Mittags-Entertainment' },
    // Gute Zeiten (50-70)
    { hour: 18, dayTypes: ['all'], score: 78, reason: 'Feierabend-Video' },
    { hour: 22, dayTypes: ['all'], score: 70, reason: 'Late Night' },
    { hour: 15, dayTypes: ['weekend'], score: 72, reason: 'Nachmittags' },
  ],
};

function getDayType(date: Date): string {
  const day = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  if (day === 0 || day === 6) return 'weekend';
  if (day >= 2 && day <= 4) return 'tue-thu';
  return 'weekday';
}

function generateIndustryBenchmarkSlots(
  userId: string,
  platforms: string[],
  fromDate: string,
  toDate: string,
  tz: string
): PostingSlot[] {
  const slots: PostingSlot[] = [];
  const from = new Date(fromDate);
  const to = new Date(toDate);

  console.log(`[Posting Times API] Generating industry benchmarks for ${platforms.join(', ')}`);

  for (const platform of platforms) {
    const peaks = PLATFORM_PEAKS[platform];
    if (!peaks) continue;

    // Generate slots for each day in range
    let currentDate = new Date(from);
    while (currentDate <= to) {
      // Create a new date object for this iteration to avoid mutation issues
      const date = new Date(currentDate);
      const dayType = getDayType(date);

      for (const peak of peaks) {
        // Check if this peak applies to this day type
        const applies = peak.dayTypes.includes('all' as any) || 
                       peak.dayTypes.includes(dayType as any);

        if (!applies) continue;

        // Create validated ISO timestamps for this hour
        const slotStart = new Date(date);
        slotStart.setHours(peak.hour, 0, 0, 0);
        
        const slotEnd = new Date(slotStart);
        slotEnd.setHours(peak.hour + 1, 0, 0, 0);

        // Validate timestamps before adding
        const startISO = slotStart.toISOString();
        const endISO = slotEnd.toISOString();

        slots.push({
          slot_start: startISO,
          slot_end: endISO,
          score: peak.score,
          reasons: [`📊 ${peak.reason}`, 'Basiert auf Branchen-Durchschnitten'],
          features: {
            source: 'industry_benchmark',
            dayType,
          },
          platform,
        });
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  console.log(`[Posting Times API] Generated ${slots.length} industry benchmark slots`);
  return slots;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const userToken = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(userToken);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Parse query parameters
    const url = new URL(req.url);
    const platform = url.searchParams.get('platform') || 'all';
    const days = parseInt(url.searchParams.get('days') || '14');
    const tz = url.searchParams.get('tz') || 'Europe/Berlin';

    console.log(`[Posting Times API] User: ${user.id}, Platform: ${platform}, Days: ${days}, TZ: ${tz}`);

    // Calculate date range
    const now = new Date();
    const fromDate = now.toISOString();
    const toDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

    // Build platform filter
    let platformFilter = platform === 'all' 
      ? ['instagram', 'tiktok', 'linkedin', 'x', 'facebook', 'youtube']
      : [platform];

    // Fetch posting slots
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
      throw slotsError;
    }

    console.log(`[Posting Times API] Found ${dbSlots?.length || 0} slots`);

    // If no slots found, generate industry benchmarks
    let slots: PostingSlot[];
    if (!dbSlots || dbSlots.length === 0) {
      console.log('[Posting Times API] No slots found, generating industry benchmarks');
      slots = generateIndustryBenchmarkSlots(user.id, platformFilter, fromDate, toDate, tz);
    } else {
      slots = dbSlots as PostingSlot[];
    }

    // Check if user has any history
    const { count: historyCount } = await supabase
      .from('posts_history')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const hasHistory = (historyCount || 0) > 0;

    // Calculate history days if available
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

    // Group slots by platform and date
    const platformData: Record<string, any[]> = {};

    for (const slot of (slots || [])) {
      if (!platformData[slot.platform]) {
        platformData[slot.platform] = [];
      }

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

    // Sort slots by score and take top 5 per day (statt nur top 3)
    for (const platform of Object.keys(platformData)) {
      for (const dayEntry of platformData[platform]) {
        dayEntry.slots = dayEntry.slots
          .sort((a: any, b: any) => b.score - a.score)
          .slice(0, 5); // Mehr Slots für bessere Abdeckung
      }
    }

    const response = {
      timezone: tz,
      range: {
        from: fromDate,
        to: toDate
      },
      platforms: platformData,
      metadata: {
        hasHistory,
        historyDays,
        generatedAt: new Date().toISOString(),
        slotsCount: slots?.length || 0,
        dataSource: hasHistory ? 'user_history' : 'industry_benchmark'
      }
    };

    return new Response(
      JSON.stringify(response),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300' // 5 min cache
        } 
      }
    );

  } catch (error: any) {
    console.error('[Posting Times API] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        details: error.toString()
      }),
      { 
        status: error.message === 'Unauthorized' ? 401 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
