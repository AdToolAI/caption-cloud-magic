import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Sparkles, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import type { 
  VideoCategory, 
  UniversalVideoConsultationResult, 
  InterviewMessage 
} from '@/types/universal-video-creator';
import { VIDEO_CATEGORIES } from '@/types/universal-video-creator';

interface Message {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  quickReplies?: string[];
  phase?: number;
}

interface UniversalVideoConsultantProps {
  category: VideoCategory;
  onConsultationComplete: (result: UniversalVideoConsultationResult) => void;
  onBack: () => void;
}

const getCategoryGreeting = (category: VideoCategory): Message => {
  const categoryConfig = VIDEO_CATEGORIES.find(c => c.id === category);
  const phaseCount = categoryConfig?.interviewPhases || 18;
  
  const greetings: Record<VideoCategory, { intro: string; firstQuestion: string; quickReplies: string[] }> = {
    'werbevideo': {
      intro: `Du hast **${categoryConfig?.name}** gewählt – perfekt für Werbekampagnen und Produkt-Promotions!`,
      firstQuestion: '**Phase 1/${phaseCount}: Welches Kampagnenziel verfolgst du?**',
      quickReplies: ['Awareness steigern', 'Leads generieren', 'Direktverkauf', 'Retargeting', 'App-Installationen']
    },
    'storytelling': {
      intro: `Du hast **${categoryConfig?.name}** gewählt – ideal für emotionale Markengeschichten!`,
      firstQuestion: '**Phase 1/${phaseCount}: Welche Art von Geschichte möchtest du erzählen?**',
      quickReplies: ['Gründer-Story', 'Kunden-Journey', 'Produkt-Entstehung', 'Vision & Mission', 'Transformation']
    },
    'social-media': {
      intro: `Du hast **${categoryConfig?.name}** gewählt – optimiert für TikTok, Reels & Shorts!`,
      firstQuestion: '**Phase 1/${phaseCount}: Für welche Plattform ist das Video primär?**',
      quickReplies: ['TikTok', 'Instagram Reels', 'YouTube Shorts', 'Alle Plattformen', 'Facebook']
    },
    'testimonial': {
      intro: `Du hast **${categoryConfig?.name}** gewählt – perfekt für Kundenstimmen und Case Studies!`,
      firstQuestion: '**Phase 1/${phaseCount}: Welchen Typ Testimonial möchtest du erstellen?**',
      quickReplies: ['Einzelkunde', 'Multiple Kunden', 'Case Study', 'Video-Review', 'Erfolgsgeschichte']
    },
    'tutorial': {
      intro: `Du hast **${categoryConfig?.name}** gewählt – ideal für Anleitungen und How-To Videos!`,
      firstQuestion: '**Phase 1/${phaseCount}: Was soll der Zuschauer am Ende KÖNNEN?**',
      quickReplies: ['Software bedienen', 'Prozess verstehen', 'Skill erlernen', 'Problem lösen', 'Best Practices']
    },
    'event-promo': {
      intro: `Du hast **${categoryConfig?.name}** gewählt – perfekt für Veranstaltungswerbung!`,
      firstQuestion: '**Phase 1/${phaseCount}: Welche Art von Event bewirbst du?**',
      quickReplies: ['Konferenz', 'Webinar', 'Workshop', 'Launch Event', 'Networking Event']
    },
    'brand-story': {
      intro: `Du hast **${categoryConfig?.name}** gewählt – ideal für Unternehmensvorstellungen!`,
      firstQuestion: '**Phase 1/${phaseCount}: Was ist der Kern eurer Gründungsgeschichte?**',
      quickReplies: ['Problem entdeckt', 'Leidenschaft verfolgt', 'Marktlücke erkannt', 'Innovation entwickelt', 'Team zusammengefunden']
    },
    'produktdemo': {
      intro: `Du hast **${categoryConfig?.name}** gewählt – perfekt für Feature-Präsentationen!`,
      firstQuestion: '**Phase 1/${phaseCount}: Welchen Produkttyp möchtest du demonstrieren?**',
      quickReplies: ['Software/SaaS', 'Mobile App', 'Physical Product', 'Service', 'Plattform']
    },
    'recruitment': {
      intro: `Du hast **${categoryConfig?.name}** gewählt – ideal für Employer Branding!`,
      firstQuestion: '**Phase 1/${phaseCount}: Welche Position(en) sollen beworben werden?**',
      quickReplies: ['Entwickler/Tech', 'Sales/Marketing', 'Management', 'Multiple Rollen', 'Generell Arbeitgeber']
    }
  };

  const greeting = greetings[category];
  const phaseQuestion = greeting.firstQuestion.replace('${phaseCount}', phaseCount.toString());

  return {
    id: '1',
    role: 'assistant',
    content: `Hallo! 👋 Ich bin Max, dein Video-Marketing-Berater.

${greeting.intro}

In **${phaseCount} gezielten Fragen** entwickeln wir gemeinsam dein perfektes Video – maßgeschneidert auf deine Kategorie und Ziele.

${phaseQuestion}`,
    quickReplies: greeting.quickReplies,
    phase: 1
  };
};

