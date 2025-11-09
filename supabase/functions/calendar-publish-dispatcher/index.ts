import { withTelemetry } from '../_shared/telemetry.ts';
import { getSupabaseClient } from '../_shared/db-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CalendarEvent {
  id: string;
  workspace_id: string;
  caption: string;
  channels: string[];
  assets_json: any[];
  attempt_no: number;
  owner_id: string;
}

// Exponential backoff: 1m, 5m, 15m, 60m, 240m
const RETRY_DELAYS_MINUTES = [1, 5, 15, 60, 240];
const MAX_ATTEMPTS = 5;

Deno.serve(withTelemetry('calendar-publish-dispatcher', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = getSupabaseClient();

    console.log('[Dispatcher] Starting publish dispatcher run');

    // Find events that need to be published
    const { data: events, error: fetchError } = await supabase
      .from('calendar_events')
      .select('*')
      .in('status', ['scheduled', 'failed'])
      .lte('start_at', new Date().toISOString())
      .is('locked_by', null)
      .lt('attempt_no', MAX_ATTEMPTS)
      .order('start_at', { ascending: true })
      .limit(50);

    if (fetchError) {
      console.error('[Dispatcher] Error fetching events:', fetchError);
      throw fetchError;
    }

    if (!events || events.length === 0) {
      console.log('[Dispatcher] No events to publish');
      return new Response(
        JSON.stringify({ processed: 0, succeeded: 0, failed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Dispatcher] Found ${events.length} events to publish`);

    let succeeded = 0;
    let failed = 0;

    // Process each event
    for (const event of events as CalendarEvent[]) {
      try {
        // Acquire lock
        const { error: lockError } = await supabase
          .from('calendar_events')
          .update({
            locked_by: 'dispatcher',
            locked_at: new Date().toISOString(),
            status: 'queued',
          })
          .eq('id', event.id)
          .is('locked_by', null);

        if (lockError) {
          console.log(`[Dispatcher] Failed to acquire lock for event ${event.id}`);
          continue;
        }

        // Log start
        await supabase.from('calendar_publish_logs').insert({
          event_id: event.id,
          workspace_id: event.workspace_id,
          level: 'info',
          message: `Publishing started (attempt ${event.attempt_no + 1}/${MAX_ATTEMPTS})`,
          meta: { channels: event.channels },
        });

        // Prepare media for publish
        const media = event.assets_json?.map((asset: any) => ({
          type: asset.type || 'image',
          path: asset.url || asset.path,
          mime: asset.mime || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
          size: asset.size || 0,
        })) || [];

        // Call the publish function
        const { data: publishResult, error: publishError } = await supabase.functions.invoke(
          'publish',
          {
            body: {
              text_content: event.caption,
              media,
              channels: event.channels,
              calendar_event_id: event.id,
            },
          }
        );

        if (publishError) {
          console.error(`[Dispatcher] Publish error for event ${event.id}:`, publishError);
          
          // Calculate next retry time
          const nextRetryMinutes = RETRY_DELAYS_MINUTES[event.attempt_no] || RETRY_DELAYS_MINUTES[RETRY_DELAYS_MINUTES.length - 1];
          const nextRetryAt = new Date(Date.now() + nextRetryMinutes * 60000).toISOString();

          // Update event as failed
          await supabase
            .from('calendar_events')
            .update({
              status: 'failed',
              attempt_no: event.attempt_no + 1,
              next_retry_at: nextRetryAt,
              error: { message: publishError.message, code: publishError.code },
              locked_by: null,
              locked_at: null,
            })
            .eq('id', event.id);

          // Log error
          await supabase.from('calendar_publish_logs').insert({
            event_id: event.id,
            workspace_id: event.workspace_id,
            level: 'error',
            message: `Publishing failed: ${publishError.message}`,
            meta: { error: publishError, next_retry_at: nextRetryAt },
          });

          failed++;
          continue;
        }

        // Check if all platforms succeeded
        const allSucceeded = publishResult?.results?.every((r: any) => r.ok);
        const platformResults = publishResult?.results?.reduce((acc: any, r: any) => {
          acc[r.provider] = {
            ok: r.ok,
            external_id: r.external_id,
            permalink: r.permalink,
            error_code: r.error_code,
            error_message: r.error_message,
          };
          return acc;
        }, {});

        if (allSucceeded) {
          // Update event as published
          await supabase
            .from('calendar_events')
            .update({
              status: 'published',
              published_at: new Date().toISOString(),
              publish_results: platformResults,
              locked_by: null,
              locked_at: null,
            })
            .eq('id', event.id);

          // Log success
          await supabase.from('calendar_publish_logs').insert({
            event_id: event.id,
            workspace_id: event.workspace_id,
            level: 'info',
            message: 'Publishing succeeded on all platforms',
            meta: { results: platformResults },
          });

          succeeded++;
        } else {
          // Partial failure - calculate retry
          const nextRetryMinutes = RETRY_DELAYS_MINUTES[event.attempt_no] || RETRY_DELAYS_MINUTES[RETRY_DELAYS_MINUTES.length - 1];
          const nextRetryAt = new Date(Date.now() + nextRetryMinutes * 60000).toISOString();

          await supabase
            .from('calendar_events')
            .update({
              status: 'failed',
              attempt_no: event.attempt_no + 1,
              next_retry_at: nextRetryAt,
              error: { message: 'Some platforms failed', results: platformResults },
              publish_results: platformResults,
              locked_by: null,
              locked_at: null,
            })
            .eq('id', event.id);

          // Log partial failure
          await supabase.from('calendar_publish_logs').insert({
            event_id: event.id,
            workspace_id: event.workspace_id,
            level: 'warn',
            message: 'Publishing partially failed',
            meta: { results: platformResults, next_retry_at: nextRetryAt },
          });

          failed++;
        }
      } catch (eventError) {
        console.error(`[Dispatcher] Error processing event ${event.id}:`, eventError);
        
        // Release lock and mark as failed
        await supabase
          .from('calendar_events')
          .update({
            status: 'failed',
            attempt_no: event.attempt_no + 1,
            error: { message: String(eventError) },
            locked_by: null,
            locked_at: null,
          })
          .eq('id', event.id);

        failed++;
      }
    }

    console.log(`[Dispatcher] Completed: ${succeeded} succeeded, ${failed} failed`);

    return new Response(
      JSON.stringify({ processed: events.length, succeeded, failed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Dispatcher] Fatal error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}));
