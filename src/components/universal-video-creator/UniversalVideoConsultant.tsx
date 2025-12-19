import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Sparkles, Loader2, Crown, Video, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { ConsultantAvatar } from './ConsultantAvatar';
import { ConsultantQuickReplies } from './ConsultantQuickReplies';
import { VIDEO_CATEGORIES, type VideoCategory, type UniversalConsultationResult } from '@/types/universal-video-creator';
import { ALL_CATEGORY_INTERVIEWS } from '@/config/universal-video-interviews';
import type { UniversalGenerationMode } from './UniversalModeSelector';
import ReactMarkdown from 'react-markdown';

interface Message {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  quickReplies?: string[];
}

interface UniversalVideoConsultantProps {
  category: VideoCategory;
  mode: UniversalGenerationMode;
  onConsultationComplete: (result: UniversalConsultationResult) => void;
  onSkip: () => void;
}

export function UniversalVideoConsultant({ 
  category, 
  mode, 
  onConsultationComplete, 
  onSkip 
}: UniversalVideoConsultantProps) {
  const categoryInfo = VIDEO_CATEGORIES.find(c => c.category === category);
  const interview = ALL_CATEGORY_INTERVIEWS[category];
  const totalPhases = interview?.phases?.length || 10;
  const firstPhase = interview?.phases?.[0];

  const initialMessage: Message = {
    id: '1',
    role: 'assistant',
    content: mode === 'full-service' 
      ? `Willkommen! Ich bin **Max**, dein Video-Marketing-Stratege.

Du hast dich für ein **${categoryInfo?.name}** im **Full-Service-Modus** entschieden – ausgezeichnete Wahl.

In **${totalPhases} präzisen Fragen** entwickeln wir gemeinsam dein perfektes Video-Konzept. Danach übernimmt die KI und erstellt alles automatisch.

**Phase 1/${totalPhases}:** ${firstPhase?.question || 'Was ist das Hauptziel deines Videos?'}`
      : `Willkommen! Ich bin **Max**, dein Video-Marketing-Stratege.

Der **manuelle Modus** für dein **${categoryInfo?.name}** gibt dir volle kreative Kontrolle.

Lass uns mit ein paar strategischen Fragen starten.

**${firstPhase?.question || 'Was ist das Hauptziel deines Videos?'}**`,
    quickReplies: firstPhase?.quickReplies || ['Mehr Verkäufe', 'Brand Awareness', 'Kundenschulung', 'Produkt erklären']
  };

  const [messages, setMessages] = useState<Message[]>([initialMessage]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [consultationProgress, setConsultationProgress] = useState(0);
  const [showModeChoice, setShowModeChoice] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageIdsRef = useRef<Set<string>>(new Set(['1'])); // Track message IDs to prevent duplicates

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Deduplicate and add message safely
  const addMessageSafely = useCallback((message: Message) => {
    if (messageIdsRef.current.has(message.id)) {
      console.log('[Consultant] Duplicate message prevented:', message.id);
      return false;
    }
    messageIdsRef.current.add(message.id);
    setMessages(prev => [...prev, message]);
    return true;
  }, []);

  const sendMessage = async (content: string, retryCount = 0) => {
    if (!content.trim() || isLoading) return;

    const userMessageId = `user-${Date.now()}`;
    const userMessage: Message = {
      id: userMessageId,
      role: 'user',
      content: content.trim()
    };

    // Check for duplicate before adding (only on first attempt)
    if (retryCount === 0 && !addMessageSafely(userMessage)) return;
    
    setInput('');
    setIsLoading(true);

    // Create AbortController with 90s timeout for long AI responses
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.log('[Consultant] Request timeout after 90s');
      controller.abort();
    }, 90000);

    try {
      const response = await supabase.functions.invoke('universal-video-consultant', {
        body: {
          messages: [...messages, ...(retryCount === 0 ? [userMessage] : [])].map(m => ({
            role: m.role,
            content: m.content
          })),
          category,
          mode
        }
      });

      clearTimeout(timeoutId);

      if (response.error) throw response.error;

      const data = response.data;
      
      // Update progress
      setConsultationProgress(data.progress || 0);

      // Add assistant response with unique ID
      const assistantMessageId = `assistant-${Date.now()}`;
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: data.message,
        quickReplies: data.quickReplies
      };

      addMessageSafely(assistantMessage);

      // Check if consultation is complete
      if (data.isComplete && data.recommendation && data.progress >= 100) {
        if (mode === 'full-service') {
          setTimeout(() => {
            const confirmMessageId = `confirm-${Date.now()}`;
            const confirmMessage: Message = {
              id: confirmMessageId,
              role: 'assistant',
              content: `**Exzellent! Dein ${categoryInfo?.name}-Briefing ist komplett.**

${data.recommendation.productSummary ? `📦 **Thema:** ${data.recommendation.productSummary}` : ''}
${data.recommendation.targetAudience?.length ? `👥 **Zielgruppe:** ${data.recommendation.targetAudience.join(', ')}` : ''}
${data.recommendation.recommendedStyle ? `🎨 **Stil:** ${data.recommendation.recommendedStyle}` : ''}
${data.recommendation.recommendedTone ? `🎭 **Tonalität:** ${data.recommendation.recommendedTone}` : ''}
${data.recommendation.recommendedDuration ? `⏱️ **Länge:** ${data.recommendation.recommendedDuration}s` : ''}

Soll ich jetzt dein Video erstellen? Das dauert etwa 5-15 Minuten.`,
              quickReplies: ['Video erstellen', 'Lieber manuell']
            };
            addMessageSafely(confirmMessage);
            setShowModeChoice(true);
          }, 1000);
        } else {
          setTimeout(() => {
            onConsultationComplete({
              ...data.recommendation,
              category,
              modeChoice: 'manual'
            });
          }, 1500);
        }
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error('Consultant error:', error);
      
      // Retry logic with exponential backoff (max 2 retries)
      if ((error?.name === 'AbortError' || error?.message?.includes('timeout')) && retryCount < 2) {
        console.log(`[Consultant] Retrying... attempt ${retryCount + 1}/2`);
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s
        await new Promise(resolve => setTimeout(resolve, delay));
        return sendMessage(content, retryCount + 1);
      }
      
      const errorMessageId = `error-${Date.now()}`;
      const errorMessage: Message = {
        id: errorMessageId,
        role: 'assistant',
        content: retryCount > 0 
          ? 'Die Verbindung ist leider abgebrochen. Bitte versuche es erneut.'
          : 'Es gab einen technischen Fehler. Bitte versuche es erneut.',
        quickReplies: ['Erneut versuchen', 'Beratung überspringen']
      };
      addMessageSafely(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickReply = async (reply: string) => {
    if (reply === 'Beratung überspringen') {
      onSkip();
      return;
    }
    
    if (showModeChoice) {
      if (reply.includes('Video erstellen')) {
        const userMessages = messages.filter(m => m.role === 'user');
        const productMessage = userMessages.find((m, idx) => idx >= 1 && m.content.length > 20);
        const productSummary = productMessage?.content || userMessages.slice(1, 3).map(m => m.content).join(' ') || `${categoryInfo?.name}-Video`;
        
        const result: UniversalConsultationResult = {
          category,
          projectName: productSummary,
          completedAt: new Date().toISOString(),
          companyName: '',
          productName: productSummary,
          productDescription: productSummary,
          targetAudience: 'Allgemein',
          coreProblem: '',
          solution: '',
          uniqueSellingPoints: [],
          storytellingStructure: 'problem-solution',
          emotionalTone: 'professional',
          keyMessage: '',
          desiredAction: '',
          ctaText: '',
          visualStyle: 'flat-design',
          brandColors: [],
          hasCharacter: true,
          voiceGender: 'male',
          voiceLanguage: 'de',
          voiceTone: 'professionell',
          musicStyle: 'corporate',
          musicMood: 'inspirational',
          videoDuration: 60,
          aspectRatio: '16:9',
          outputFormats: ['16:9'],
          categorySpecific: {},
          briefingSummary: productSummary,
        };
        
        onConsultationComplete(result);
        return;
      } else if (reply.includes('manuell')) {
        onSkip();
        return;
      }
    }
    
    sendMessage(reply);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const currentPhase = Math.ceil((consultationProgress / 100) * totalPhases) || 1;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header - James Bond 2028 */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative mb-8 p-6 rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(5,8,22,0.95) 0%, rgba(15,23,42,0.9) 100%)',
          border: '1px solid rgba(245,199,106,0.2)',
          boxShadow: '0 0 60px rgba(245,199,106,0.1), inset 0 1px 0 rgba(255,255,255,0.05)'
        }}
      >
        {/* Background effects */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(245,199,106,0.08),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(34,211,238,0.05),transparent_50%)]" />
        
        <div className="relative flex items-center gap-5">
          {/* Avatar */}
          <div className="relative">
            <div className="absolute -inset-2 rounded-full bg-gradient-to-br from-gold/30 to-cyan-500/20 blur-md" />
            <div className="relative">
              <ConsultantAvatar isTyping={isLoading} name="Max" />
            </div>
            <motion.div 
              className="absolute -inset-1 rounded-full border border-gold/40"
              animate={{ opacity: [0.4, 0.8, 0.4] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </div>
          
          {/* Info */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h3 className="font-heading text-2xl font-bold bg-gradient-to-r from-gold via-amber-300 to-gold bg-clip-text text-transparent">
                Max
              </h3>
              <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-gold/10 border border-gold/30 text-gold flex items-center gap-1.5">
                <Zap className="h-3 w-3" />
                Video-Stratege
              </span>
              <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                {categoryInfo?.name}
              </span>
            </div>
            <p className="text-sm text-muted-foreground/80">
              {mode === 'full-service' 
                ? `Phase ${currentPhase} von ${totalPhases} • ${Math.round(consultationProgress)}% abgeschlossen`
                : 'Strategische Beratung für dein perfektes Video'
              }
            </p>
          </div>
          
          {mode === 'manual' && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onSkip} 
              className="text-muted-foreground hover:text-gold hover:bg-gold/10 transition-all"
            >
              Überspringen
            </Button>
          )}
        </div>
      </motion.div>

      {/* Progress Bar - Premium Neon */}
      <div className="mb-8 relative">
        <div className="flex justify-between text-xs mb-3">
          <span className="flex items-center gap-2 text-muted-foreground">
            <Crown className="h-3.5 w-3.5 text-gold" />
            <span className="font-medium">{categoryInfo?.name}-Beratung</span>
          </span>
          <span className="text-gold font-bold">{Math.round(consultationProgress)}%</span>
        </div>
        
        <div className="h-2.5 bg-background/50 rounded-full overflow-hidden border border-white/5 backdrop-blur-sm">
          <motion.div
            className="h-full relative"
            style={{
              background: 'linear-gradient(90deg, hsl(var(--gold)) 0%, #fcd34d 50%, hsl(var(--gold)) 100%)',
              boxShadow: '0 0 20px rgba(245,199,106,0.5), 0 0 40px rgba(245,199,106,0.3)'
            }}
            initial={{ width: 0 }}
            animate={{ width: `${consultationProgress}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shimmer" />
          </motion.div>
        </div>
        
        {/* Phase dots */}
        {mode === 'full-service' && (
          <div className="flex justify-between mt-3 px-1">
            {Array.from({ length: Math.min(totalPhases, 10) }, (_, i) => (
              <motion.div 
                key={i}
                initial={{ scale: 0.6, opacity: 0.3 }}
                animate={{ 
                  scale: currentPhase > i ? 1 : 0.6,
                  opacity: currentPhase > i ? 1 : 0.3
                }}
                className={cn(
                  "w-2 h-2 rounded-full transition-all duration-500",
                  currentPhase > i 
                    ? "bg-gold shadow-[0_0_8px_rgba(245,199,106,0.6)]" 
                    : "bg-muted/30 border border-white/10"
                )}
              />
            ))}
          </div>
        )}
      </div>

      {/* Chat Container - Glassmorphism */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="relative rounded-2xl overflow-hidden mb-6"
        style={{
          background: 'linear-gradient(135deg, rgba(15,23,42,0.8) 0%, rgba(5,8,22,0.9) 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(20px)'
        }}
      >
        {/* Grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(245,199,106,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(245,199,106,0.02)_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
        
        <div className="p-5 min-h-[420px] max-h-[500px] overflow-y-auto relative">
          <AnimatePresence>
            {messages.map((message, index) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: index * 0.03, duration: 0.3 }}
                className={cn(
                  "mb-5 flex",
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {message.role === 'assistant' && (
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gold/20 to-cyan-500/10 flex items-center justify-center mr-3 flex-shrink-0 border border-gold/30 shadow-lg shadow-gold/10">
                    <Sparkles className="h-4 w-4 text-gold" />
                  </div>
                )}
                
                <div className={cn(
                  "max-w-[80%] rounded-2xl px-5 py-4 relative overflow-hidden",
                  message.role === 'user'
                    ? "bg-gradient-to-br from-gold/20 via-gold/10 to-amber-500/5 border border-gold/30 shadow-lg shadow-gold/10"
                    : "bg-white/5 border border-white/10"
                )}>
                  {message.role === 'assistant' && (
                    <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-cyan-500/5 pointer-events-none" />
                  )}
                  
                  <div className="prose prose-sm prose-invert max-w-none relative font-modern text-[15px] leading-relaxed tracking-wide [&_strong]:text-gold [&_strong]:font-heading [&_strong]:font-semibold [&_p]:mb-3 [&_p:last-child]:mb-0">
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p className="mb-3 last:mb-0 text-foreground/95">{children}</p>,
                        strong: ({ children }) => <strong className="text-gold font-heading font-semibold tracking-tight">{children}</strong>,
                        em: ({ children }) => <em className="text-cyan-400 font-medium not-italic">{children}</em>,
                        ul: ({ children }) => <ul className="list-disc list-inside space-y-2 my-3 marker:text-gold/60">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal list-inside space-y-2 my-3 marker:text-gold/60">{children}</ol>,
                        li: ({ children }) => <li className="text-foreground/90 leading-relaxed">{children}</li>,
                        h1: ({ children }) => <h1 className="font-display text-xl text-gold mb-3">{children}</h1>,
                        h2: ({ children }) => <h2 className="font-heading text-lg text-gold/90 mb-2">{children}</h2>,
                        h3: ({ children }) => <h3 className="font-heading text-base text-gold/80 mb-2">{children}</h3>,
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                  
                  {message.role === 'assistant' && message.quickReplies && message.quickReplies.length > 0 && (
                    <div className="mt-5 pt-4 border-t border-white/10">
                      <ConsultantQuickReplies
                        options={message.quickReplies}
                        onSelect={handleQuickReply}
                        disabled={isLoading}
                      />
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          
          {/* Typing indicator */}
          {isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gold/20 to-cyan-500/10 flex items-center justify-center border border-gold/30">
                <Sparkles className="h-4 w-4 text-gold animate-pulse" />
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 bg-gold/70 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-gold/70 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-gold/70 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </motion.div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </motion.div>

      {/* Input - Premium Style */}
      <motion.form 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        onSubmit={handleSubmit} 
        className="flex gap-3"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Schreibe deine Antwort..."
          disabled={isLoading}
          className={cn(
            "flex-1 bg-background/50 border border-white/10 rounded-xl px-5 py-4 text-[15px]",
            "focus:border-gold/50 focus:outline-none focus:ring-2 focus:ring-gold/20",
            "placeholder:text-muted-foreground/50 transition-all duration-300",
            "backdrop-blur-sm font-sans"
          )}
        />
        <Button
          type="submit"
          disabled={!input.trim() || isLoading}
          className={cn(
            "px-6 bg-gradient-to-r from-gold via-amber-400 to-gold text-black font-semibold",
            "hover:shadow-[0_0_30px_rgba(245,199,106,0.4)] transition-all duration-300",
            "disabled:opacity-40 disabled:cursor-not-allowed border-0"
          )}
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </Button>
      </motion.form>
    </div>
  );
}