export function UniversalVideoConsultant({ category, onConsultationComplete, onBack }: UniversalVideoConsultantProps) {
  const categoryConfig = VIDEO_CATEGORIES.find(c => c.id === category);
  const totalPhases = categoryConfig?.interviewPhases || 18;
  
  const [messages, setMessages] = useState<Message[]>([getCategoryGreeting(category)]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentPhase, setCurrentPhase] = useState(1);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim(),
      phase: currentPhase
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await supabase.functions.invoke('universal-video-consultant', {
        body: {
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content
          })),
          category,
          currentPhase
        }
      });

      if (response.error) throw response.error;

      const data = response.data;
      
      // Update phase
      if (data.nextPhase) {
        setCurrentPhase(data.nextPhase);
      }

      // Add assistant response
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.message,
        quickReplies: data.quickReplies,
        phase: data.nextPhase || currentPhase
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Check if consultation is complete
      if (data.isComplete && data.consultationResult) {
        setShowConfirmation(true);
        
        setTimeout(() => {
          const confirmMessage: Message = {
            id: (Date.now() + 2).toString(),
            role: 'assistant',
            content: `🎬 **Perfekt! Hier ist deine Zusammenfassung:**

${data.consultationResult.targetAudience ? `👥 **Zielgruppe:** ${data.consultationResult.targetAudience}` : ''}
${data.consultationResult.emotionalTrigger ? `💡 **Emotionaler Trigger:** ${data.consultationResult.emotionalTrigger}` : ''}
${data.consultationResult.visualStyle ? `🎨 **Visueller Stil:** ${data.consultationResult.visualStyle}` : ''}
${data.consultationResult.duration ? `⏱️ **Länge:** ${data.consultationResult.duration}s` : ''}
${data.consultationResult.subtitlesEnabled !== undefined ? `📝 **Untertitel:** ${data.consultationResult.subtitlesEnabled ? 'Ja' : 'Nein'}` : ''}
${data.consultationResult.exportToDirectorsCut ? `✂️ **Director's Cut Export:** Ja` : ''}

Soll ich jetzt mit der Video-Generierung starten?`,
            quickReplies: ['🚀 Video erstellen!', '✏️ Nochmal anpassen']
          };
          setMessages(prev => [...prev, confirmMessage]);
        }, 1000);
      }
    } catch (error) {
      console.error('Error in consultant:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Entschuldigung, es gab ein Problem. Bitte versuche es erneut.',
        quickReplies: ['Nochmal versuchen']
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickReply = (reply: string) => {
    if (showConfirmation) {
      if (reply.includes('Video erstellen')) {
        // Extract consultation result from last API response
        const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant');
        // Complete consultation
        onConsultationComplete({
          category,
          subtitlesEnabled: true,
          exportToDirectorsCut: false,
          interviewTranscript: messages.map(m => ({
            role: m.role,
            content: m.content,
            phase: m.phase,
            timestamp: new Date().toISOString()
          })),
          categorySpecificData: {}
        });
      } else {
        // Reset confirmation
        setShowConfirmation(false);
        setCurrentPhase(Math.max(1, currentPhase - 2));
        sendMessage(reply);
      }
    } else {
      sendMessage(reply);
    }
  };

  const progressPercent = Math.round((currentPhase / totalPhases) * 100);

  return (
    <div className="flex flex-col h-[600px] bg-card rounded-xl border overflow-hidden">
      {/* Header with progress */}
      <div className="p-4 border-b bg-muted/30">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-amber-500 flex items-center justify-center text-white font-bold">
              M
            </div>
            <div>
              <h3 className="font-semibold">Max • Video-Berater</h3>
              <p className="text-xs text-muted-foreground">
                {categoryConfig?.icon} {categoryConfig?.name} Interview
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-sm font-medium">{currentPhase}/{totalPhases}</span>
            <p className="text-xs text-muted-foreground">{progressPercent}% abgeschlossen</p>
          </div>
        </div>
        
        {/* Progress bar */}
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-primary to-amber-500"
            initial={{ width: 0 }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <AnimatePresence>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={cn(
                'flex gap-3',
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {message.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-amber-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                  M
                </div>
              )}
              <div
                className={cn(
                  'max-w-[80%] rounded-2xl p-4',
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                )}
              >
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {message.content.split('**').map((part, i) => 
                    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
                  )}
                </p>
                
                {/* Quick replies */}
                {message.quickReplies && message.role === 'assistant' && 
                 messages[messages.length - 1].id === message.id && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {message.quickReplies.map((reply, i) => (
                      <Button
                        key={i}
                        variant="outline"
                        size="sm"
                        onClick={() => handleQuickReply(reply)}
                        disabled={isLoading}
                        className="text-xs hover:bg-primary/10 hover:border-primary"
                      >
                        {reply}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
              {message.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <span className="text-sm">👤</span>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-amber-500 flex items-center justify-center text-white text-sm font-bold">
              M
            </div>
            <div className="bg-muted rounded-2xl p-4">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          </motion.div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t bg-muted/30">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Deine Antwort..."
            disabled={isLoading}
            className="flex-1 bg-background border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <Button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-gradient-to-r from-primary to-amber-500 hover:opacity-90"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
