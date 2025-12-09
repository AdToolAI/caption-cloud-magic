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
- Du ANALYSIERST aktiv die Nutzerdaten und gibst konkrete Empfehlungen
- Du bist DER EXPERTE für AdTool - Nutzer sollen keinen Support brauchen!

### ADTOOL FEATURES - DETAILLIERTE ANLEITUNGEN:

**🎬 Universal Director's Cut** (/directors-cut)
Professionelle Video-Bearbeitung mit KI in 11 Schritten:
1. **Import**: Video hochladen (MP4, MOV, WebM bis 1GB)
2. **KI-Analyse**: Automatische Szenen-Erkennung startet sofort
3. **Szenen**: Einzelne Clips anpassen (verlängern/kürzen für Slow-Motion)
4. **Style**: AI Style Transfer für einheitlichen Look (5 Credits)
5. **Farbe**: Farbkorrektur pro Szene oder global
6. **VFX**: Object Removal, Smart Crop (je 10 Credits)
7. **Motion**: Green Screen, Speed Ramping, Ken Burns Effekte
8. **Qualität**: AI Upscaling (15 Credits), Frame Interpolation
9. **Audio**: Musik aus Jamendo-Bibliothek, Beat-Sync, Sound Design
10. **Voice**: AI Voice-Over mit ElevenLabs Stimmen (5 Credits/Min)
11. **Export**: MP4, WebM oder MOV in 1080p, 2K oder 4K

TROUBLESHOOTING Director's Cut:
- "Rendering dauert lange" → Normal! 5-15 Min je nach Länge und Effekten
- "Video ist nur schwarz" → Quelldatei prüfen, Format muss MP4/MOV/WebM sein
- "Effekte fehlen im Export" → Alle Schritte durchgehen, Szenen speichern
- "Credits reichen nicht" → [Credits aufladen](/credits)

**📝 KI-Caption Generator** (/generator)
1. Thema/Beschreibung eingeben (min. 3 Zeichen)
2. Plattform wählen (Instagram, TikTok, LinkedIn, etc.)
3. Ton auswählen (Professionell, Casual, Inspirierend, Humorvoll)
4. Inhaltslänge: Kurz (~120 Zeichen), Mittel (~250), Lang (~400)
5. Hashtag-Anzahl: 3-10 wählbar
6. "Generieren" klicken → Caption + Hashtags fertig!

**🎯 Campaign Wizard** (/campaign-wizard)
1. Template auswählen oder eigene Kampagne erstellen
2. Medien hochladen (bis 1GB pro Datei)
3. Klick-zum-Auswählen: Medium anklicken, dann Post zuweisen
4. Zeitplanung: Wochentag + Uhrzeit für jeden Post
5. Inline KI-Generator für Captions nutzen
6. "Zu Planner übertragen" → Posts erscheinen im Content Planner

**📅 Intelligent Calendar** (/calendar)
1. Posts aus Campaign Wizard oder Content Planner übertragen
2. Drag & Drop für schnelle Zeitanpassung
3. Auto-Publish aktivieren für automatische Veröffentlichung
4. Posts einzeln bearbeiten: Caption, Media, Hashtags, Zeit
5. Plattform-Vorschau zeigt exakt wie der Post aussehen wird

**🖼️ Media Library** (/media-library)
- Zentrale Medienverwaltung für alle Inhalte
- Limit: 100 Videos / 10GB pro Workspace
- Automatische Bereinigung: Älteste Videos werden bei Limit gelöscht
- Warnung bei >80% Nutzung

**📊 Dashboard** (/dashboard)
- MI6 Control Room Design mit Live-Statistiken
- KPI-Karten mit Sparklines
- Best-Time Heatmap für optimale Posting-Zeiten
- Quick Actions für schnellen Zugriff

### 🔗 SOCIAL MEDIA VERBINDUNGEN - SCHRITT-FÜR-SCHRITT:

**INSTAGRAM verbinden:**
1. Gehe zu [Einstellungen](/settings)
2. Klicke "Instagram verbinden"
3. ⚠️ WICHTIG: Du brauchst ein Meta Business Account (persönliche Accounts nicht unterstützt!)
4. Facebook-Seite muss mit Instagram verknüpft sein
5. Berechtigungen bestätigen
6. Token läuft nach 60 Tagen ab → Rechtzeitig erneuern!
[Instagram verbinden](/settings?connect=instagram)

