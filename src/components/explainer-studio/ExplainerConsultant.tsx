import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Sparkles, Loader2, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { ConsultantAvatar } from './ConsultantAvatar';
import { ConsultantQuickReplies } from './ConsultantQuickReplies';
import { StylePreviewGrid } from './StylePreviewGrid';
import type { ConsultationResult, GenerationMode, ExplainerStyle } from '@/types/explainer-studio';

interface Message {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  quickReplies?: string[];
  showStylePreview?: boolean;
}

interface ExplainerConsultantProps {
  onConsultationComplete: (result: ConsultationResult) => void;
  onSkip: () => void;
  mode: GenerationMode;
}

const INITIAL_MESSAGE_FULL_SERVICE: Message = {
  id: '1',
  role: 'assistant',
  content: `Hallo! 👋 Ich bin Lisa, deine persönliche Video-Marketing-Beraterin.

Schön, dass du dich für den **Full-Service-Modus** entschieden hast! Ich werde dir in **16 gezielten Fragen** helfen, das perfekte Erklärvideo zu planen – so gründlich wie eine echte Loft-Film Beratung.

Nach unserem Gespräch erstellt die KI dein komplettes Video automatisch – du musst nichts weiter tun!

**Phase 1/16: Was ist dein Hauptziel mit diesem Erklärvideo?**`,
  quickReplies: ['Mehr Verkäufe generieren', 'Brand Awareness steigern', 'Kundenschulung', 'Produkt erklären', 'Investoren überzeugen']
};

const INITIAL_MESSAGE_MANUAL: Message = {
  id: '1',
  role: 'assistant',
  content: `Hallo! 👋 Ich bin Lisa, deine persönliche Video-Marketing-Beraterin.

Du hast den **manuellen Modus** gewählt – super, wenn du volle Kontrolle über jeden Schritt möchtest!

Lass mich dir ein paar Fragen stellen, um dir den Start zu erleichtern.

**Was ist dein Hauptziel mit diesem Erklärvideo?**`,
  quickReplies: ['Mehr Verkäufe generieren', 'Brand Awareness steigern', 'Kundenschulung', 'Produkt erklären', 'Anderes Ziel']
};

