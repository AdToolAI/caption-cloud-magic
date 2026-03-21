import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface CategoryConfig {
  mood: string;
  genre: string;
  moods: string[];
  jamendoTags: string[];
  limit: number;
}

const CATEGORIES: CategoryConfig[] = [
  {
    mood: 'professional',
    genre: 'corporate',
    moods: ['professional', 'corporate', 'clean', 'business'],
    jamendoTags: ['corporate', 'business', 'professional'],
    limit: 20,
  },
  {
    mood: 'energetic',
    genre: 'pop',
    moods: ['energetic', 'upbeat', 'dynamic', 'werbung', 'advertisement', 'marketing'],
    jamendoTags: ['energetic', 'upbeat', 'dynamic'],
    limit: 20,
  },
  {
    mood: 'calm',
    genre: 'ambient',
    moods: ['calm', 'relaxing', 'tutorial', 'erklärung', 'explanation', 'friendly', 'light', 'warm'],
    jamendoTags: ['calm', 'relax', 'ambient'],
    limit: 20,
  },
  {
    mood: 'cinematic',
    genre: 'cinematic',
    moods: ['cinematic', 'dramatic', 'epic', 'storytelling', 'emotional'],
    jamendoTags: ['cinematic', 'dramatic', 'epic'],
    limit: 20,
  },
  {
    mood: 'happy',
    genre: 'pop',
    moods: ['happy', 'cheerful', 'fröhlich', 'social', 'trendy', 'fun'],
    jamendoTags: ['happy', 'cheerful', 'fun'],
    limit: 20,
  },
  {
    mood: 'inspirational',
    genre: 'cinematic',
    moods: ['inspirational', 'motivation', 'powerful', 'epic'],
    jamendoTags: ['inspirational', 'motivational'],
    limit: 20,
  },
  {
    mood: 'acoustic',
    genre: 'acoustic',
    moods: ['acoustic', 'folk', 'warm', 'organic', 'friendly'],
    jamendoTags: ['acoustic', 'folk', 'warm'],
    limit: 20,
  },
];

