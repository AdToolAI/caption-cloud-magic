import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Seed background music tracks into Supabase Storage.
 * Downloads from Jamendo streaming URLs (more reliable than download URLs),
 * validates MP3 magic bytes, and uploads to the background-music bucket.
 * 
 * Run once to populate the internal music library.
 */

interface TrackSeed {
  name: string;
  jamendoId: string;
  mood: string;
  genre: string;
}

// Curated list of royalty-free Jamendo tracks by category
const SEED_TRACKS: TrackSeed[] = [
  // Corporate / Professional
  { name: 'corporate-professional-001', jamendoId: '1884527', mood: 'professional', genre: 'corporate' },
  { name: 'corporate-professional-002', jamendoId: '1890816', mood: 'professional', genre: 'corporate' },
  { name: 'corporate-clean-001', jamendoId: '1895498', mood: 'clean', genre: 'corporate' },
  // Energetic / Upbeat
  { name: 'energetic-upbeat-001', jamendoId: '1884468', mood: 'upbeat', genre: 'pop' },
  { name: 'energetic-dynamic-001', jamendoId: '1890256', mood: 'dynamic', genre: 'electronic' },
  // Calm / Relaxing
  { name: 'calm-relaxing-001', jamendoId: '1884120', mood: 'relaxing', genre: 'ambient' },
  { name: 'calm-friendly-001', jamendoId: '1893682', mood: 'friendly', genre: 'acoustic' },
  // Cinematic / Emotional
  { name: 'cinematic-dramatic-001', jamendoId: '1893248', mood: 'dramatic', genre: 'cinematic' },
  { name: 'cinematic-emotional-001', jamendoId: '1889934', mood: 'emotional', genre: 'cinematic' },
  // Happy / Cheerful
  { name: 'happy-cheerful-001', jamendoId: '1884680', mood: 'cheerful', genre: 'pop' },
  { name: 'happy-trendy-001', jamendoId: '1891472', mood: 'trendy', genre: 'pop' },
  // Inspirational / Motivational
  { name: 'inspirational-epic-001', jamendoId: '1892304', mood: 'epic', genre: 'cinematic' },
  { name: 'inspirational-powerful-001', jamendoId: '1886142', mood: 'powerful', genre: 'rock' },
];

function isValidMp3(bytes: Uint8Array): boolean {
  if (bytes.length < 3) return false;
  // ID3 header
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
  // MPEG frame sync
  if (bytes[0] === 0xFF && (bytes[1] & 0xE0) >= 0xE0) return true;
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const jamendoClientId = Deno.env.get('JAMENDO_CLIENT_ID');
    if (!jamendoClientId) {
      throw new Error('JAMENDO_CLIENT_ID not configured');
    }

    const results: { name: string; status: string; url?: string; error?: string }[] = [];

    for (const track of SEED_TRACKS) {
      const storagePath = `library/${track.name}.mp3`;

      // Check if already exists
      const { data: existing } = await supabase.storage
        .from('background-music')
        .list('library', { search: `${track.name}.mp3` });

      if (existing && existing.length > 0 && existing.some((f: any) => f.name === `${track.name}.mp3`)) {
        console.log(`[seed] ✅ Already exists: ${track.name}`);
        const { data: urlData } = supabase.storage.from('background-music').getPublicUrl(storagePath);
        results.push({ name: track.name, status: 'exists', url: urlData?.publicUrl });
        continue;
      }

      try {
        // Use Jamendo streaming URL (more reliable than audiodownload)
        const streamUrl = `https://mp3l.jamendo.com/?trackid=${track.jamendoId}&format=mp31`;
        
        // Also try the API to get the proper streaming URL
        const apiUrl = `https://api.jamendo.com/v3.0/tracks/?client_id=${jamendoClientId}&format=json&id=${track.jamendoId}&include=musicinfo&audioformat=mp32`;
        
        let audioUrl = streamUrl;
        try {
          const apiResp = await fetch(apiUrl);
          if (apiResp.ok) {
            const apiData = await apiResp.json();
            if (apiData.results?.[0]?.audio) {
              audioUrl = apiData.results[0].audio;
              console.log(`[seed] Got API audio URL for ${track.name}: ${audioUrl.substring(0, 80)}`);
            }
          }
        } catch {
          console.log(`[seed] API lookup failed for ${track.name}, using direct stream URL`);
        }

        console.log(`[seed] Downloading ${track.name} from ${audioUrl.substring(0, 80)}...`);
        const resp = await fetch(audioUrl);
        if (!resp.ok) {
          results.push({ name: track.name, status: 'download_failed', error: `HTTP ${resp.status}` });
          continue;
        }

        const bytes = new Uint8Array(await resp.arrayBuffer());
        
        // Validate MP3
        if (!isValidMp3(bytes)) {
          results.push({ name: track.name, status: 'invalid_mp3', error: 'Magic byte check failed' });
          continue;
        }

        if (bytes.length < 50000) {
          results.push({ name: track.name, status: 'too_small', error: `Only ${bytes.length} bytes` });
          continue;
        }

        console.log(`[seed] Downloaded ${track.name}: ${(bytes.length / 1024 / 1024).toFixed(1)} MB`);

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('background-music')
          .upload(storagePath, bytes, {
            contentType: 'audio/mpeg',
            upsert: true,
          });

        if (uploadError) {
          results.push({ name: track.name, status: 'upload_failed', error: uploadError.message });
          continue;
        }

        const { data: urlData } = supabase.storage.from('background-music').getPublicUrl(storagePath);
        console.log(`[seed] ✅ Uploaded ${track.name}: ${urlData?.publicUrl}`);
        results.push({ name: track.name, status: 'uploaded', url: urlData?.publicUrl });

      } catch (trackErr) {
        const msg = trackErr instanceof Error ? trackErr.message : String(trackErr);
        console.error(`[seed] ❌ Failed ${track.name}:`, msg);
        results.push({ name: track.name, status: 'error', error: msg });
      }
    }

    const uploaded = results.filter(r => r.status === 'uploaded' || r.status === 'exists').length;
    console.log(`[seed] Done: ${uploaded}/${SEED_TRACKS.length} tracks available`);

    return new Response(
      JSON.stringify({ ok: true, total: SEED_TRACKS.length, available: uploaded, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[seed] ❌ Error:', error);
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