export function ExplainerConsultant({ onConsultationComplete, onSkip, mode }: ExplainerConsultantProps) {
  const initialMessage = mode === 'full-service' ? INITIAL_MESSAGE_FULL_SERVICE : INITIAL_MESSAGE_MANUAL;
  
  const [messages, setMessages] = useState<Message[]>([initialMessage]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [consultationProgress, setConsultationProgress] = useState(0);
  const [showModeChoice, setShowModeChoice] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<ExplainerStyle>('flat-design');
  const [hasShownStylePreview, setHasShownStylePreview] = useState(false); // ✅ Nur einmal anzeigen
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await supabase.functions.invoke('explainer-consultant', {
        body: {
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content
          })),
          mode
        }
      });

      if (response.error) throw response.error;

      const data = response.data;
      
      // Update progress
      setConsultationProgress(data.progress || 0);

      // ✅ Style-Preview nur einmal bei Phase 5 anzeigen (currentPhase === 5)
      const shouldShowStylePreview = !hasShownStylePreview && 
                                     data.currentPhase === 5 && 
                                     mode === 'full-service';
      
      if (shouldShowStylePreview) {
        setHasShownStylePreview(true);
      }

      // Add assistant response
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message,
        quickReplies: data.quickReplies,
        showStylePreview: shouldShowStylePreview
      };

      setMessages(prev => [...prev, assistantMessage]);

      // ✅ Check if consultation is complete - NUR bei 100% Progress
      if (data.isComplete && data.recommendation && data.progress >= 100) {
        // In full-service mode, ask for final confirmation
        if (mode === 'full-service') {
          setTimeout(() => {
            const confirmMessage: Message = {
              id: (Date.now() + 2).toString(),
              role: 'assistant',
              content: `🎬 **Perfekt! Hier ist die Zusammenfassung:**

${data.recommendation.productDescription ? `📦 **Produkt:** ${data.recommendation.productDescription}` : ''}
${data.recommendation.targetAudience ? `👥 **Zielgruppe:** ${data.recommendation.targetAudience}` : ''}
${data.recommendation.style ? `🎨 **Stil:** ${data.recommendation.style}` : ''}
${data.recommendation.tone ? `🎭 **Tonalität:** ${data.recommendation.tone}` : ''}
${data.recommendation.duration ? `⏱️ **Länge:** ${data.recommendation.duration}` : ''}

Soll ich jetzt dein komplettes Erklärvideo erstellen? Das dauert etwa 5-10 Minuten.`,
              quickReplies: ['🤖 Ja, Video erstellen!', '✋ Nein, lieber manuell']
            };
            setMessages(prev => [...prev, confirmMessage]);
            setShowModeChoice(true);
          }, 1000);
        } else {
          // Manual mode - complete immediately with full recommendation
          setTimeout(() => {
            onConsultationComplete({
              ...data.recommendation,
              modeChoice: 'manual'
            });
          }, 1500);
        }
      }
    } catch (error) {
      console.error('Consultant error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Entschuldigung, es gab einen Fehler. Bitte versuche es erneut oder überspringe die Beratung.',
        quickReplies: ['Erneut versuchen', 'Beratung überspringen']
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickReply = async (reply: string) => {
    if (reply === 'Beratung überspringen') {
      onSkip();
      return;
    }
    
    // Handle mode choice in full-service
    if (showModeChoice) {
      if (reply.includes('Video erstellen')) {
        // Extract product summary from conversation history
        const userMessages = messages.filter(m => m.role === 'user');
        const productMessage = userMessages.find((m, idx) => idx >= 1 && m.content.length > 20);
        const productSummary = productMessage?.content || userMessages.slice(1, 3).map(m => m.content).join(' ') || 'Produkt-Erklärvideo';
        
        const result: ConsultationResult = {
          recommendedStyle: selectedStyle || 'flat-design',
          recommendedTone: 'professional',
          recommendedDuration: 60,
          targetAudience: ['Allgemein'],
          productSummary: productSummary,
          strategyTips: [],
          platformTips: [],
          modeChoice: 'full-service'
        };
        
        console.log('Consultation complete with productSummary:', productSummary);
        onConsultationComplete(result);
        return;
      } else if (reply.includes('manuell')) {
        onSkip();
        return;
      }
    }
    
    sendMessage(reply);
  };

  const handleStyleSelect = (style: ExplainerStyle) => {
    setSelectedStyle(style);
    sendMessage(`Ich wähle den Stil: ${style}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  // Calculate current phase for display
  const currentPhase = Math.ceil(consultationProgress / 10);

  return (
    <div className="max-w-3xl mx-auto">
      {/* James Bond 2028 Header with Avatar */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4 mb-6 p-4 bg-card/40 backdrop-blur-xl border border-white/10 rounded-2xl relative overflow-hidden"
      >
        {/* Glow effect */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#F5C76A]/5 via-transparent to-purple-500/5 pointer-events-none" />
        
        <div className="relative">
          <ConsultantAvatar isTyping={isLoading} />
          {/* Gold ring around avatar */}
          <div className="absolute -inset-1 rounded-full border border-[#F5C76A]/30 animate-pulse" />
        </div>
        
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold bg-gradient-to-r from-[#F5C76A] to-amber-300 bg-clip-text text-transparent">
              Lisa
            </h3>
            <span className="px-2 py-0.5 text-xs rounded-full bg-[#F5C76A]/10 border border-[#F5C76A]/30 text-[#F5C76A]">
              KI-Beraterin
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {mode === 'full-service' 
              ? `Phase ${currentPhase}/16 • ${Math.round(consultationProgress)}% abgeschlossen`
              : 'Ich helfe dir, das perfekte Erklärvideo zu planen'
            }
          </p>
        </div>
        
        {mode === 'manual' && (
          <Button variant="ghost" size="sm" onClick={onSkip} className="text-muted-foreground hover:text-[#F5C76A]">
            Überspringen
          </Button>
        )}
      </motion.div>

      {/* James Bond 2028 Progress Bar */}
      <div className="mb-6 relative">
        <div className="flex justify-between text-xs text-muted-foreground mb-2">
          <span className="flex items-center gap-1.5">
            <Crown className="h-3 w-3 text-[#F5C76A]" />
            {mode === 'full-service' ? 'Beratungsphase' : 'Beratungsfortschritt'}
          </span>
          <span className="text-[#F5C76A] font-medium">{Math.round(consultationProgress)}%</span>
        </div>
        
        <div className="h-2 bg-muted/20 rounded-full overflow-hidden border border-white/5">
          <motion.div
            className="h-full bg-gradient-to-r from-[#F5C76A] via-amber-400 to-[#F5C76A] relative"
            initial={{ width: 0 }}
            animate={{ width: `${consultationProgress}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            {/* Shimmer effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_2s_infinite]" 
                 style={{ backgroundSize: '200% 100%' }} />
          </motion.div>
        </div>
        
        {/* Phase indicators - 16 phases now with Hailuo Animation */}
        {mode === 'full-service' && (
          <div className="flex justify-between mt-2">
            {Array.from({ length: 16 }, (_, i) => (
              <motion.div 
                key={i}
                initial={{ scale: 0.8, opacity: 0.5 }}
                animate={{ 
                  scale: consultationProgress >= ((i + 1) / 16) * 100 ? 1 : 0.8,
                  opacity: consultationProgress >= ((i + 1) / 16) * 100 ? 1 : 0.5
                }}
                className={cn(
                  "w-2 h-2 rounded-full transition-all duration-300",
                  consultationProgress >= ((i + 1) / 16) * 100 
                    ? "bg-[#F5C76A] shadow-[0_0_8px_rgba(245,199,106,0.5)]" 
                    : "bg-muted/30 border border-white/10"
                )}
              />
            ))}
          </div>
        )}
      </div>

      {/* James Bond 2028 Chat Messages */}
      <div className="bg-card/30 backdrop-blur-xl border border-white/10 rounded-2xl p-4 min-h-[400px] max-h-[500px] overflow-y-auto mb-4 relative">
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none rounded-2xl" />
        
        <AnimatePresence>
          {messages.map((message, index) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={cn(
                "mb-4 flex relative",
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {message.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#F5C76A]/20 to-purple-500/20 flex items-center justify-center mr-3 flex-shrink-0 border border-[#F5C76A]/30">
                  <Sparkles className="h-4 w-4 text-[#F5C76A]" />
                </div>
              )}
              <div className={cn(
                "max-w-[80%] rounded-2xl px-4 py-3 relative overflow-hidden",
                message.role === 'user'
                  ? "bg-gradient-to-br from-[#F5C76A]/20 to-amber-500/10 text-foreground border border-[#F5C76A]/30"
                  : "bg-muted/20 border border-white/10"
              )}>
                {/* Subtle glow for assistant messages */}
                {message.role === 'assistant' && (
                  <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
                )}
                
                <div className="prose prose-sm prose-invert max-w-none whitespace-pre-wrap relative">
                  {message.content}
                </div>
                
                {/* Style Preview Grid - nur einmal anzeigen */}
                {message.role === 'assistant' && message.showStylePreview && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-4"
                  >
                    <StylePreviewGrid 
                      selectedStyle={selectedStyle} 
                      onSelectStyle={handleStyleSelect} 
                    />
                  </motion.div>
                )}
                
                {/* Quick Replies mit James Bond Style */}
                {message.role === 'assistant' && message.quickReplies && (
                  <div className="mt-4">
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
        
        {/* Typing indicator with gold styling */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#F5C76A]/20 to-purple-500/20 flex items-center justify-center border border-[#F5C76A]/30">
              <Sparkles className="h-4 w-4 text-[#F5C76A]" />
            </div>
            <div className="bg-muted/20 border border-white/10 rounded-2xl px-4 py-3">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 bg-[#F5C76A]/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-[#F5C76A]/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-[#F5C76A]/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </motion.div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* James Bond 2028 Input Form */}
      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Schreibe deine Antwort..."
          disabled={isLoading}
          className={cn(
            "flex-1 bg-muted/20 border border-white/10 rounded-xl px-4 py-3",
            "focus:border-[#F5C76A]/60 focus:outline-none focus:ring-2 focus:ring-[#F5C76A]/20",
            "placeholder:text-muted-foreground/60 transition-all backdrop-blur-sm"
          )}
        />
        <Button
          type="submit"
          disabled={!input.trim() || isLoading}
          className={cn(
            "px-6 bg-gradient-to-r from-[#F5C76A] to-amber-500 text-black font-medium",
            "hover:shadow-[0_0_25px_rgba(245,199,106,0.4)] transition-all duration-300",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </form>
    </div>
  );
}
