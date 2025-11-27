import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TRANSITIONS_CREDITS = 2;

interface Scene {
  id: string;
  startTime: number;
  endTime: number;
  mood?: string;
  energy?: string;
  content?: string;
}

interface TransitionRecommendation {
  sceneId: string;
  transitionType: string;
  duration: number;
  confidence: number;
  reasoning: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

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

    const { scenes, video_mood, video_genre, beat_analysis } = await req.json();

    if (!scenes || !Array.isArray(scenes) || scenes.length < 2) {
      return new Response(
        JSON.stringify({ error: 'At least 2 scenes are required for transition analysis' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Director-Cut-Transitions] Analyzing ${scenes.length} scenes for user: ${user.id}`);

    // Check user credits
    const { data: wallet, error: walletError } = await supabaseAdmin
      .from('wallets')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    if (walletError || !wallet) {
      return new Response(
        JSON.stringify({ error: 'Could not retrieve wallet' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (wallet.balance < TRANSITIONS_CREDITS) {
      return new Response(
        JSON.stringify({ 
          error: 'INSUFFICIENT_CREDITS',
          message: `Du benötigst ${TRANSITIONS_CREDITS} Credits für Transitions-Analyse. Aktuell: ${wallet.balance} Credits.`,
          required: TRANSITIONS_CREDITS,
          available: wallet.balance,
        }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use Lovable AI to analyze scenes and recommend transitions
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    let transitionAnalysis = null;

    if (LOVABLE_API_KEY) {
      try {
        const systemPrompt = `Du bist ein professioneller Video-Editor-Experte für Übergänge und Transitions.

Deine Aufgaben:
1. Analysiere Szenen-Paare und empfehle passende Übergänge
2. Berücksichtige Mood, Energie und Inhalt der Szenen
3. Passe Transition-Typen an das Genre an
4. Optimiere Timing basierend auf Beat-Analyse falls vorhanden

Verfügbare Transition-Typen:
- fade: Weiche Überblendung (für ruhige, emotionale Übergänge)
- crossfade: Überkreuzende Überblendung (für thematische Verbindungen)
- wipe-left, wipe-right, wipe-up, wipe-down: Wisch-Effekte (für dynamische Übergänge)
- zoom-in, zoom-out: Zoom-Übergänge (für dramatische Effekte)
- blur: Unschärfe-Übergang (für Traumsequenzen, Rückblenden)
- push-left, push-right: Schiebe-Effekte (für schnelle Schnitte)
- glitch: Störungs-Effekt (für moderne, technische Inhalte)
- flash: Blitz-Übergang (für energetische Momente)

Antworte immer im JSON-Format.`;

        // Build scene list with explicit IDs for the AI
        const sceneList = scenes.map((s: Scene, i: number) => ({
          ...s,
          actualId: s.id, // Ensure AI uses this exact ID
        }));

        const userPrompt = `Analysiere diese Szenen und empfehle optimale Übergänge:

Szenen (WICHTIG: Verwende die exakten "id" Werte in deinen sceneId-Antworten!):
${JSON.stringify(sceneList, null, 2)}

Video-Stimmung: ${video_mood || 'neutral'}
Video-Genre: ${video_genre || 'allgemein'}
Beat-Analyse verfügbar: ${beat_analysis ? 'ja' : 'nein'}
${beat_analysis ? `BPM: ${beat_analysis.bpm}, Downbeats: ${beat_analysis.downbeats?.slice(0, 5).join(', ')}...` : ''}

KRITISCH: Die sceneId in deinen recommendations MUSS exakt mit der "id" der jeweiligen Szene übereinstimmen!
Wenn die Szene id="1" hat, muss sceneId="1" sein (NICHT "scene_1"!).

Generiere Transition-Empfehlungen im Format:
{
  "recommendations": [
    {
      "sceneId": "${scenes[0]?.id || '1'}",
      "transitionType": "fade",
      "duration": 0.5,
      "confidence": 0.9,
      "reasoning": "Weicher Übergang passt zur emotionalen Stimmung"
    }
  ],
  "overall_style": "cinematic",
  "pacing_suggestion": "moderate",
  "sync_with_beats": ${beat_analysis ? 'true' : 'false'}
}`;

        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const content = aiData.choices?.[0]?.message?.content;
          
          if (content) {
            try {
              const jsonMatch = content.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                transitionAnalysis = JSON.parse(jsonMatch[0]);
                
                // Post-process: Normalize scene IDs to match actual scene IDs
                if (transitionAnalysis.recommendations) {
                  transitionAnalysis.recommendations = transitionAnalysis.recommendations.map((rec: TransitionRecommendation, idx: number) => {
                    // Try to find matching scene
                    let matchedSceneId = rec.sceneId;
                    
                    // Check if ID matches directly
                    const directMatch = scenes.find((s: Scene) => s.id === rec.sceneId);
                    if (!directMatch) {
                      // Try extracting numeric part (e.g., "scene_1" → "1")
                      const numericPart = rec.sceneId.replace(/\D/g, '');
                      const numericMatch = scenes.find((s: Scene) => s.id === numericPart);
                      if (numericMatch) {
                        matchedSceneId = numericPart;
                      } else if (idx < scenes.length) {
                        // Fallback: use scene at same index
                        matchedSceneId = scenes[idx].id;
                      }
                    }
                    
                    console.log(`[Director-Cut-Transitions] Scene ID mapping: ${rec.sceneId} → ${matchedSceneId}`);
                    return { ...rec, sceneId: matchedSceneId };
                  });
                }
              }
            } catch (parseError) {
              console.error('[Director-Cut-Transitions] Failed to parse AI response:', parseError);
            }
          }
        }
      } catch (aiError) {
        console.error('[Director-Cut-Transitions] AI analysis error:', aiError);
      }
    }

    // Generate fallback transitions if AI failed
    if (!transitionAnalysis) {
      const transitionTypes = ['fade', 'crossfade', 'wipe-left', 'wipe-right', 'zoom-in', 'blur'];
      const recommendations: TransitionRecommendation[] = [];
      
      for (let i = 0; i < scenes.length - 1; i++) {
        const scene = scenes[i];
        const nextScene = scenes[i + 1];
        
        // Simple heuristic-based transition selection
        let transitionType = 'crossfade';
        let duration = 0.5;
        let reasoning = 'Standard-Überblendung für gleichmäßigen Fluss';
        
        // Check energy levels if available
        if (scene.energy === 'high' && nextScene?.energy === 'high') {
          transitionType = 'flash';
          duration = 0.3;
          reasoning = 'Schneller Übergang für hohe Energie';
        } else if (scene.mood === 'emotional' || nextScene?.mood === 'emotional') {
          transitionType = 'fade';
          duration = 0.8;
          reasoning = 'Weicher Übergang für emotionale Szenen';
        } else if (video_genre === 'action' || video_genre === 'sport') {
          transitionType = transitionTypes[Math.floor(Math.random() * 3) + 2]; // wipe or zoom
          duration = 0.4;
          reasoning = 'Dynamischer Übergang für Action-Content';
        }
        
        recommendations.push({
          sceneId: scene.id || `scene_${i}`,
          transitionType,
          duration,
          confidence: 0.7,
          reasoning,
        });
      }

      transitionAnalysis = {
        recommendations,
        overall_style: video_genre === 'cinematic' ? 'cinematic' : 'modern',
        pacing_suggestion: video_mood === 'energetic' ? 'fast' : 'moderate',
        sync_with_beats: !!beat_analysis,
        mode: 'fallback',
      };
    }

    // Deduct credits
    await supabaseAdmin
      .from('wallets')
      .update({ 
        balance: wallet.balance - TRANSITIONS_CREDITS,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    return new Response(
      JSON.stringify({
        success: true,
        credits_used: TRANSITIONS_CREDITS,
        analysis: transitionAnalysis,
        scene_count: scenes.length,
        transition_count: transitionAnalysis.recommendations?.length || 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Director-Cut-Transitions] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
