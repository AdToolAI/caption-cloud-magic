import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, error: 'No authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { video_url } = await req.json();
    if (!video_url) {
      return new Response(JSON.stringify({ ok: false, error: 'video_url is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: 'LOVABLE_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[DetectSubtitleBand] Analyzing video for burned-in subtitles:', video_url);

    // Use Gemini Vision to analyze the video for burned-in subtitle positions
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are a video analysis expert. Your task is to analyze a video and detect if it has burned-in subtitles or text overlays at the bottom of the frame.

You must return a JSON object with these fields:
- hasSubtitles: boolean - whether burned-in text is visible at the bottom
- bottomBandPercent: number - percentage of the bottom area that contains text (typically 8-20%)
- confidence: number - 0.0 to 1.0 how confident you are
- description: string - brief description of what text you see

IMPORTANT: Only detect TEXT that is BURNED INTO the video (hardcoded subtitles, watermarks, captions). Do NOT count UI elements or controls.

Common subtitle positions:
- Light subtitles: bottom 6-8% of frame
- Standard subtitles: bottom 10-14% of frame  
- Large/styled subtitles: bottom 15-20% of frame

Return ONLY valid JSON, no markdown.`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this video for burned-in subtitles at the bottom. What percentage of the bottom needs to be cropped to fully remove all visible text?'
              },
              {
                type: 'image_url',
                image_url: { url: video_url }
              }
            ]
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'report_subtitle_detection',
              description: 'Report the subtitle detection results',
              parameters: {
                type: 'object',
                properties: {
                  hasSubtitles: { type: 'boolean', description: 'Whether burned-in subtitles are detected' },
                  bottomBandPercent: { type: 'number', description: 'Percentage of bottom area containing text (0-25)' },
                  confidence: { type: 'number', description: 'Confidence score 0.0-1.0' },
                  description: { type: 'string', description: 'Brief description of detected text' },
                },
                required: ['hasSubtitles', 'bottomBandPercent', 'confidence', 'description'],
                additionalProperties: false,
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'report_subtitle_detection' } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[DetectSubtitleBand] AI error:', response.status, errText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ ok: false, error: 'Rate limit exceeded, please try again later.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ ok: false, error: 'Payment required, please add credits.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      return new Response(JSON.stringify({ ok: false, error: 'AI analysis failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await response.json();
    console.log('[DetectSubtitleBand] AI response:', JSON.stringify(aiData));

    // Extract tool call result
    let result = { hasSubtitles: false, bottomBandPercent: 12, confidence: 0.5, description: 'No analysis available' };
    
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        result = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.warn('[DetectSubtitleBand] Failed to parse tool call:', e);
      }
    } else {
      // Fallback: try to parse from content
      const content = aiData.choices?.[0]?.message?.content;
      if (content) {
        try {
          result = JSON.parse(content);
        } catch {
          console.warn('[DetectSubtitleBand] Could not parse content as JSON');
        }
      }
    }

    // Clamp values to safe ranges
    result.bottomBandPercent = Math.max(4, Math.min(25, result.bottomBandPercent || 12));
    result.confidence = Math.max(0, Math.min(1, result.confidence || 0.5));

    // Calculate recommended safe zone settings based on detection
    const bottomPercent = result.bottomBandPercent;
    // Add 2% safety margin
    const safeBottomPercent = Math.min(25, bottomPercent + 2);
    // Zoom: need to scale up to fill the cropped area
    const zoom = 1 / (1 - safeBottomPercent / 100);
    // OffsetY: shift up by half the cropped amount 
    const offsetY = -(safeBottomPercent / 2);

    const safeZone = {
      enabled: true,
      mode: 'reframe' as const,
      preset: 'custom' as const,
      zoom: Math.round(zoom * 100) / 100,
      offsetY: Math.round(offsetY * 10) / 10,
      bottomBandPercent: safeBottomPercent,
    };

    console.log('[DetectSubtitleBand] Result:', { detection: result, safeZone });

    return new Response(JSON.stringify({
      ok: true,
      detection: result,
      safeZone,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[DetectSubtitleBand] Error:', error);
    return new Response(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
