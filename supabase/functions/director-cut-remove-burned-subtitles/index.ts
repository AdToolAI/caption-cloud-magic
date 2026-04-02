import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import Replicate from "https://esm.sh/replicate@0.25.2";

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

    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('No authorization header');
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Unauthorized');

    const { video_url } = await req.json();
    if (!video_url) {
      return new Response(JSON.stringify({ error: 'video_url is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[RemoveBurnedSubs] Starting for user:', user.id);

    // Step 1: Use Gemini Vision to detect burned-in subtitle region
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    console.log('[RemoveBurnedSubs] Step 1: Detecting subtitle region with Gemini Vision...');

    const visionResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this video for burned-in (hardcoded) subtitles or text overlays at the bottom of the video. 

If burned-in text is found, respond with ONLY a JSON object like this:
{"found": true, "y_start_percent": 80, "y_end_percent": 100, "description": "White text on dark background at bottom"}

If no burned-in text is found:
{"found": false}

Important: y_start_percent and y_end_percent are percentages from the top of the frame (0=top, 100=bottom).
Only detect text that is part of the video frames (burned-in), NOT separate subtitle tracks.`
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
              name: 'report_subtitle_region',
              description: 'Report the detected burned-in subtitle region',
              parameters: {
                type: 'object',
                properties: {
                  found: { type: 'boolean', description: 'Whether burned-in subtitles were found' },
                  y_start_percent: { type: 'number', description: 'Top of subtitle region as percentage from top (0-100)' },
                  y_end_percent: { type: 'number', description: 'Bottom of subtitle region as percentage from top (0-100)' },
                  description: { type: 'string', description: 'Description of the found text' },
                },
                required: ['found'],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'report_subtitle_region' } },
      }),
    });

    if (!visionResponse.ok) {
      const errText = await visionResponse.text();
      console.error('[RemoveBurnedSubs] Vision API error:', visionResponse.status, errText);
      throw new Error(`Vision analysis failed: ${visionResponse.status}`);
    }

    const visionData = await visionResponse.json();
    
    let detection: { found: boolean; y_start_percent?: number; y_end_percent?: number; description?: string };
    
    // Parse tool call response
    const toolCall = visionData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      detection = JSON.parse(toolCall.function.arguments);
    } else {
      // Fallback: try to parse from content
      const content = visionData.choices?.[0]?.message?.content || '';
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        detection = jsonMatch ? JSON.parse(jsonMatch[0]) : { found: false };
      } catch {
        detection = { found: false };
      }
    }

    console.log('[RemoveBurnedSubs] Detection result:', detection);

    if (!detection.found) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Keine eingebrannten Untertitel erkannt',
        detection,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 2: Use Replicate ProPainter for video inpainting
    const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
    if (!REPLICATE_API_KEY) throw new Error('REPLICATE_API_KEY not configured');

    const replicate = new Replicate({ auth: REPLICATE_API_KEY });

    const yStart = detection.y_start_percent || 75;
    const yEnd = detection.y_end_percent || 100;

    console.log(`[RemoveBurnedSubs] Step 2: Inpainting region y=${yStart}%-${yEnd}% with ProPainter...`);

    // Use ProPainter video inpainting model
    // The model accepts video + mask specification
    const output = await replicate.run(
      "sczhou/propainter:89c0caaa1e6c6747a4f8e44b2ae39f7e1f96aa0bb9e0e3fad4e3feb8e0d3c9c8",
      {
        input: {
          video: video_url,
          // ProPainter uses mask-based inpainting
          // We specify the region to inpaint as bottom portion
          mask_type: "rectangle",
          mask_y_start: yStart / 100,
          mask_y_end: yEnd / 100,
          mask_x_start: 0,
          mask_x_end: 1,
          // Propagation settings for better quality
          flow_completion: true,
          use_half_precision: true,
        },
      }
    );

    console.log('[RemoveBurnedSubs] ProPainter output:', typeof output, output);

    // Get the output URL
    let cleanedVideoUrl: string;
    if (typeof output === 'string') {
      cleanedVideoUrl = output;
    } else if (Array.isArray(output) && output.length > 0) {
      cleanedVideoUrl = output[0];
    } else if (output && typeof output === 'object' && 'output' in output) {
      cleanedVideoUrl = (output as any).output;
    } else {
      throw new Error('Unexpected ProPainter output format');
    }

    // Step 3: Upload cleaned video to Supabase Storage
    console.log('[RemoveBurnedSubs] Step 3: Downloading and uploading cleaned video...');
    
    const videoResponse = await fetch(cleanedVideoUrl);
    if (!videoResponse.ok) throw new Error('Failed to download cleaned video');
    
    const videoBlob = await videoResponse.arrayBuffer();
    const fileName = `cleaned-${user.id}-${Date.now()}.mp4`;
    const storagePath = `burned-sub-removal/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('video-assets')
      .upload(storagePath, videoBlob, {
        contentType: 'video/mp4',
        upsert: true,
      });

    if (uploadError) {
      console.error('[RemoveBurnedSubs] Upload error:', uploadError);
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('video-assets')
      .getPublicUrl(storagePath);

    console.log('[RemoveBurnedSubs] Success! Cleaned video at:', publicUrl);

    return new Response(JSON.stringify({
      success: true,
      cleaned_video_url: publicUrl,
      detection,
      message: 'Eingebrannte Untertitel erfolgreich entfernt',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[RemoveBurnedSubs] Error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
      success: false,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
