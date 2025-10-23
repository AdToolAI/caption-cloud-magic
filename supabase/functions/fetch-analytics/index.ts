import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MetricsPayload {
  post_id: string;
  provider: string;
  external_id: string;
  user_id: string;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  impressions: number;
  engagement_rate: number;
  fetched_at: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    console.log("[fetch-analytics] Starting daily analytics fetch...");

    // Get all social connections with auto-sync enabled
    const { data: connections, error: connError } = await supabase
      .from("social_connections")
      .select("id, user_id, provider, access_token, token_expires_at")
      .eq("auto_sync_enabled", true)
      .not("access_token", "is", null);

    if (connError) {
      console.error("[fetch-analytics] Error fetching connections:", connError);
      throw connError;
    }

    console.log(`[fetch-analytics] Found ${connections?.length || 0} active connections`);

    const metrics: MetricsPayload[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (const conn of connections || []) {
      // Check token expiration
      if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date()) {
        console.warn(`[fetch-analytics] Token expired for user ${conn.user_id}, provider ${conn.provider}`);
        errorCount++;
        continue;
      }

      try {
        console.log(`[fetch-analytics] Fetching metrics for ${conn.provider} (user: ${conn.user_id})`);
        
        // Get recent posts from post_metrics to update
        const { data: posts } = await supabase
          .from("post_metrics")
          .select("id, external_id, platform_post_id, provider")
          .eq("user_id", conn.user_id)
          .eq("provider", conn.provider)
          .gte("posted_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .limit(100);

        if (!posts || posts.length === 0) {
          console.log(`[fetch-analytics] No posts to update for ${conn.provider}`);
          continue;
        }

        // Fetch metrics per provider
        for (const post of posts) {
          const postId = post.external_id || post.platform_post_id;
          if (!postId) continue;

          let fetchedMetrics = { likes: 0, comments: 0, shares: 0, views: 0, impressions: 0 };

          try {
            switch (conn.provider) {
              case "instagram": {
                const res = await fetch(
                  `https://graph.facebook.com/v21.0/${postId}?fields=like_count,comments_count,insights.metric(impressions,reach,saved,engagement)&access_token=${conn.access_token}`
                );
                if (res.ok) {
                  const data = await res.json();
                  const insights = data.insights?.data || [];
                  const getMetric = (name: string) => insights.find((i: any) => i.name === name)?.values?.[0]?.value || 0;
                  
                  fetchedMetrics = {
                    likes: data.like_count || 0,
                    comments: data.comments_count || 0,
                    shares: 0,
                    views: getMetric("reach"),
                    impressions: getMetric("impressions"),
                  };
                }
                break;
              }

              case "facebook": {
                const res = await fetch(
                  `https://graph.facebook.com/v21.0/${postId}?fields=likes.summary(true),comments.summary(true),shares,insights.metric(post_impressions,post_engaged_users)&access_token=${conn.access_token}`
                );
                if (res.ok) {
                  const data = await res.json();
                  const insights = data.insights?.data || [];
                  const getMetric = (name: string) => insights.find((i: any) => i.name === name)?.values?.[0]?.value || 0;
                  
                  fetchedMetrics = {
                    likes: data.likes?.summary?.total_count || 0,
                    comments: data.comments?.summary?.total_count || 0,
                    shares: data.shares?.count || 0,
                    views: 0,
                    impressions: getMetric("post_impressions"),
                  };
                }
                break;
              }

              case "tiktok": {
                const res = await fetch(
                  `https://open.tiktokapis.com/v2/video/query/?fields=id,like_count,comment_count,share_count,view_count`,
                  {
                    method: "POST",
                    headers: {
                      "Authorization": `Bearer ${conn.access_token}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ filters: { video_ids: [postId] } }),
                  }
                );
                if (res.ok) {
                  const data = await res.json();
                  const video = data.data?.videos?.[0];
                  if (video) {
                    fetchedMetrics = {
                      likes: video.like_count || 0,
                      comments: video.comment_count || 0,
                      shares: video.share_count || 0,
                      views: video.view_count || 0,
                      impressions: 0,
                    };
                  }
                }
                break;
              }

              case "x": {
                const res = await fetch(
                  `https://api.twitter.com/2/tweets/${postId}?tweet.fields=public_metrics`,
                  {
                    headers: { Authorization: `Bearer ${conn.access_token}` },
                  }
                );
                if (res.ok) {
                  const data = await res.json();
                  const pm = data.data?.public_metrics;
                  if (pm) {
                    fetchedMetrics = {
                      likes: pm.like_count || 0,
                      comments: pm.reply_count || 0,
                      shares: pm.retweet_count || 0,
                      views: pm.impression_count || 0,
                      impressions: pm.impression_count || 0,
                    };
                  }
                }
                break;
              }

              case "linkedin": {
                const res = await fetch(
                  `https://api.linkedin.com/v2/socialActions/${postId}`,
                  {
                    headers: { Authorization: `Bearer ${conn.access_token}` },
                  }
                );
                if (res.ok) {
                  const data = await res.json();
                  const counts = data.totalSocialActivityCounts;
                  if (counts) {
                    fetchedMetrics = {
                      likes: counts.likeCount || 0,
                      comments: counts.commentCount || 0,
                      shares: counts.shareCount || 0,
                      views: 0,
                      impressions: 0,
                    };
                  }
                }
                break;
              }

              case "youtube": {
                const ytApiKey = Deno.env.get("YOUTUBE_CLIENT_SECRET");
                if (ytApiKey) {
                  const res = await fetch(
                    `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${postId}&key=${ytApiKey}`
                  );
                  if (res.ok) {
                    const data = await res.json();
                    const stats = data.items?.[0]?.statistics;
                    if (stats) {
                      fetchedMetrics = {
                        likes: parseInt(stats.likeCount || "0"),
                        comments: parseInt(stats.commentCount || "0"),
                        shares: 0,
                        views: parseInt(stats.viewCount || "0"),
                        impressions: 0,
                      };
                    }
                  }
                }
                break;
              }
            }

            // Calculate engagement rate
            const totalEngagement = fetchedMetrics.likes + fetchedMetrics.comments + fetchedMetrics.shares;
            const reach = Math.max(fetchedMetrics.views || fetchedMetrics.impressions || 1, 1);
            const engagementRate = (totalEngagement / reach) * 100;

            // Update post_metrics
            const { error: updateError } = await supabase
              .from("post_metrics")
              .update({
                likes: fetchedMetrics.likes,
                comments: fetchedMetrics.comments,
                shares: fetchedMetrics.shares,
                impressions: fetchedMetrics.impressions,
                reach: fetchedMetrics.views,
                engagement_rate: engagementRate,
                fetched_at: new Date().toISOString(),
              })
              .eq("id", post.id);

            if (!updateError) {
              successCount++;
              console.log(`[fetch-analytics] Updated metrics for post ${postId}`);
            } else {
              console.error(`[fetch-analytics] Error updating post ${postId}:`, updateError);
              errorCount++;
            }
          } catch (postError) {
            console.error(`[fetch-analytics] Error fetching metrics for post ${postId}:`, postError);
            errorCount++;
          }

          // Rate limit protection: wait 100ms between API calls
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (connError) {
        console.error(`[fetch-analytics] Error processing connection ${conn.provider}:`, connError);
        errorCount++;
      }
    }

    console.log(`[fetch-analytics] Completed. Success: ${successCount}, Errors: ${errorCount}`);

    return new Response(
      JSON.stringify({
        ok: true,
        timestamp: new Date().toISOString(),
        summary: {
          total_connections: connections?.length || 0,
          metrics_updated: successCount,
          errors: errorCount,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[fetch-analytics] Fatal error:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