function isValidMp3(bytes: Uint8Array): boolean {
  if (bytes.length < 3) return false;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
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

    // Optional: pass specific category via body
    let targetCategory: string | null = null;
    try {
      const body = await req.json();
      targetCategory = body?.category || null;
    } catch { /* no body */ }

    const categoriesToProcess = targetCategory
      ? CATEGORIES.filter(c => c.mood === targetCategory)
      : CATEGORIES;

    const results: { name: string; status: string; category: string; error?: string }[] = [];
    let totalUploaded = 0;
    let totalSkipped = 0;

    for (const cat of categoriesToProcess) {
      console.log(`\n[seed] === Processing category: ${cat.mood} (${cat.genre}) ===`);

      // Try each tag for this category to maximize variety
      const seenTrackIds = new Set<string>();
      const tracksForCategory: any[] = [];

      for (const tag of cat.jamendoTags) {
        if (tracksForCategory.length >= cat.limit) break;

        const apiUrl = `https://api.jamendo.com/v3.0/tracks/?client_id=${jamendoClientId}&format=json&limit=${cat.limit}&tags=${tag}&include=musicinfo&audioformat=mp32&order=popularity_total`;
        
        console.log(`[seed] Fetching tag="${tag}" for category="${cat.mood}"`);
        
        try {
          const resp = await fetch(apiUrl);
          if (!resp.ok) {
            console.warn(`[seed] API error for tag=${tag}: ${resp.status}`);
            continue;
          }
          const data = await resp.json();
          
          if (!data.results || data.results.length === 0) {
            console.log(`[seed] No results for tag=${tag}`);
            continue;
          }

          for (const track of data.results) {
            if (tracksForCategory.length >= cat.limit) break;
            if (seenTrackIds.has(track.id)) continue;
            seenTrackIds.add(track.id);
            tracksForCategory.push(track);
          }
          
          console.log(`[seed] Got ${data.results.length} from tag="${tag}", total for category: ${tracksForCategory.length}`);
        } catch (e) {
          console.warn(`[seed] Failed to fetch tag=${tag}:`, e);
        }
      }

      console.log(`[seed] Processing ${tracksForCategory.length} tracks for ${cat.mood}`);

      for (let i = 0; i < tracksForCategory.length; i++) {
        const track = tracksForCategory[i];
        const trackName = `${cat.mood}-${cat.genre}-${String(i + 1).padStart(3, '0')}`;
        const storagePath = `library/${trackName}.mp3`;

        // Check if already in DB
        const { data: existing } = await supabase
          .from('background_music_tracks')
          .select('id')
          .eq('source_id', track.id)
          .maybeSingle();

        if (existing) {
          console.log(`[seed] ⏩ Already exists: source_id=${track.id}`);
          totalSkipped++;
          results.push({ name: trackName, status: 'exists', category: cat.mood });
          continue;
        }

        // Download audio
        const audioUrl = track.audio || `https://mp3l.jamendo.com/?trackid=${track.id}&format=mp31`;
        
        try {
          console.log(`[seed] Downloading ${trackName} (Jamendo ID: ${track.id})...`);
          const audioResp = await fetch(audioUrl);
          if (!audioResp.ok) {
            results.push({ name: trackName, status: 'download_failed', category: cat.mood, error: `HTTP ${audioResp.status}` });
            continue;
          }

          const bytes = new Uint8Array(await audioResp.arrayBuffer());

          if (!isValidMp3(bytes)) {
            results.push({ name: trackName, status: 'invalid_mp3', category: cat.mood, error: 'Magic byte check failed' });
            continue;
          }

          if (bytes.length < 50000) {
            results.push({ name: trackName, status: 'too_small', category: cat.mood, error: `Only ${bytes.length} bytes` });
            continue;
          }

          console.log(`[seed] Downloaded ${trackName}: ${(bytes.length / 1024 / 1024).toFixed(1)} MB`);

          // Upload to storage
          const { error: uploadError } = await supabase.storage
            .from('background-music')
            .upload(storagePath, bytes, {
              contentType: 'audio/mpeg',
              upsert: true,
            });

          if (uploadError) {
            results.push({ name: trackName, status: 'upload_failed', category: cat.mood, error: uploadError.message });
            continue;
          }

          // Insert metadata into DB — mark as PENDING until Lambda-validated
          const { error: dbError } = await supabase
            .from('background_music_tracks')
            .insert({
              storage_path: storagePath,
              name: trackName,
              mood: cat.mood,
              genre: cat.genre,
              moods: cat.moods,
              source_id: track.id,
              duration_seconds: track.duration || null,
              file_size_bytes: bytes.length,
              is_valid: true,
              validation_status: 'pending',
            });

          if (dbError) {
            console.warn(`[seed] DB insert failed for ${trackName}:`, dbError.message);
            results.push({ name: trackName, status: 'db_error', category: cat.mood, error: dbError.message });
            continue;
          }

          totalUploaded++;
          console.log(`[seed] ✅ Uploaded + saved: ${trackName}`);
          results.push({ name: trackName, status: 'uploaded', category: cat.mood });
        } catch (trackErr) {
          const msg = trackErr instanceof Error ? trackErr.message : String(trackErr);
          console.error(`[seed] ❌ Failed ${trackName}:`, msg);
          results.push({ name: trackName, status: 'error', category: cat.mood, error: msg });
        }
      }
    }

    const summary = {
      ok: true,
      totalProcessed: results.length,
      uploaded: totalUploaded,
      skipped: totalSkipped,
      failed: results.filter(r => !['uploaded', 'exists'].includes(r.status)).length,
      byCategory: Object.fromEntries(
        CATEGORIES.map(c => [
          c.mood,
          {
            uploaded: results.filter(r => r.category === c.mood && r.status === 'uploaded').length,
            exists: results.filter(r => r.category === c.mood && r.status === 'exists').length,
            failed: results.filter(r => r.category === c.mood && !['uploaded', 'exists'].includes(r.status)).length,
          },
        ])
      ),
    };

    console.log(`\n[seed] === DONE === Uploaded: ${totalUploaded}, Skipped: ${totalSkipped}, Failed: ${summary.failed}`);

    return new Response(
      JSON.stringify(summary),
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
