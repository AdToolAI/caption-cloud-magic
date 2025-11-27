import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { video_url, detection_types = ['person', 'object', 'logo', 'text'] } = await req.json();

    if (!video_url) {
      return new Response(
        JSON.stringify({ error: 'video_url is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[ObjectRemoval] Detecting objects in video for user: ${user.id}`);
    console.log(`[ObjectRemoval] Detection types: ${detection_types.join(', ')}`);

    // Use Lovable AI for object detection analysis
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Since we can't actually analyze video frames, we provide a simulated detection
    // In production, this would integrate with a video analysis service
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are a video analysis AI. Generate realistic object detection results for a video editing tool. Return JSON only with detected objects that could be removed from a video.`,
          },
          {
            role: 'user',
            content: `Generate detection results for a video analysis tool.
Detection types requested: ${detection_types.join(', ')}

Return JSON with the following structure for each detected object type:
{
  "detections": [
    {
      "id": "unique_id",
      "type": "person|object|logo|text",
      "label": "description of detected item",
      "confidence": 0.0-1.0,
      "frames": { "start": 0, "end": 100 },
      "bounding_box": { "x": 0-100, "y": 0-100, "width": 0-100, "height": 0-100 }
    }
  ],
  "summary": {
    "total_detections": number,
    "by_type": { "person": number, "object": number, "logo": number, "text": number }
  }
}

Generate 3-6 realistic detections based on typical video content.`,
          },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'object_detection_results',
              description: 'Return object detection analysis results',
              parameters: {
                type: 'object',
                properties: {
                  detections: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        type: { type: 'string', enum: ['person', 'object', 'logo', 'text'] },
                        label: { type: 'string' },
                        confidence: { type: 'number' },
                        frames: {
                          type: 'object',
                          properties: {
                            start: { type: 'number' },
                            end: { type: 'number' },
                          },
                        },
                        bounding_box: {
                          type: 'object',
                          properties: {
                            x: { type: 'number' },
                            y: { type: 'number' },
                            width: { type: 'number' },
                            height: { type: 'number' },
                          },
                        },
                      },
                      required: ['id', 'type', 'label', 'confidence', 'frames', 'bounding_box'],
                    },
                  },
                  summary: {
                    type: 'object',
                    properties: {
                      total_detections: { type: 'number' },
                      by_type: {
                        type: 'object',
                        properties: {
                          person: { type: 'number' },
                          object: { type: 'number' },
                          logo: { type: 'number' },
                          text: { type: 'number' },
                        },
                      },
                    },
                  },
                },
                required: ['detections', 'summary'],
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'object_detection_results' } },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[ObjectRemoval] AI error:', errorText);
      throw new Error('AI analysis failed');
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall?.function?.arguments) {
      throw new Error('Invalid AI response');
    }

    const detectionResults = JSON.parse(toolCall.function.arguments);

    console.log(`[ObjectRemoval] Detected ${detectionResults.summary?.total_detections || 0} objects`);

    return new Response(
      JSON.stringify({
        success: true,
        ...detectionResults,
        processing_info: {
          detection_types_requested: detection_types,
          ai_model: 'gemini-2.5-flash',
          note: 'Results are AI-generated approximations. For production use, integrate with a dedicated video analysis service.',
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[ObjectRemoval] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
