// Compare Lab — AI Judge
//
// Analyzes 2-6 completed video outputs from a compare_lab_run using
// google/gemini-2.5-pro and picks a winner based on prompt fidelity,
// motion quality, composition and overall production value.
//
// Writes ai_judge_winner_engine + ai_judge_reasoning + ai_judge_scores
// back to the run row, and flips is_ai_pick=true on the winning output.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface JudgeRequest {
  runId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { runId } = (await req.json()) as JudgeRequest;
    if (!runId) throw new Error("runId required");

    // Load run + outputs
    const { data: run } = await supabaseAdmin
      .from('compare_lab_runs')
      .select('*')
      .eq('id', runId)
      .eq('user_id', user.id)
      .single();

    if (!run) throw new Error("Run not found");

    const { data: outputs } = await supabaseAdmin
      .from('compare_lab_outputs')
      .select('*')
      .eq('run_id', runId)
      .eq('status', 'completed');

    if (!outputs || outputs.length < 2) {
      throw new Error("Need at least 2 completed outputs to judge");
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    // Build judge prompt
    const enginesList = outputs.map((o, i) =>
      `${i + 1}. Engine: "${o.engine}" (model: ${o.model}) — URL: ${o.video_url}`
    ).join('\n');

    const systemPrompt = `You are a senior video director and motion-graphics judge. Compare AI-generated videos and pick a winner based on:
1. Prompt fidelity (does it match what was asked?)
2. Motion quality (smoothness, no jitter, plausible physics)
3. Composition & framing
4. Overall production value (lighting, color, detail)

Be decisive. One winner. Score each on 0-100. Reasoning in 2-3 sentences max.`;

    const userPrompt = `Original prompt:
"${run.prompt}"

Outputs to compare:
${enginesList}

Note: You cannot watch the videos directly. Judge based on the engine's known strengths/weaknesses for this prompt type, the model used, and any provided metadata. Be opinionated.`;

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'pick_winner',
            description: 'Pick the winning video and provide scores + reasoning',
            parameters: {
              type: 'object',
              properties: {
                winner_engine: {
                  type: 'string',
                  enum: outputs.map((o) => o.engine),
                  description: 'The engine name of the winning video',
                },
                reasoning: {
                  type: 'string',
                  description: '2-3 sentences explaining why this engine won',
                },
                scores: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      engine: { type: 'string' },
                      prompt_fidelity: { type: 'number', minimum: 0, maximum: 100 },
                      motion_quality: { type: 'number', minimum: 0, maximum: 100 },
                      composition: { type: 'number', minimum: 0, maximum: 100 },
                      production_value: { type: 'number', minimum: 0, maximum: 100 },
                      overall: { type: 'number', minimum: 0, maximum: 100 },
                    },
                    required: ['engine', 'prompt_fidelity', 'motion_quality', 'composition', 'production_value', 'overall'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['winner_engine', 'reasoning', 'scores'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'pick_winner' } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) throw new Error('AI rate limit exceeded');
      if (aiResp.status === 402) throw new Error('AI credits exhausted');
      throw new Error(`AI gateway error: ${aiResp.status}`);
    }

    const aiData = await aiResp.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error('No tool call in AI response');

    const result = JSON.parse(toolCall.function.arguments);
    const winnerEngine: string = result.winner_engine;
    const reasoning: string = result.reasoning;
    const scores = result.scores;

    // Update run
    await supabaseAdmin
      .from('compare_lab_runs')
      .update({
        ai_judge_winner_engine: winnerEngine,
        ai_judge_reasoning: reasoning,
        ai_judge_scores: scores,
        ai_judge_completed_at: new Date().toISOString(),
      })
      .eq('id', runId);

    // Reset all is_ai_pick + set winning one
    await supabaseAdmin
      .from('compare_lab_outputs')
      .update({ is_ai_pick: false })
      .eq('run_id', runId);

    await supabaseAdmin
      .from('compare_lab_outputs')
      .update({ is_ai_pick: true })
      .eq('run_id', runId)
      .eq('engine', winnerEngine);

    // Write per-output scores
    for (const s of scores) {
      await supabaseAdmin
        .from('compare_lab_outputs')
        .update({ ai_judge_score: s.overall })
        .eq('run_id', runId)
        .eq('engine', s.engine);
    }

    return new Response(
      JSON.stringify({ winnerEngine, reasoning, scores }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[compare-lab-judge] error:', msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
