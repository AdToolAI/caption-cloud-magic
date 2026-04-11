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
  reasonKey: string;
}

// --- i18n reason translations ---
type Lang = 'en' | 'de' | 'es';

const REASON_LABELS: Record<string, Record<Lang, string>> = {
  'lunch_break_high':       { en: 'Lunch break – high activity', de: 'Mittagspause – Hohe Aktivität', es: 'Pausa del almuerzo – alta actividad' },
  'afternoon_engagement':   { en: 'Afternoon engagement', de: 'Nachmittags-Engagement', es: 'Engagement por la tarde' },
  'prime_time_evening':     { en: 'Prime time evening', de: 'Prime-Time Abends', es: 'Horario estelar nocturno' },
  'weekend_relaxation':     { en: 'Weekend relaxation', de: 'Wochenend-Entspannung', es: 'Relax de fin de semana' },
  'morning_check':          { en: 'Morning check', de: 'Morgen-Check', es: 'Revisión matutina' },
  'lunch_break':            { en: 'Lunch break', de: 'Mittags-Pause', es: 'Pausa del almuerzo' },
  'end_of_work':            { en: 'End of work', de: 'Feierabend', es: 'Fin de jornada' },
  'evening_relaxation':     { en: 'Evening relaxation', de: 'Abend-Entspannung', es: 'Relax nocturno' },
  'after_work_school':      { en: 'After work/school', de: 'Nach Arbeit/Schule', es: 'Después del trabajo/escuela' },
  'evening_peak':           { en: 'Evening peak time', de: 'Abend Peak-Zeit', es: 'Hora pico nocturna' },
  'weekend_lunch':          { en: 'Weekend lunch break', de: 'Wochenend-Mittagspause', es: 'Pausa de almuerzo del fin de semana' },
  'afternoon_scroll':       { en: 'Afternoon scroll', de: 'Nachmittags-Scroll', es: 'Scroll vespertino' },
  'early_evening':          { en: 'Early evening', de: 'Early Evening', es: 'Primera hora de la noche' },
  'late_night':             { en: 'Late night', de: 'Spätabend', es: 'Noche tardía' },
  'early_business':         { en: 'Early business hours', de: 'Frühe Business-Stunden', es: 'Primeras horas laborales' },
  'work_start':             { en: 'Work start', de: 'Arbeitsstart', es: 'Inicio de jornada' },
  'afternoon':              { en: 'Afternoon', de: 'Nachmittags', es: 'Por la tarde' },
  'late_afternoon':         { en: 'Late afternoon', de: 'Spätnachmittag', es: 'Final de la tarde' },
  'morning_commute':        { en: 'Morning commute', de: 'Morgen-Pendeln', es: 'Viaje matutino' },
  'noon_hour':              { en: 'Noon hour', de: 'Mittagsstunde', es: 'Mediodía' },
  'evening_commute':        { en: 'Evening commute', de: 'Abend-Pendeln', es: 'Viaje nocturno' },
  'early_morning':          { en: 'Early morning', de: 'Früher Morgen', es: 'Madrugada' },
  'noon':                   { en: 'Noon', de: 'Mittag', es: 'Mediodía' },
  'evening':                { en: 'Evening', de: 'Abend', es: 'Noche' },
  'noon_check':             { en: 'Noon check', de: 'Mittags-Check', es: 'Revisión de mediodía' },
  'weekend_social':         { en: 'Weekend social', de: 'Wochenend-Social', es: 'Social de fin de semana' },
  'morning':                { en: 'Morning', de: 'Vormittags', es: 'Mañana' },
  'afternoon_break':        { en: 'Afternoon break', de: 'Nachmittags-Pause', es: 'Pausa vespertina' },
  'evening_time':           { en: 'Evening time', de: 'Abendzeit', es: 'Horario nocturno' },
  'weekend_afternoon':      { en: 'Weekend afternoon', de: 'Wochenend-Nachmittag', es: 'Tarde de fin de semana' },
  'prime_video':            { en: 'Prime video time', de: 'Prime Video-Zeit', es: 'Horario estelar de video' },
  'lunch_entertainment':    { en: 'Lunch entertainment', de: 'Mittags-Entertainment', es: 'Entretenimiento del almuerzo' },
  'after_work_video':       { en: 'After-work video', de: 'Feierabend-Video', es: 'Video después del trabajo' },
  'late_night_video':       { en: 'Late night', de: 'Late Night', es: 'Noche tardía' },
  // Seasonal & meta reasons
  'seasonal_boosted':       { en: '☀️ Seasonally boosted', de: '☀️ Saisonal begünstigt', es: '☀️ Impulso estacional' },
  'seasonal_adjusted':      { en: '❄️ Seasonally adjusted', de: '❄️ Saisonal angepasst', es: '❄️ Ajuste estacional' },
  'industry_averages':      { en: 'Based on industry averages', de: 'Basiert auf Branchen-Durchschnitten', es: 'Basado en promedios del sector' },
  'personalized_trend':     { en: '📈 Personalized + industry trend', de: '📈 Personalisiert + Branchentrend', es: '📈 Personalizado + tendencia del sector' },
  // Reason codes from generate-posting-slots
  'history_strong':         { en: 'Historically strong time', de: 'Historisch starke Zeit', es: 'Horario históricamente fuerte' },
  'positive_trend':         { en: 'Positive trend (30d)', de: 'Positiver Trend (30d)', es: 'Tendencia positiva (30d)' },
  'platform_peak':          { en: 'Peak time', de: 'Peak-Zeit', es: 'Hora pico' },
  'industry_peak':          { en: '✨ Industry peak time', de: '✨ Branchen-Peak-Zeit', es: '✨ Hora pico del sector' },
  'platform_standards':     { en: 'Based on standards', de: 'Basierend auf Standards', es: 'Basado en estándares' },
  'average_time':           { en: 'Average time', de: 'Durchschnittliche Zeit', es: 'Horario promedio' },
};