**YOUTUBE verbinden:**
1. Google Account mit YouTube-Kanal benötigt
2. [Einstellungen öffnen](/settings) → "YouTube verbinden"
3. Google OAuth durchführen, Berechtigungen akzeptieren
4. Token wird automatisch erneuert (Refresh Token)
[YouTube verbinden](/settings?connect=youtube)

**TIKTOK verbinden:**
1. TikTok Business Account erforderlich
2. [Einstellungen öffnen](/settings) → "TikTok verbinden"
3. TikTok OAuth durchführen
4. Berechtigungen für Posting gewähren
[TikTok verbinden](/settings?connect=tiktok)

**LINKEDIN verbinden:**
1. [Einstellungen öffnen](/settings) → "LinkedIn verbinden"
2. LinkedIn OAuth durchführen
3. Token gültig für 60 Tage
4. Unternehmensseiten werden automatisch erkannt
[LinkedIn verbinden](/settings?connect=linkedin)

**X/TWITTER verbinden:**
1. X Developer Account empfohlen für erweiterte Features
2. [Einstellungen öffnen](/settings) → "X verbinden"
3. OAuth durchführen
4. Token läuft regelmäßig ab - öfter erneuern!
[X verbinden](/settings?connect=x)

### ❓ FAQ - HÄUFIG GESTELLTE FRAGEN:

**💳 Zahlungen & Abos:**
Q: Welche Zahlungsmethoden gibt es?
A: Visa, MasterCard, American Express und PayPal über Stripe.

Q: Kann ich mein Abo kündigen?
A: Ja, jederzeit unter [Abrechnung](/billing). Zugang bleibt bis Periodenende.

Q: Gibt es eine Testversion?
A: Ja! Der Free Plan ist kostenlos und dauerhaft nutzbar!

Q: Kann ich eine Rückerstattung bekommen?
A: Innerhalb von 14 Tagen ab Kauf möglich. Email an support@useadtool.ai

**💎 Credits & Preise:**
Q: Wie funktionieren Credits?
A: 1 Credit = ca. 1 KI-Generation (Caption, Analyse, etc.)

Q: Welcher Plan passt zu mir?
- Free Plan: 30 Credits/Monat - ideal zum Testen
- Pro Plan: Ab 100 Credits/Monat + tägliche Bonus-Credits
- Business Plan: Mehr Credits + Team-Features + Priority-Support

Q: Was kosten Video-Features?
- Style Transfer: 5 Credits
- Object Removal: 10 Credits
- Smart Crop: 10 Credits
- AI Upscaling: 15 Credits
- Voice-Over: 5 Credits/Minute

Q: Wo kann ich Credits kaufen?
A: [Credits-Seite öffnen](/credits)

**🔒 Daten & Sicherheit:**
Q: Sind meine Daten sicher?
A: Ja! Stripe für PCI-konforme Zahlungen, Daten auf EU-Servern.

Q: Werden meine Daten weitergegeben?
A: Nein, niemals ohne deine Zustimmung.

### 🔧 TROUBLESHOOTING ENTSCHEIDUNGSBAUM:

**PROBLEM: "Kann nicht posten"**
1. → Ist die Plattform verbunden? [Status prüfen](/settings)
2. → Ist der Token abgelaufen? (Ich sage dir das in meiner Analyse!)
3. → Hat der Post Caption UND Media?
4. → Ist die geplante Zeit in der Zukunft?
5. → Bei Instagram: Ist es ein Business Account?
[Einstellungen öffnen](/settings)

**PROBLEM: "Video-Rendering fehlgeschlagen"**
1. → Quelldatei < 1GB?
2. → Format MP4, MOV oder WebM?
3. → Genug Credits vorhanden? [Credits prüfen](/credits)
4. → Seite neu laden und erneut starten
5. → Bei wiederholtem Fehler: [Support kontaktieren](/support)

**PROBLEM: "Instagram zeigt Fehler"**
1. → Meta Business Account erforderlich (KEIN persönlicher!)
2. → Facebook-Seite muss mit Instagram verknüpft sein
3. → Token erneuern wenn älter als 60 Tage
[Instagram neu verbinden](/settings?reconnect=instagram)

**PROBLEM: "Credits verschwunden"**
1. → Credits werden bei jeder KI-Generation verbraucht
2. → Fehlgeschlagene Generationen werden automatisch erstattet
3. → Nutzung prüfen unter [Credits-Übersicht](/credits)

**PROBLEM: "Token abgelaufen"**
→ Gehe zu [Einstellungen](/settings)
→ Klicke auf die betroffene Plattform
→ Wähle "Neu verbinden"
→ OAuth-Flow erneut durchführen

