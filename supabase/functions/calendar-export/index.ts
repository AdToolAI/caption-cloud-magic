import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'UNAUTHORIZED', code: 'UNAUTHORIZED' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { from, to, platform, format = 'ics', language = 'de' } = await req.json();

    const now = new Date();
    const fromDate = from ? new Date(from) : now;
    const toDate = to ? new Date(to) : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    let query = supabaseClient
      .from('posts')
      .select('*')
      .eq('user_id', user.id)
      .gte('scheduled_at', fromDate.toISOString())
      .lte('scheduled_at', toDate.toISOString());

    if (platform) {
      query = query.eq('platform', platform);
    }

    const { data: posts, error: postsError } = await query.order('scheduled_at', { ascending: true });

    if (postsError) throw postsError;

    if (!posts || posts.length === 0) {
      return new Response(
        JSON.stringify({ error: 'NO_POSTS_IN_RANGE', code: 'NO_POSTS_IN_RANGE' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    if (format === 'csv') {
      const csv = generateCSV(posts, language);
      return new Response(csv, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="calendar-export.csv"',
        },
      });
    } else {
      const ics = generateICS(posts);
      return new Response(ics, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/calendar',
          'Content-Disposition': 'attachment; filename="calendar-export.ics"',
        },
      });
    }
  } catch (error) {
    console.error('Error in calendar-export:', error);
    return new Response(
      JSON.stringify({
        error: 'INTERNAL_ERROR',
        code: 'INTERNAL_ERROR',
        requestId: crypto.randomUUID(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function generateICS(posts: any[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Social Media Planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  posts.forEach(post => {
    const start = formatICSDate(new Date(post.scheduled_at));
    const end = formatICSDate(new Date(new Date(post.scheduled_at).getTime() + 30 * 60 * 1000)); // 30 min duration
    const summary = `Post: ${post.platform}`;
    const description = (post.caption || '').replace(/\n/g, '\\n').substring(0, 200);

    lines.push(
      'BEGIN:VEVENT',
      `UID:${post.id}@socialmediaplanner`,
      `DTSTAMP:${formatICSDate(new Date())}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      `STATUS:${post.status === 'posted' ? 'CONFIRMED' : 'TENTATIVE'}`,
      'END:VEVENT'
    );
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function formatICSDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function getLocalizedHeaders(lang: string): string[] {
  const headerTranslations: Record<string, string[]> = {
    de: ['Datum', 'Uhrzeit', 'Plattform', 'Status', 'Caption'],
    en: ['Date', 'Time', 'Platform', 'Status', 'Caption'],
    es: ['Fecha', 'Hora', 'Plataforma', 'Estado', 'Caption']
  };
  return headerTranslations[lang] || headerTranslations['de'];
}

function generateCSV(posts: any[], language: string = 'de'): string {
  const headers = getLocalizedHeaders(language);
  const locale = language === 'es' ? 'es-ES' : language === 'en' ? 'en-US' : 'de-DE';
  
  const rows = posts.map(post => {
    const date = new Date(post.scheduled_at);
    return [
      date.toLocaleDateString(locale),
      date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
      post.platform,
      post.status,
      `"${(post.caption || '').replace(/"/g, '""').substring(0, 100)}"`,
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}
