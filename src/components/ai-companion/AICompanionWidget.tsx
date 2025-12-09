import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Sparkles, Minimize2, Loader2, History, Settings, Maximize2, Phone, HeadphonesIcon, AlertTriangle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { QuickActions } from './QuickActions';
import { ConversationHistory } from './ConversationHistory';
import { MessageBubble } from './MessageBubble';
import { CompanionSettings, type CompanionPreferences } from './CompanionSettings';
import { VoiceInput } from './VoiceInput';
import { VoiceOutput } from './VoiceOutput';
import { VoiceVisualizer } from './VoiceVisualizer';
import { SupportTicketModal } from './SupportTicketModal';
import { EscalationButton } from './EscalationButton';
import { useErrorCapture } from '@/hooks/useErrorCapture';
import { useProactiveTips } from '@/hooks/useProactiveTips';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

type WidgetMode = 'floating' | 'expanded' | 'voice';

const DEFAULT_PREFERENCES: CompanionPreferences = {
  bot_name: 'AdTool AI',
  voice_id: '9BWtsMINqrJLrRacOk9x',
  voice_enabled: false,
  speech_input_enabled: false,
  personality: 'friendly',
  auto_speak: false,
};

// Keywords that trigger support escalation offer
const ESCALATION_KEYWORDS = [
  'bug', 'fehler', 'funktioniert nicht', 'kaputt', 'problem', 'error',
  'hilfe', 'help', 'support', 'broken', 'crash', 'absturz', 'hängt',
  'lädt nicht', 'geht nicht', 'defekt', 'falsch', 'failed'
];

