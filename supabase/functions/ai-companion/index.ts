import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AdTool Knowledge Base - comprehensive platform knowledge
const ADTOOL_KNOWLEDGE = `
## AdTool AI - Dein persönlicher Social Media Assistent

Du bist der AdTool AI Companion - ein freundlicher, hilfreicher KI-Assistent der Nutzern hilft, das Beste aus AdTool herauszuholen.

### DEINE PERSÖNLICHKEIT:
- Freundlich und enthusiastisch, aber professionell
- Geduldig bei Erklärungen
- Proaktiv mit hilfreichen Tipps
- Sprich Deutsch, es sei denn der Nutzer wechselt zu Englisch

### ADTOOL FEATURES DIE DU KENNST:

**🎬 Universal Director's Cut** (/directors-cut)
- Professionelle Video-Bearbeitung mit KI
- 11-Schritte-Workflow: Import → KI-Analyse → Szenen → Style → Farbe → VFX → Motion → Qualität → Audio → Voice → Export
- KI Auto-Cut erkennt automatisch Szenen
- AI Style Transfer, Color Grading, Ken Burns Effekte
- AI Voice-Over mit ElevenLabs
- AI Video Upscaling und Frame Interpolation

**📝 KI-Caption Generator** (/generator)
- Generiert Social Media Captions mit KI
- Verschiedene Töne: Professionell, Casual, Inspirierend, etc.
- Plattform-optimiert für Instagram, TikTok, LinkedIn, Facebook, YouTube

**🎯 Campaign Wizard** (/campaign-wizard)
- Erstelle komplette Kampagnen mit mehreren Posts
- Weise Medien zu einzelnen Posts zu
- Plane Posts für verschiedene Plattformen
- Inline KI-Post-Generator

**📅 Intelligent Calendar** (/calendar)
- Zentrale Content-Planung
- Auto-Publish Funktion
- Platform-spezifische Post-Vorschau
- Drag & Drop Bearbeitung

**🖼️ Media Library** (/media-library)
- Zentrale Medienverwaltung
- Max 100 Videos / 10GB pro Workspace
- Automatische Bereinigung ältester Videos bei Limit

**📊 Analytics Dashboard** (/dashboard)
- Performance-Tracking
- Engagement-Metriken
- Best-Time Analyse

**🔗 Social Media Integrationen** (/settings)
- Instagram (über Meta Business API)
- TikTok
- LinkedIn
- Facebook
- YouTube

### RICH RESPONSES:
Du kannst Links zu Features einfügen mit der Syntax [Text](/pfad):
- [Director's Cut öffnen](/directors-cut)
- [Zum Kalender](/calendar)
- [Caption Generator](/generator)
- [Media Library](/media-library)
- [Dashboard](/dashboard)
- [Einstellungen](/settings)

### ONBOARDING HILFE:
Wenn ein Nutzer neu ist, führe ihn durch:
1. Profil vervollständigen
2. Ersten Social Account verbinden - [Zu den Einstellungen](/settings)
3. Erstes Content-Piece erstellen - [Director's Cut starten](/directors-cut)
4. Brand Kit einrichten

### TROUBLESHOOTING:
- Bei Verbindungsproblemen: Token prüfen, neu verbinden in [Einstellungen](/settings)
- Bei Render-Fehlern: Dateigröße prüfen, Format checken
- Bei Credit-Problemen: Wallet-Stand prüfen in [Einstellungen](/settings), ggf. aufladen

### EINSCHRÄNKUNGEN - DIESE THEMEN NICHT BESPRECHEN:
- Interne Architektur oder technische Details des Systems
- Preisstrategien oder geschäftliche Entscheidungen
- Daten anderer Nutzer
- API-Schlüssel oder Sicherheitsdetails
- Konkurrenzvergleiche mit Wertungen
- Zukünftige Features die nicht angekündigt sind

Bei solchen Fragen antworte höflich, dass du dazu keine Auskunft geben kannst und verweise auf den Support.
`;

// Restricted topics that should not be discussed
const RESTRICTED_TOPICS = [
  'internal_architecture',
  'pricing_strategy', 
  'user_data_other_users',
  'api_keys',
  'security_details',
  'competitor_criticism',
  'unreleased_features',
  'database_schema',
  'revenue_numbers',
  'employee_information'
];