function translateReason(reason: string, lang: Lang): string {
  // Handle reason codes from generate-posting-slots (format: "reason:key" or "reason:key:param")
  if (reason.startsWith('reason:')) {
    const parts = reason.substring(7).split(':');
    const key = parts[0];
    const param = parts[1];
    const label = REASON_LABELS[key];
    if (label) {
      const text = label[lang] || label.en;
      if (param) {
        const platformName = param.charAt(0).toUpperCase() + param.slice(1);
        return `${platformName} ${text}`;
      }
      return text;
    }
    return reason;
  }

  // Handle legacy German strings from DB by matching known patterns
  const LEGACY_MAP: Record<string, string> = {
    'Historisch starke Zeit': 'history_strong',
    'Positiver Trend (30d)': 'positive_trend',
    '✨ Branchen-Peak-Zeit': 'industry_peak',
    'Durchschnittliche Zeit': 'average_time',
    '📈 Personalisiert + Branchentrend': 'personalized_trend',
    'Basiert auf Branchen-Durchschnitten': 'industry_averages',
    '☀️ Saisonal begünstigt': 'seasonal_boosted',
    '❄️ Saisonal angepasst': 'seasonal_adjusted',
  };

  // Check legacy map
  const mappedKey = LEGACY_MAP[reason];
  if (mappedKey && REASON_LABELS[mappedKey]) {
    return REASON_LABELS[mappedKey][lang] || REASON_LABELS[mappedKey].en;
  }

  // Check for platform-specific legacy patterns
  for (const [platform] of Object.entries(PLATFORM_PEAKS)) {
    const pName = platform.charAt(0).toUpperCase() + platform.slice(1);
    if (reason.includes(`${pName}-Peak-Zeit`)) {
      const label = REASON_LABELS['platform_peak'];
      return `${pName} ${label[lang] || label.en}`;
    }
    if (reason.includes(`${pName}-Standards`)) {
      const label = REASON_LABELS['platform_standards'];
      return `${pName} ${label[lang] || label.en}`;
    }
  }

  return reason;
}

function translateReasons(reasons: string[], lang: Lang): string[] {
  return reasons.map(r => translateReason(r, lang));
}