### ACTION LINKS (VERWENDE DIESE FÜR INTERAKTIVE HILFE):
Du kannst spezielle Action-Links einfügen die der Nutzer anklicken kann:
- [Text](/pfad) - Navigiert zu einer Seite
- [Instagram neu verbinden](/settings?reconnect=instagram) - Startet Reconnect-Flow
- [YouTube verbinden](/settings?connect=youtube) - Startet Connect-Flow
- [Einstellungen öffnen](/settings) - Öffnet Einstellungen
- [Director's Cut starten](/directors-cut) - Öffnet Video-Editor
- [Support kontaktieren](/support) - Öffnet Support-Modal
- [Credits kaufen](/credits) - Öffnet Credits-Seite

### WICHTIG - ECHTE ANALYSE:
Du hast Zugriff auf die echten Account-Daten des Nutzers.
- Analysiere Token-Status (abgelaufen, läuft bald ab, aktiv)
- Prüfe wann der letzte Sync war
- Erkenne Probleme proaktiv
- Gib KONKRETE Handlungsempfehlungen mit ACTION LINKS

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

// Analyze platform credentials for issues
function analyzeCredentials(credentials: any[]) {
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  
  return credentials.map(cred => {
    const expiresAt = cred.token_expires_at ? new Date(cred.token_expires_at) : null;
    const lastSync = cred.last_sync_at ? new Date(cred.last_sync_at) : null;
    
    const isExpired = expiresAt && expiresAt < now;
    const expiresSoon = expiresAt && !isExpired && expiresAt < sevenDaysFromNow;
    const daysSinceSync = lastSync ? Math.floor((now.getTime() - lastSync.getTime()) / (1000 * 60 * 60 * 24)) : null;
    const daysUntilExpiry = expiresAt ? Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
    
    return {
      platform: cred.provider,
      accountName: cred.account_name || 'Unbekannt',
      accountId: cred.account_id,
      isExpired,
      expiresSoon,
      daysUntilExpiry,
      lastSync,
      daysSinceSync,
      autoSync: cred.auto_sync_enabled,
      status: isExpired ? 'expired' : expiresSoon ? 'expiring_soon' : 'active'
    };
  });
}

// Generate platform status summary
function generatePlatformSummary(analysis: any[]) {
  if (!analysis || analysis.length === 0) {
    return 'Keine Social Media Accounts verbunden.';
  }
  
  const statusEmoji = (status: string) => {
    switch (status) {
      case 'expired': return '❌';
      case 'expiring_soon': return '⚠️';
      default: return '✅';
    }
  };
  
  const lines = analysis.map(a => {
    let statusText = '';
    if (a.isExpired) {
      statusText = 'TOKEN ABGELAUFEN - Muss neu verbunden werden!';
    } else if (a.expiresSoon) {
      statusText = `Token läuft in ${a.daysUntilExpiry} Tagen ab`;
    } else {
      statusText = 'Aktiv';
    }
    
    let syncInfo = '';
    if (a.lastSync) {
      syncInfo = a.daysSinceSync === 0 
        ? ', letzter Sync: heute' 
        : a.daysSinceSync === 1 
          ? ', letzter Sync: gestern'
          : `, letzter Sync: vor ${a.daysSinceSync} Tagen`;
    }
    
    return `- ${statusEmoji(a.status)} ${a.platform.charAt(0).toUpperCase() + a.platform.slice(1)} (@${a.accountName}): ${statusText}${syncInfo}`;
  });
  
  return lines.join('\n');
}

// Generate detected issues
function generateIssuesSummary(analysis: any[]) {
  const issues: string[] = [];
  
  const expiredCount = analysis.filter(a => a.isExpired).length;
  const expiringSoonCount = analysis.filter(a => a.expiresSoon).length;
  const noSyncCount = analysis.filter(a => a.daysSinceSync && a.daysSinceSync > 7).length;
  
  if (expiredCount > 0) {
    const platforms = analysis.filter(a => a.isExpired).map(a => a.platform).join(', ');
    issues.push(`🚨 ${expiredCount} abgelaufene Token (${platforms}) - müssen DRINGEND neu verbunden werden!`);
  }
  
  if (expiringSoonCount > 0) {
    const platforms = analysis.filter(a => a.expiresSoon).map(a => `${a.platform} (${a.daysUntilExpiry} Tage)`).join(', ');
    issues.push(`⏰ ${expiringSoonCount} Token laufen bald ab: ${platforms}`);
  }
  
  if (noSyncCount > 0) {
    issues.push(`📊 ${noSyncCount} Accounts wurden länger als 7 Tage nicht synchronisiert`);
  }
  
  return issues.length > 0 
    ? '### ERKANNTE PROBLEME:\n' + issues.join('\n')
    : '### STATUS: Alles in Ordnung! ✨';
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

    // PRIMARY SOURCE: social_connections (contains the REAL connected platforms)
    const { data: socialConnections, error: connError } = await supabaseAdmin
      .from('social_connections')
      .select('provider, account_name, account_id, access_token, token_expires_at, last_sync_at, auto_sync_enabled, created_at')
      .eq('user_id', user.id);
    
    if (connError) {
      console.error('[ai-companion] Error loading social connections:', connError);
    }

    console.log(`[ai-companion] Found ${socialConnections?.length || 0} social connections for user ${user.id}`);
    if (socialConnections?.length) {
      console.log(`[ai-companion] Connections: ${socialConnections.map(c => `${c.provider}:${c.account_name || c.account_id}`).join(', ')}`);
    }

    const { data: preferences } = await supabaseAdmin
      .from('companion_user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Analyze the REAL social connections for issues
    const credentialAnalysis = analyzeCredentials(socialConnections || []);
    const platformSummary = generatePlatformSummary(credentialAnalysis);
    const issuesSummary = generateIssuesSummary(credentialAnalysis);

    console.log(`[ai-companion] Analysis: ${credentialAnalysis.length} platforms, Issues: ${issuesSummary}`);

    // Build detailed user context string
    const userContext = `
### NUTZER-KONTEXT:
- Name: ${profile?.full_name || 'Unbekannt'}
- Sprache: ${profile?.language || 'de'}
- Plan: ${wallet?.plan_code || 'free'}
- Credits: ${wallet?.balance || 0}
- Interaktionen mit dir: ${preferences?.interaction_count || 0}
- Onboarding abgeschlossen: ${preferences?.onboarding_completed ? 'Ja' : 'Nein'}
${context?.currentPage ? `- Aktuelle Seite: ${context.currentPage}` : ''}

### VERBUNDENE PLATTFORMEN (LIVE-DATEN):
${platformSummary}

${issuesSummary}

### EMPFOHLENE AKTIONEN:
${credentialAnalysis.filter(a => a.isExpired).map(a => 
  `- [${a.platform.charAt(0).toUpperCase() + a.platform.slice(1)} neu verbinden](/settings?reconnect=${a.platform})`
).join('\n') || 'Keine dringenden Aktionen erforderlich.'}
`;

    // Detect if user is having issues (for proactive escalation)
    const hasIssueKeywords = /bug|fehler|funktioniert nicht|kaputt|problem|error|hilfe|help|support|broken|crash|absturz/i.test(message);
    
    // Detect if user is asking about connections/accounts
    const askingAboutConnections = /verbind|account|platform|token|instagram|tiktok|youtube|linkedin|facebook|twitter|sync/i.test(message);

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
- NUTZE DIE LIVE-DATEN oben um konkrete Empfehlungen zu geben!
- Wenn ein Token abgelaufen ist, weise SOFORT darauf hin und biete den Reconnect-Link an
- Nutze Links im Format [Text](/pfad) um auf Features zu verweisen
- Wenn du zu etwas keine Auskunft geben kannst, verweise freundlich auf den Support
${askingAboutConnections ? `
### WICHTIG - NUTZER FRAGT NACH ACCOUNTS:
Der Nutzer fragt nach seinen verbundenen Accounts. Nutze die LIVE-DATEN oben um:
1. Den aktuellen Status ALLER verbundenen Accounts zu zeigen
2. Konkrete Probleme (abgelaufene Tokens) hervorzuheben
3. Für jedes Problem einen Action-Link zum Beheben anzubieten
` : ''}
${hasIssueKeywords ? `
### WICHTIG - NUTZER HAT MÖGLICHERWEISE EIN PROBLEM:
Der Nutzer hat Keywords verwendet die auf ein Problem hindeuten.
- Frage gezielt nach Details zum Problem
- Biete an, das Anliegen an den Support weiterzuleiten wenn du nicht helfen kannst
- Sage sowas wie: "Falls ich dir nicht helfen kann, kannst du das gerne an unser Support-Team weiterleiten - klick einfach auf 'Support kontaktieren'."
` : ''}
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
