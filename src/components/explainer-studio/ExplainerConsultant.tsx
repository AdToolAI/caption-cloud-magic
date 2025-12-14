import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Sparkles, Loader2 } from 'lucide-react';
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

Schön, dass du dich für den **Full-Service-Modus** entschieden hast! Ich werde dir in 10 kurzen Fragen helfen, das perfekte Erklärvideo zu planen.

Nach unserem Gespräch erstellt die KI dein komplettes Video automatisch – du musst nichts weiter tun!

**Phase 1/10: Was ist dein Hauptziel mit diesem Erklärvideo?**`,
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

      // Check if we should show style previews
      const showStylePreview = data.message?.toLowerCase().includes('stil') || 
                               data.message?.toLowerCase().includes('style') ||
                               data.currentPhase === 7;

      // Add assistant response
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message,
        quickReplies: data.quickReplies,
        showStylePreview
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Check if consultation is complete
      if (data.isComplete && data.recommendation) {
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
          // Manual mode - complete immediately
          setTimeout(() => {
            onConsultationComplete(data.recommendation);
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
        // Extract recommendation from the conversation - use defaults
        const fakeResult: ConsultationResult = {
          recommendedStyle: 'flat-design',
          recommendedTone: 'professional',
          recommendedDuration: 60,
          targetAudience: ['Allgemein'],
          productSummary: '',
          strategyTips: [],
          platformTips: []
        };
        onConsultationComplete(fakeResult);
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

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header with Avatar */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4 mb-6 p-4 bg-card/60 backdrop-blur-xl border border-white/10 rounded-2xl"
      >
        <ConsultantAvatar isTyping={isLoading} />
        <div className="flex-1">
          <h3 className="text-lg font-semibold">Lisa - Video-Marketing-Beraterin</h3>
          <p className="text-sm text-muted-foreground">
            {mode === 'full-service' ? '10-Phasen Beratungsgespräch' : 'Ich helfe dir, das perfekte Erklärvideo zu planen'}
          </p>
        </div>
        {mode === 'manual' && (
          <Button variant="ghost" size="sm" onClick={onSkip} className="text-muted-foreground">
            Überspringen
          </Button>
        )}
      </motion.div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>{mode === 'full-service' ? 'Beratungsphase' : 'Beratungsfortschritt'}</span>
          <span>{Math.round(consultationProgress)}%</span>
        </div>
        <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-primary to-purple-500"
            initial={{ width: 0 }}
            animate={{ width: `${consultationProgress}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
        {mode === 'full-service' && (
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            {Array.from({ length: 10 }, (_, i) => (
              <div 
                key={i} 
                className={cn(
                  "w-2 h-2 rounded-full",
                  consultationProgress >= (i + 1) * 10 ? "bg-primary" : "bg-muted/30"
                )}
              />
            ))}
          </div>
        )}
      </div>

      {/* Chat Messages */}
      <div className="bg-card/40 backdrop-blur-xl border border-white/10 rounded-2xl p-4 min-h-[400px] max-h-[500px] overflow-y-auto mb-4">
        <AnimatePresence>
          {messages.map((message, index) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={cn(
                "mb-4 flex",
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {message.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center mr-3 flex-shrink-0">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
              )}
              <div className={cn(
                "max-w-[80%] rounded-2xl px-4 py-3",
                message.role === 'user'
                  ? "bg-primary/20 text-foreground border border-primary/30"
                  : "bg-muted/30 border border-white/10"
              )}>
                <div className="prose prose-sm prose-invert max-w-none whitespace-pre-wrap">
                  {message.content}
                </div>
                
                {/* Style Preview Grid */}
                {message.role === 'assistant' && message.showStylePreview && (
                  <div className="mt-4">
                    <StylePreviewGrid 
                      selectedStyle={selectedStyle} 
                      onSelectStyle={handleStyleSelect} 
                    />
                  </div>
                )}
                
                {/* Quick Replies */}
                {message.role === 'assistant' && message.quickReplies && (
                  <ConsultantQuickReplies
                    options={message.quickReplies}
                    onSelect={handleQuickReply}
                    disabled={isLoading}
                  />
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {/* Typing indicator */}
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div className="bg-muted/30 border border-white/10 rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </motion.div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Schreibe deine Antwort..."
          disabled={isLoading}
          className={cn(
            "flex-1 bg-muted/20 border border-white/10 rounded-xl px-4 py-3",
            "focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/20",
            "placeholder:text-muted-foreground/60 transition-all"
          )}
        />
        <Button
          type="submit"
          disabled={!input.trim() || isLoading}
          className={cn(
            "px-6 bg-gradient-to-r from-primary to-purple-500",
            "hover:shadow-[0_0_20px_rgba(245,199,106,0.3)]"
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