const PLATFORM_PEAKS: Record<string, PlatformPeak[]> = {
  instagram: [
    { hour: 11, dayTypes: ['weekday'], score: 85, reasonKey: 'lunch_break_high' },
    { hour: 14, dayTypes: ['weekday'], score: 80, reasonKey: 'afternoon_engagement' },
    { hour: 19, dayTypes: ['all'], score: 90, reasonKey: 'prime_time_evening' },
    { hour: 21, dayTypes: ['weekend'], score: 88, reasonKey: 'weekend_relaxation' },
    { hour: 9, dayTypes: ['weekday'], score: 65, reasonKey: 'morning_check' },
    { hour: 13, dayTypes: ['weekday'], score: 70, reasonKey: 'lunch_break' },
    { hour: 17, dayTypes: ['weekday'], score: 68, reasonKey: 'end_of_work' },
    { hour: 20, dayTypes: ['all'], score: 72, reasonKey: 'evening_relaxation' },
  ],
  tiktok: [
    { hour: 18, dayTypes: ['all'], score: 88, reasonKey: 'after_work_school' },
    { hour: 21, dayTypes: ['all'], score: 92, reasonKey: 'evening_peak' },
    { hour: 12, dayTypes: ['weekend'], score: 85, reasonKey: 'weekend_lunch' },
    { hour: 16, dayTypes: ['weekday'], score: 70, reasonKey: 'afternoon_scroll' },
    { hour: 19, dayTypes: ['weekday'], score: 75, reasonKey: 'early_evening' },
    { hour: 22, dayTypes: ['weekend'], score: 68, reasonKey: 'late_night' },
  ],
  linkedin: [
    { hour: 8, dayTypes: ['tue-thu'], score: 87, reasonKey: 'early_business' },
    { hour: 12, dayTypes: ['weekday'], score: 85, reasonKey: 'lunch_break' },
    { hour: 17, dayTypes: ['weekday'], score: 83, reasonKey: 'end_of_work' },
    { hour: 9, dayTypes: ['weekday'], score: 72, reasonKey: 'work_start' },
    { hour: 14, dayTypes: ['weekday'], score: 65, reasonKey: 'afternoon' },
    { hour: 16, dayTypes: ['weekday'], score: 70, reasonKey: 'late_afternoon' },
  ],
  x: [
    { hour: 9, dayTypes: ['weekday'], score: 83, reasonKey: 'morning_commute' },
    { hour: 13, dayTypes: ['weekday'], score: 80, reasonKey: 'noon_hour' },
    { hour: 17, dayTypes: ['weekday'], score: 86, reasonKey: 'evening_commute' },
    { hour: 8, dayTypes: ['weekday'], score: 70, reasonKey: 'early_morning' },
    { hour: 12, dayTypes: ['weekday'], score: 72, reasonKey: 'noon' },
    { hour: 19, dayTypes: ['all'], score: 75, reasonKey: 'evening' },
  ],
  facebook: [
    { hour: 13, dayTypes: ['weekday'], score: 82, reasonKey: 'noon_check' },
    { hour: 19, dayTypes: ['all'], score: 85, reasonKey: 'evening_relaxation' },
    { hour: 21, dayTypes: ['weekend'], score: 88, reasonKey: 'weekend_social' },
    { hour: 11, dayTypes: ['weekday'], score: 68, reasonKey: 'morning' },
    { hour: 15, dayTypes: ['weekday'], score: 65, reasonKey: 'afternoon_break' },
    { hour: 20, dayTypes: ['all'], score: 70, reasonKey: 'evening_time' },
  ],
  youtube: [
    { hour: 14, dayTypes: ['weekend'], score: 88, reasonKey: 'weekend_afternoon' },
    { hour: 20, dayTypes: ['all'], score: 90, reasonKey: 'prime_video' },
    { hour: 12, dayTypes: ['weekday'], score: 75, reasonKey: 'lunch_entertainment' },
    { hour: 18, dayTypes: ['all'], score: 78, reasonKey: 'after_work_video' },
    { hour: 22, dayTypes: ['all'], score: 70, reasonKey: 'late_night_video' },
    { hour: 15, dayTypes: ['weekend'], score: 72, reasonKey: 'afternoon' },
  ],
};