export function AICompanionWidget() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [widgetMode, setWidgetMode] = useState<WidgetMode>('floating');
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [hasUnreadTip, setHasUnreadTip] = useState(false);
  const [preferences, setPreferences] = useState<CompanionPreferences>(DEFAULT_PREFERENCES);
  const [lastAssistantMessage, setLastAssistantMessage] = useState<string>('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [detectedError, setDetectedError] = useState<{ message: string; stack?: string; url?: string } | null>(null);
  const [shouldOfferEscalation, setShouldOfferEscalation] = useState(false);
  const [showProactiveTip, setShowProactiveTip] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Proactive tips hook
  const { currentTip, hasIssues, errorCount, warningCount } = useProactiveTips();
  // Error capture hook
  const { getLastError } = useErrorCapture({
    enabled: true,
    onError: (error) => {
      console.log('Error captured by AI Companion:', error.message);
      setDetectedError({
        message: error.message,
        stack: error.stack,
        url: error.url,
      });
      // Auto-open widget when error detected (if not already open)
      if (!isOpen) {
        setHasUnreadTip(true);
      }
    }
  });

  // Load user preferences on mount
  useEffect(() => {
    if (user) {
      loadPreferences();
    }
  }, [user]);

  const loadPreferences = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('companion_user_preferences')
        .select('preferences')
        .eq('user_id', user.id)
        .single();
      
      if (data?.preferences) {
        setPreferences({ ...DEFAULT_PREFERENCES, ...(data.preferences as Record<string, unknown>) });
      }
    } catch (error) {
      // Ignore - will use defaults
    }
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus textarea when opening
  useEffect(() => {
    if (isOpen && !isMinimized && !showHistory && !showSettings && widgetMode !== 'voice') {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isOpen, isMinimized, showHistory, showSettings, widgetMode]);

  // Add welcome message when first opened - include error context if detected
  useEffect(() => {
    if (isOpen && messages.length === 0 && user) {
      let welcomeContent = `Hey! 👋 Ich bin ${preferences.bot_name}, dein persönlicher AdTool-Assistent. Ich helfe dir bei allem rund um AdTool - von der ersten Einrichtung bis zu fortgeschrittenen Features.`;
      
      // If we detected an error, include it in the welcome message
      if (detectedError) {
        welcomeContent = `Hey! 👋 Ich bin ${preferences.bot_name}. Ich habe bemerkt, dass ein Fehler aufgetreten ist:\n\n🚨 **${detectedError.message}**\n\n${detectedError.url ? `Seite: ${detectedError.url}\n\n` : ''}Möchtest du, dass ich dir bei der Behebung helfe? Oder soll ich den Fehler an unser Support-Team weiterleiten?`;
      } else if (hasIssues) {
        welcomeContent += `\n\n⚠️ Ich habe ${errorCount > 0 ? `${errorCount} kritische${errorCount > 1 ? ' Probleme' : 's Problem'}` : ''}${errorCount > 0 && warningCount > 0 ? ' und ' : ''}${warningCount > 0 ? `${warningCount} Warnung${warningCount > 1 ? 'en' : ''}` : ''} in deinem Account erkannt. Soll ich dir mehr Details zeigen?`;
      } else {
        welcomeContent += ` Was kann ich für dich tun?`;
      }
      
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: welcomeContent,
        timestamp: new Date()
      }]);
    }
  }, [isOpen, user, preferences.bot_name, detectedError, hasIssues, errorCount, warningCount]);

  // Simulate proactive tip after some time on certain pages
  useEffect(() => {
    if (!isOpen && user) {
      const tipTimeout = setTimeout(() => {
        const tipPages = ['/directors-cut', '/universal-creator', '/calendar'];
        if (tipPages.some(p => location.pathname.startsWith(p))) {
          setHasUnreadTip(true);
        }
      }, 30000);

      return () => clearTimeout(tipTimeout);
    }
  }, [location.pathname, isOpen, user]);

  // Clear tip indicator when opening
  useEffect(() => {
    if (isOpen) {
      setHasUnreadTip(false);
    }
  }, [isOpen]);

  // Check for escalation keywords in message
  const checkForEscalationKeywords = useCallback((text: string) => {
    const lowerText = text.toLowerCase();
    return ESCALATION_KEYWORDS.some(keyword => lowerText.includes(keyword));
  }, []);

  const sendMessage = useCallback(async (messageText?: string) => {
    const textToSend = messageText || inputValue.trim();
    if (!textToSend || isLoading || !user) return;

    // Check if message contains escalation keywords
    if (checkForEscalationKeywords(textToSend)) {
      setShouldOfferEscalation(true);
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setIsStreaming(true);

    const assistantId = `assistant-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date()
    }]);

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-companion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          message: textToSend,
          conversationId,
          context: {
            currentPage: location.pathname,
            type: 'general'
          },
          stream: true
        })
      });

      if (!response.ok) {
        throw new Error('Request failed');
      }

      const contentType = response.headers.get('content-type');
      let fullContent = '';
      
      if (contentType?.includes('text/event-stream')) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
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
                    setMessages(prev => prev.map(m => 
                      m.id === assistantId ? { ...m, content: fullContent } : m
                    ));
                  }
                  
                  if (parsed.conversationId) {
                    setConversationId(parsed.conversationId);
                  }
                } catch (e) {
                  // Ignore parse errors
                }
              }
            }
          }
        }
        setLastAssistantMessage(fullContent);
      } else {
        const data = await response.json();
        
        setMessages(prev => prev.map(m => 
          m.id === assistantId ? { ...m, content: data.message } : m
        ));
        
        if (data.conversationId) {
          setConversationId(data.conversationId);
        }
        
        setLastAssistantMessage(data.message);
      }
    } catch (error) {
      console.error('AI Companion error:', error);
      setMessages(prev => prev.map(m => 
        m.id === assistantId 
          ? { ...m, content: 'Entschuldigung, es gab einen Fehler. Bitte versuche es erneut.' }
          : m
      ));
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  }, [inputValue, isLoading, user, conversationId, location.pathname]);

  const handleTranscription = useCallback((text: string) => {
    setInputValue(text);
    setTimeout(() => {
      sendMessage(text);
    }, 100);
  }, [sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const loadConversation = async (convId: string) => {
    try {
      const { data, error } = await supabase
        .from('companion_messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      setMessages(data?.map(m => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: new Date(m.created_at)
      })) || []);
      setConversationId(convId);
    } catch (error) {
      console.error('Error loading conversation:', error);
    }
  };

  const startNewConversation = () => {
    setConversationId(null);
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: `Hey! 👋 Neues Gespräch mit ${preferences.bot_name} gestartet. Was kann ich für dich tun?`,
      timestamp: new Date()
    }]);
  };

  const handleSettingsChange = (newSettings: CompanionPreferences) => {
    setPreferences(newSettings);
  };

  const toggleVoiceMode = () => {
    setWidgetMode(prev => prev === 'voice' ? 'floating' : 'voice');
  };

  if (!user) return null;

  const voiceMode = isListening ? 'listening' : isSpeaking ? 'speaking' : 'idle';

  return (
    <>
      {/* Floating Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/25 flex items-center justify-center group"
          >
            <Sparkles className="w-6 h-6 group-hover:animate-pulse" />
            
            {/* Glow effect */}
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl -z-10 group-hover:bg-primary/30 transition-colors" />
            
            {/* Pulse ring */}
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-primary/50"
              animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            
            {/* Unread tip indicator */}
            {hasUnreadTip && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive flex items-center justify-center"
              >
                <span className="text-[10px] text-destructive-foreground font-bold">!</span>
              </motion.div>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ 
              opacity: 1, 
              y: 0, 
              scale: 1,
              height: isMinimized ? 'auto' : widgetMode === 'expanded' ? '80vh' : widgetMode === 'voice' ? '400px' : '550px',
              width: widgetMode === 'expanded' ? '500px' : '400px'
            }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={cn(
              "fixed bottom-6 right-6 z-50 rounded-2xl overflow-hidden",
              "bg-card/95 backdrop-blur-xl border border-white/10",
              "shadow-2xl shadow-black/20",
              "flex flex-col"
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-gradient-to-r from-primary/10 to-transparent">
              <div className="flex items-center gap-3">
                <motion.div 
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center relative",
                    "bg-gradient-to-br from-primary to-primary/60"
                  )}
                  animate={isSpeaking ? { scale: [1, 1.05, 1] } : {}}
                  transition={{ duration: 0.5, repeat: isSpeaking ? Infinity : 0 }}
                >
                  <Sparkles className="w-5 h-5 text-primary-foreground" />
                  {/* Active glow */}
                  {(isListening || isSpeaking) && (
                    <motion.div
                      className={cn(
                        "absolute inset-0 rounded-full blur-md -z-10",
                        isListening ? "bg-primary/50" : "bg-[hsl(45,93%,69%)]/50"
                      )}
                      animate={{ opacity: [0.5, 0.8, 0.5] }}
                      transition={{ duration: 1, repeat: Infinity }}
                    />
                  )}
                </motion.div>
                <div>
                  <h3 className="font-semibold text-foreground">{preferences.bot_name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {isListening ? 'Höre zu...' : isSpeaking ? 'Spricht...' : 'Dein persönlicher Assistent'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {/* Voice Mode Toggle */}
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-8 w-8 text-muted-foreground hover:text-foreground",
                    widgetMode === 'voice' && "text-primary bg-primary/10"
                  )}
                  onClick={toggleVoiceMode}
                  title="Voice Mode"
                >
                  <Phone className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowSettings(true)}
                  title="Einstellungen"
                >
                  <Settings className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowHistory(true)}
                  title="Gesprächsverlauf"
                >
                  <History className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => setWidgetMode(prev => prev === 'expanded' ? 'floating' : 'expanded')}
                >
                  <Maximize2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => setIsMinimized(!isMinimized)}
                >
                  <Minimize2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => setIsOpen(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Settings Panel */}
            <AnimatePresence>
              {showSettings && user && (
                <CompanionSettings
                  userId={user.id}
                  onClose={() => setShowSettings(false)}
                  onSettingsChange={handleSettingsChange}
                />
              )}
            </AnimatePresence>

            {/* Conversation History Panel */}
            <AnimatePresence>
              {showHistory && user && (
                <ConversationHistory
                  userId={user.id}
                  currentConversationId={conversationId}
                  onSelectConversation={loadConversation}
                  onNewConversation={startNewConversation}
                  onClose={() => setShowHistory(false)}
                />
              )}
            </AnimatePresence>

            {/* Voice Mode */}
            {!isMinimized && !showHistory && !showSettings && widgetMode === 'voice' && (
              <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
                {/* Voice Visualizer */}
                <VoiceVisualizer
                  isActive={isListening || isSpeaking}
                  mode={voiceMode}
                  className="w-full h-24"
                />
                
                {/* Status Text */}
                <motion.p
                  key={voiceMode}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm text-muted-foreground text-center"
                >
                  {isListening ? 'Ich höre zu... Sprich jetzt.' : 
                   isSpeaking ? `${preferences.bot_name} spricht...` : 
                   'Tippe auf das Mikrofon um zu sprechen'}
                </motion.p>
                
                {/* Big Mic Button */}
                <VoiceInput
                  onTranscription={handleTranscription}
                  onListeningChange={setIsListening}
                  disabled={isLoading || isSpeaking}
                />
                
                {/* Last Message Preview */}
                {lastAssistantMessage && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center text-sm text-muted-foreground max-w-[300px] line-clamp-2"
                  >
                    "{lastAssistantMessage.slice(0, 100)}..."
                  </motion.div>
                )}
              </div>
            )}

            {/* Messages (Normal Mode) */}
            {!isMinimized && !showHistory && !showSettings && widgetMode !== 'voice' && (
              <>
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-4">
                    {/* Proactive Tip Banner */}
                    {currentTip && showProactiveTip && messages.length <= 1 && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                          "rounded-lg p-3 border flex items-start gap-3",
                          currentTip.type === 'error' && "bg-destructive/10 border-destructive/30",
                          currentTip.type === 'warning' && "bg-[hsl(45,93%,69%)]/10 border-[hsl(45,93%,69%)]/30",
                          currentTip.type === 'info' && "bg-primary/10 border-primary/30"
                        )}
                      >
                        {currentTip.type === 'error' ? (
                          <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                        ) : currentTip.type === 'warning' ? (
                          <AlertTriangle className="w-5 h-5 text-[hsl(45,93%,69%)] shrink-0 mt-0.5" />
                        ) : (
                          <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground">{currentTip.message}</p>
                          {currentTip.action && (
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto p-0 mt-1 text-primary"
                              onClick={() => navigate(currentTip.action!)}
                            >
                              {currentTip.actionLabel || 'Beheben →'}
                            </Button>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0"
                          onClick={() => setShowProactiveTip(false)}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </motion.div>
                    )}
                    {messages.map((msg, index) => (
                      <MessageBubble
                        key={msg.id}
                        role={msg.role}
                        content={msg.content}
                        isStreaming={isStreaming && index === messages.length - 1 && msg.role === 'assistant'}
                        voiceId={preferences.voice_id}
                        voiceEnabled={preferences.voice_enabled}
                        autoSpeak={preferences.auto_speak && index === messages.length - 1}
                        onSpeakingChange={setIsSpeaking}
                        onAction={(action, params) => {
                          if (action === 'support') {
                            setShowSupportModal(true);
                          }
                          // reconnect and connect actions are handled by navigation in MessageBubble
                        }}
                      />
                    ))}
                    
                    {isLoading && messages[messages.length - 1]?.content === '' && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex justify-start"
                      >
                        <div className="bg-muted/50 rounded-2xl rounded-bl-md px-4 py-3 border border-white/5">
                          <div className="flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                            <span className="text-sm text-muted-foreground">Denke nach...</span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                    
                    {/* Escalation Offer */}
                    {shouldOfferEscalation && !isLoading && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex justify-start"
                      >
                        <div className="bg-gradient-to-r from-orange-500/10 to-red-500/10 border border-orange-500/20 rounded-2xl rounded-bl-md px-4 py-3">
                          <p className="text-sm text-foreground mb-2">
                            Klingt nach einem Problem! Möchtest du das an unser Support-Team weiterleiten?
                          </p>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setShowSupportModal(true);
                                setShouldOfferEscalation(false);
                              }}
                              className="h-7 text-xs border-orange-500/30 hover:bg-orange-500/10"
                            >
                              <HeadphonesIcon className="w-3 h-3 mr-1" />
                              Ja, weiterleiten
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setShouldOfferEscalation(false)}
                              className="h-7 text-xs"
                            >
                              Nein, danke
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                    
                    {/* Error Detected Banner */}
                    {detectedError && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex justify-start"
                      >
                        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl rounded-bl-md px-4 py-3">
                          <p className="text-sm text-red-400 font-medium mb-1">
                            ⚠️ Fehler erkannt
                          </p>
                          <p className="text-xs text-red-300/80 mb-2 font-mono truncate max-w-[250px]">
                            {detectedError.message}
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setShowSupportModal(true);
                            }}
                            className="h-7 text-xs border-red-500/30 hover:bg-red-500/10"
                          >
                            <HeadphonesIcon className="w-3 h-3 mr-1" />
                            Fehler melden
                          </Button>
                        </div>
                      </motion.div>
                    )}
                    
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {/* Quick Actions */}
                {messages.length <= 2 && (
                  <QuickActions 
                    currentPage={location.pathname}
                    onActionClick={sendMessage}
                  />
                )}

                {/* Input */}
                <div className="p-4 border-t border-white/10 bg-background/50">
                  <div className="flex gap-2">
                    {preferences.speech_input_enabled && (
                      <VoiceInput 
                        onTranscription={handleTranscription}
                        onListeningChange={setIsListening}
                        disabled={isLoading}
                      />
                    )}
                    <Textarea
                      ref={textareaRef}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Frag mich etwas..."
                      className="min-h-[44px] max-h-[120px] resize-none bg-muted/30 border-white/10 focus:border-primary/50"
                      rows={1}
                    />
                    <Button
                      onClick={() => sendMessage()}
                      disabled={!inputValue.trim() || isLoading}
                      size="icon"
                      className="h-[44px] w-[44px] shrink-0 bg-primary hover:bg-primary/90"
                    >
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Support Ticket Modal */}
      <SupportTicketModal
        isOpen={showSupportModal}
        onClose={() => {
          setShowSupportModal(false);
          setDetectedError(null);
        }}
        conversationId={conversationId || undefined}
        conversationSummary={messages.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n')}
        detectedError={detectedError || undefined}
      />
    </>
  );
}
