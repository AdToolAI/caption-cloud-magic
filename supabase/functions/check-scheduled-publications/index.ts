import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
          // Determine which edge function to call
          const functionName = `publish-to-${pub.platform}`;
          
          // Prepare payload based on platform
          const payload: any = {
            videoUrl: pub.video_url,
            caption: pub.caption || '',
            hashtags: pub.hashtags || [],
          };

          // Platform-specific fields
          if (pub.platform === 'youtube') {
            payload.title = pub.title || pub.caption?.substring(0, 100) || 'Video';
            payload.description = pub.description || pub.caption || '';
            payload.tags = pub.hashtags || [];
          } else if (pub.platform === 'linkedin') {
            payload.visibility = 'PUBLIC';
          }

          // Call the appropriate publishing function
          const { data: publishResult, error: publishError } = await supabase.functions.invoke(
            functionName,
            { body: payload }
          );

          if (publishError) throw publishError;

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