function getDayType(date: Date): string {
  const day = date.getDay();
  if (day === 0 || day === 6) return 'weekend';
  if (day >= 2 && day <= 4) return 'tue-thu';
  return 'weekday';
}

function getSeasonalMultiplier(date: Date, hour: number): number {
  const month = date.getMonth();
  if (month >= 5 && month <= 7) {
    if (hour >= 20) return 1.08;
    if (hour <= 8) return 0.93;
  }
  if (month >= 10 || month <= 1) {
    if (hour >= 18 && hour <= 20) return 1.06;
    if (hour >= 22) return 0.90;
    if (hour >= 8 && hour <= 10) return 1.04;
  }
  if (month === 11) {
    if (hour >= 10 && hour <= 15) return 1.10;
  }
  return 1.0;
}

function generateIndustryBenchmarkSlots(
  platforms: string[],
  fromDate: string,
  toDate: string,
  lang: Lang,
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

        const seasonalMult = getSeasonalMultiplier(date, peak.hour);
        const adjustedScore = Math.min(100, Math.round(peak.score * seasonalMult));

        const peakLabel = REASON_LABELS[peak.reasonKey];
        const reasons = [`📊 ${peakLabel ? peakLabel[lang] || peakLabel.en : peak.reasonKey}`];
        if (seasonalMult !== 1.0) {
          const key = seasonalMult > 1 ? 'seasonal_boosted' : 'seasonal_adjusted';
          reasons.push(REASON_LABELS[key][lang]);
        }
        reasons.push(REASON_LABELS['industry_averages'][lang]);

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

function blendSlotsWithBenchmarks(
  userSlots: PostingSlot[],
  benchmarkSlots: PostingSlot[],
  lang: Lang,
): PostingSlot[] {
  const benchmarkMap = new Map<string, PostingSlot>();
  for (const s of benchmarkSlots) {
    const key = `${s.platform}|${s.slot_start}`;
    benchmarkMap.set(key, s);
  }

  const result: PostingSlot[] = [];
  const usedKeys = new Set<string>();

  for (const us of userSlots) {
    const key = `${us.platform}|${us.slot_start}`;
    usedKeys.add(key);
    const bench = benchmarkMap.get(key);
    if (bench) {
      result.push({
        ...us,
        score: Math.round(us.score * 0.7 + bench.score * 0.3),
        reasons: [
          ...translateReasons(us.reasons.filter(r => !r.includes('Branchen') && !r.includes('industry')), lang),
          REASON_LABELS['personalized_trend'][lang],
        ],
        features: { ...us.features, source: 'blended' },
      });
    } else {
      result.push({
        ...us,
        reasons: translateReasons(us.reasons, lang),
      });
    }
  }

  for (const bs of benchmarkSlots) {
    const key = `${bs.platform}|${bs.slot_start}`;
    if (!usedKeys.has(key)) {
      result.push(bs);
    }
  }

  return result;
}

function isCacheValid(cached: any): boolean {
  if (!cached || !cached.platforms) return false;
  const platforms = cached.platforms;
  for (const key of Object.keys(platforms)) {
    if (Array.isArray(platforms[key]) && platforms[key].length > 0) {
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
    const lang: Lang = (['en', 'de', 'es'].includes(body.language) ? body.language : 'de') as Lang;

    console.log(`[Posting Times API] User: ${user.id}, Platform: ${platform}, Days: ${days}, Lang: ${lang}`);

    // Redis Cache (30 min TTL) — language is part of the cache key
    const cache = getRedisCache();
    const cacheKey = cache.generateKeyHash('posting-times', { userId: user.id, platform, days, tz, lang });

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

    const now = new Date();
    const fromDate = now.toISOString();
    const toDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

    const platformFilter = platform === 'all' 
      ? ['instagram', 'tiktok', 'linkedin', 'x', 'facebook', 'youtube']
      : [platform];

    // ALWAYS generate benchmarks first as baseline (localized)
    const benchmarkSlots = generateIndustryBenchmarkSlots(platformFilter, fromDate, toDate, lang);

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
      slots = blendSlotsWithBenchmarks(dbSlots as PostingSlot[], benchmarkSlots, lang);
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
