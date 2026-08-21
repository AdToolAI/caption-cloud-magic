import { createClient } from 'npm:@supabase/supabase-js@2.39.3';
import { isQaMockRequest, qaMockJson } from "../_shared/qaMock.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-qa-mock',
};

interface ScheduledPublication {
  id: string;
  user_id: string;
  platform: 'instagram' | 'tiktok' | 'linkedin' | 'youtube';
  video_url: string;
  caption?: string;
  title?: string;
  description?: string;
  hashtags?: string[];
  publish_at: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (isQaMockRequest(req)) {
    return qaMockJson(corsHeaders, { processed: 0 });
  }


  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all pending publications that are due
    const { data: publications, error: fetchError } = await supabase
      .from('scheduled_publications')
      .select('*')
      .eq('status', 'pending')
      .lte('publish_at', new Date().toISOString())
      .limit(10);

    if (fetchError) {
      console.error('Error fetching scheduled publications:', fetchError);
      throw fetchError;
    }

    if (!publications || publications.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No publications due', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${publications.length} scheduled publications`);

    const results = await Promise.allSettled(
      publications.map(async (pub: ScheduledPublication) => {
        try {
          // Route through the per-user publish orchestrator so the user's own
          // connected social accounts are used (the legacy publish-to-* functions
          // only work with a single global env token).
          const caption = [pub.caption || '', (pub.hashtags || []).join(' ')]
            .filter(Boolean)
            .join('\n\n');

          const payload: any = {
            user_id: pub.user_id,
            text: caption || pub.title || 'Video',
            channels: [pub.platform],
            media: pub.video_url
              ? [{ type: 'video', path: pub.video_url, mime: 'video/mp4', size: 0 }]
              : [],
          };

          if (pub.platform === 'youtube') {
            payload.youtubeConfig = {
              title: pub.title || pub.caption?.substring(0, 100) || 'Video',
              description: pub.description || pub.caption || '',
              tags: pub.hashtags || [],
            };
          }

          const { data: publishResult, error: publishError } = await supabase.functions.invoke(
            'publish',
            { body: payload }
          );

          if (publishError) throw publishError;

          const platformResult = publishResult?.results?.find(
            (r: any) => r.provider === pub.platform,
          );
          if (platformResult && platformResult.ok === false) {
            throw new Error(platformResult.error_message || 'Publishing failed');
          }


          // Update scheduled publication status
          await supabase
            .from('scheduled_publications')
            .update({
              status: 'published',
              result_data: publishResult,
              updated_at: new Date().toISOString(),
            })
            .eq('id', pub.id);

          // Log to publications history
          await supabase
            .from('social_media_publications')
            .insert({
              user_id: pub.user_id,
              scheduled_publication_id: pub.id,
              event_id: (pub as any).event_id,
              platform: pub.platform,
              post_url: publishResult.url,
              external_id: publishResult.postId,
              caption: pub.caption,
              hashtags: pub.hashtags,
              metadata: publishResult,
            });

          console.log(`✅ Successfully published ${pub.platform} post for user ${pub.user_id}`);
          return { id: pub.id, success: true, platform: pub.platform };
        } catch (error: any) {
          console.error(`❌ Failed to publish ${pub.platform} post:`, error);

          // Update with error and increment retry count
          const retryCount = ((pub as any).retry_count || 0) + 1;
          const newStatus = retryCount >= 3 ? 'failed' : 'pending';

          await supabase
            .from('scheduled_publications')
            .update({
              status: newStatus,
              error_message: error.message,
              retry_count: retryCount,
              updated_at: new Date().toISOString(),
            })
            .eq('id', pub.id);

          return { id: pub.id, success: false, platform: pub.platform, error: error.message };
        }
      })
    );

    const successful = results.filter(r => r.status === 'fulfilled' && (r.value as any).success).length;
    const failed = results.length - successful;

    return new Response(
      JSON.stringify({
        message: 'Scheduled publications processed',
        total: publications.length,
        successful,
        failed,
        results: results.map(r => r.status === 'fulfilled' ? r.value : { error: (r as any).reason }),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in check-scheduled-publications:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