// Check if message contains restricted content requests
function containsRestrictedRequest(message: string): boolean {
  const restrictedPatterns = [
    /api[- ]?key/i,
    /passwort|password/i,
    /andere nutzer|other users/i,
    /interne[rns]? (architektur|system|datenbank)/i,
    /preis(strategie|kalkulation)/i,
    /umsatz|revenue|einnahmen/i,
    /mitarbeiter|employee/i,
    /konkurrenz.*schlecht|competitor.*bad/i,
  ];
  
  return restrictedPatterns.some(pattern => pattern.test(message));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user
    const supabaseClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { message, conversationId, context, stream } = await req.json();
    
    if (!message) {
      return new Response(JSON.stringify({ error: 'Message required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`AI Companion request from user ${user.id}: ${message.substring(0, 100)}...`);

    // Check for restricted content requests
    if (containsRestrictedRequest(message)) {
      console.log('Restricted content request detected');
    }

    // Get or create conversation
    let activeConversationId = conversationId;
    
    if (!activeConversationId) {
      // Create new conversation
      const { data: newConv, error: convError } = await supabaseAdmin
        .from('companion_conversations')
        .insert({
          user_id: user.id,
          title: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
          context_type: context?.type || 'general'
        })
        .select('id')
        .single();
      
      if (convError) {
        console.error('Error creating conversation:', convError);
        throw new Error('Failed to create conversation');
      }
      activeConversationId = newConv.id;
    }

    // Get conversation history (last 20 messages for context)
    const { data: historyMessages } = await supabaseAdmin
      .from('companion_messages')
      .select('role, content')
      .eq('conversation_id', activeConversationId)
      .order('created_at', { ascending: true })
      .limit(20);

    // Save user message
    await supabaseAdmin
      .from('companion_messages')
      .insert({
        conversation_id: activeConversationId,
        role: 'user',
        content: message,
        metadata: { context }
      });

    // Build conversation context
    const conversationHistory = (historyMessages || []).map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }));

    // Get user context (plan, connected accounts, etc.)
    const { data: wallet } = await supabaseAdmin
      .from('wallets')
      .select('balance, plan_code')
      .eq('user_id', user.id)
      .single();

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name, language')
      .eq('id', user.id)
      .single();

    const { data: socialAccounts } = await supabaseAdmin
      .from('social_accounts')
      .select('platform, username')
      .eq('user_id', user.id);

    const { data: preferences } = await supabaseAdmin
      .from('companion_user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Build user context string
    const userContext = `
### NUTZER-KONTEXT:
- Name: ${profile?.full_name || 'Unbekannt'}
- Sprache: ${profile?.language || 'de'}
- Plan: ${wallet?.plan_code || 'free'}
- Credits: ${wallet?.balance || 0}
- Verbundene Accounts: ${socialAccounts?.length ? socialAccounts.map(a => `${a.platform} (@${a.username})`).join(', ') : 'Keine'}
- Interaktionen mit dir: ${preferences?.interaction_count || 0}
- Onboarding abgeschlossen: ${preferences?.onboarding_completed ? 'Ja' : 'Nein'}
${context?.currentPage ? `- Aktuelle Seite: ${context.currentPage}` : ''}
`;

    // Build messages for AI
    const messages = [
      { 
        role: 'system', 
        content: ADTOOL_KNOWLEDGE + userContext + `

### ANWEISUNGEN:
- Antworte kurz und prägnant (max 3-4 Sätze), außer bei komplexen Tutorials
- Verwende Emojis sparsam aber gezielt
- Bei Fragen zu Features, gib praktische Tipps
- Bei neuen Nutzern (wenige Interaktionen), sei besonders einladend
- Schlage proaktiv relevante Features vor basierend auf dem Kontext
- Nutze Links im Format [Text](/pfad) um auf Features zu verweisen
- Wenn du zu etwas keine Auskunft geben kannst, verweise freundlich auf den Support
`
      },
      ...conversationHistory,
      { role: 'user', content: message }
    ];

    // Call Lovable AI Gateway
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
        stream: stream === true,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit erreicht. Bitte versuche es in einer Minute erneut.' 
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error('AI service error');
    }

    // Handle streaming response
    if (stream === true) {
      // Transform the stream to include conversationId in first chunk
      const originalBody = response.body;
      let sentConversationId = false;
      
      const transformStream = new TransformStream({
        transform(chunk, controller) {
          // Pass through the chunk
          controller.enqueue(chunk);
        },
        flush(controller) {
          // Send conversation ID at end
          const convIdChunk = new TextEncoder().encode(`data: ${JSON.stringify({ conversationId: activeConversationId })}\n\n`);
          controller.enqueue(convIdChunk);
        }
      });

      // We need to read the stream to save the message
      const [streamForResponse, streamForSaving] = response.body!.tee();
      
      // Save message asynchronously
      (async () => {
        const reader = streamForSaving.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') continue;
                
                try {
                  const parsed = JSON.parse(data);
                  const delta = parsed.choices?.[0]?.delta?.content;
                  if (delta) {
                    fullContent += delta;
                  }
                } catch (e) {
                  // Ignore parse errors
                }
              }
            }
          }
          
          // Save assistant response
          if (fullContent) {
            await supabaseAdmin
              .from('companion_messages')
              .insert({
                conversation_id: activeConversationId,
                role: 'assistant',
                content: fullContent,
                metadata: {}
              });

            // Update user preferences
            await supabaseAdmin
              .from('companion_user_preferences')
              .upsert({
                user_id: user.id,
                interaction_count: (preferences?.interaction_count || 0) + 1,
                last_interaction_at: new Date().toISOString(),
              }, {
                onConflict: 'user_id'
              });
          }
        } catch (error) {
          console.error('Error saving streamed message:', error);
        }
      })();

      return new Response(streamForResponse, {
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        },
      });
    }

    // Non-streaming response
    const aiResponse = await response.json();
    const assistantMessage = aiResponse.choices?.[0]?.message?.content || 'Entschuldigung, ich konnte keine Antwort generieren.';

    // Save assistant response
    await supabaseAdmin
      .from('companion_messages')
      .insert({
        conversation_id: activeConversationId,
        role: 'assistant',
        content: assistantMessage,
        metadata: {}
      });

    // Update user preferences
    await supabaseAdmin
      .from('companion_user_preferences')
      .upsert({
        user_id: user.id,
        interaction_count: (preferences?.interaction_count || 0) + 1,
        last_interaction_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id'
      });

    // Update conversation title if it's the first message
    if (!conversationId) {
      await supabaseAdmin
        .from('companion_conversations')
        .update({ 
          title: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
          updated_at: new Date().toISOString()
        })
        .eq('id', activeConversationId);
    }

    console.log(`AI Companion response generated for user ${user.id}`);

    return new Response(JSON.stringify({
      message: assistantMessage,
      conversationId: activeConversationId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('AI Companion error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
