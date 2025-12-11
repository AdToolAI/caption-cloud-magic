import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { useAICall } from "@/hooks/useAICall";
import { FEATURE_COSTS } from "@/lib/featureCosts";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Send, RotateCcw, Sparkles, User, AlertCircle, Zap } from "lucide-react";
import { PlanLimitDialog } from "@/components/performance/PlanLimitDialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AICallStatus } from "@/components/ai/AICallStatus";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CoachHeroHeader } from "@/components/coach/CoachHeroHeader";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

const Coach = () => {
  const { t, language } = useTranslation();
  const { session, subscribed, productId } = useAuth();
  const { executeAICall, loading: aiLoading, status } = useAICall();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showPlanLimit, setShowPlanLimit] = useState(false);
  const [showCreditError, setShowCreditError] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isTyping, setIsTyping] = useState(false);
  
  const isPro = subscribed && productId === 'prod_TDoYdYP1nOOWsN';

  // Dynamic quick prompts - start with static translations, then update dynamically
  const [dynamicQuickPrompts, setDynamicQuickPrompts] = useState<string[]>([]);
  const [usedPromptIndex, setUsedPromptIndex] = useState<number | null>(null);
  const [replacingIndex, setReplacingIndex] = useState<number | null>(null);

  // Initialize prompts from translations
  useEffect(() => {
    setDynamicQuickPrompts([
      t("coach_prompt_1"),
      t("coach_prompt_2"),
      t("coach_prompt_3"),
      t("coach_prompt_4"),
    ]);
  }, [t]);

  useEffect(() => {
    if (session?.user) {
      initSession();
    }
  }, [session]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const initSession = async () => {
    if (!session?.user) return;

    const { data: sessions } = await supabase
      .from("coach_sessions")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (sessions && sessions.length > 0) {
      setSessionId(sessions[0].id);
      loadMessages(sessions[0].id);
    } else {
      await createNewSession();
    }
  };

  const createNewSession = async () => {
    if (!session?.user) return;

    const { data, error } = await supabase
      .from("coach_sessions")
      .insert({
        user_id: session.user.id,
        language: language,
        mode: isPro ? "pro" : "free",
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating session:", error);
      toast.error("Failed to create chat session");
      return;
    }

    setSessionId(data.id);
    setMessages([]);
  };

  const loadMessages = async (sid: string) => {
    const { data, error } = await supabase
      .from("coach_messages")
      .select("*")
      .eq("session_id", sid)
      .neq("role", "system")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error loading messages:", error);
      return;
    }

    setMessages((data || []).map(msg => ({
      id: msg.id,
      role: msg.role as "user" | "assistant",
      content: msg.content,
      created_at: msg.created_at,
    })));
  };

  const generateFollowupQuestion = async (originalQuestion: string, coachAnswer: string, promptIdx: number) => {
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-followup-question`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authSession?.access_token}`,
          },
          body: JSON.stringify({
            originalQuestion,
            coachAnswer,
            language,
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.followupQuestion) {
          // Animate replacement
          setReplacingIndex(promptIdx);
          
          setTimeout(() => {
            setDynamicQuickPrompts(prev => {
              const updated = [...prev];
              updated[promptIdx] = data.followupQuestion;
              return updated;
            });
            setReplacingIndex(null);
          }, 300);
        }
      }
    } catch (error) {
      console.error('Failed to generate follow-up question:', error);
    }
  };

  const handleSend = async (messageText?: string, promptIdx?: number) => {
    const textToSend = messageText || input.trim();
    
    if (!textToSend || !sessionId || !session?.user) return;

    setInput("");
    setIsTyping(true);
    setShowCreditError(false);

    // Track which quick prompt was used
    const clickedPromptIndex = promptIdx !== undefined ? promptIdx : null;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: textToSend,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMessage]);

    let fullAssistantResponse = '';

    try {
      await executeAICall({
        featureCode: FEATURE_COSTS.COACH_CHAT,
        estimatedCost: 1,
        apiCall: async () => {
          const { data: { session: authSession } } = await supabase.auth.getSession();
          
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/coach-chat`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${authSession?.access_token}`,
              },
              body: JSON.stringify({
                message: textToSend,
                sessionId,
                language,
              }),
            }
          );

          if (!response.ok) {
            const data = await response.json().catch(() => ({ error: 'Unknown error' }));
            
            if (response.status === 429) {
              toast.error(data.error || t("coach_limit_reached"));
              setShowPlanLimit(true);
              throw new Error("RATE_LIMIT_EXCEEDED");
            }
            
            if (response.status === 402) {
              setShowCreditError(true);
              throw new Error("INSUFFICIENT_CREDITS");
            }

            if (response.status === 504) {
              toast.error("Request timeout. Please try again.");
              throw new Error("TIMEOUT");
            }
            
            throw new Error(data.error || "Failed to send message");
          }

          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          let assistantMessage = "";
          let textBuffer = "";

          const assistantMsg: Message = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "",
            created_at: new Date().toISOString(),
          };
          setMessages(prev => [...prev, assistantMsg]);

          while (true) {
            const { done, value } = await reader!.read();
            if (done) break;

            textBuffer += decoder.decode(value, { stream: true });

            let newlineIndex: number;
            while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
              let line = textBuffer.slice(0, newlineIndex);
              textBuffer = textBuffer.slice(newlineIndex + 1);

              if (line.endsWith("\r")) line = line.slice(0, -1);
              if (line.startsWith(":") || line.trim() === "") continue;
              if (!line.startsWith("data: ")) continue;

              const jsonStr = line.slice(6).trim();
              if (jsonStr === "[DONE]") {
                setIsTyping(false);
                break;
              }

              try {
                const parsed = JSON.parse(jsonStr);
                if (parsed.content) {
                  assistantMessage += parsed.content;
                  fullAssistantResponse = assistantMessage;
                  setMessages(prev => {
                    const newMessages = [...prev];
                    const lastMsg = newMessages[newMessages.length - 1];
                    if (lastMsg.role === "assistant") {
                      lastMsg.content = assistantMessage;
                    }
                    return newMessages;
                  });
                }
              } catch (e) {
                textBuffer = line + "\n" + textBuffer;
                break;
              }
            }
          }

          // Generate follow-up question if a quick prompt was clicked
          if (clickedPromptIndex !== null && fullAssistantResponse) {
            generateFollowupQuestion(textToSend, fullAssistantResponse, clickedPromptIndex);
          }

          return response;
        }
      });
    } catch (error: any) {
      console.error("Error sending message:", error);
      
      if (error.code === 'INSUFFICIENT_CREDITS' || error.message === 'INSUFFICIENT_CREDITS') {
        setShowCreditError(true);
      } else if (error.message !== 'RATE_LIMIT_EXCEEDED') {
        toast.error(error.message || "Failed to send message");
      }
      
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsTyping(false);
    }
  };

  const handleReset = async () => {
    if (!session?.user) return;

    if (sessionId) {
      // Delete old session and all its messages
      await supabase.from("coach_messages").delete().eq("session_id", sessionId);
      await supabase.from("coach_sessions").delete().eq("id", sessionId);
    }

    await createNewSession();
    toast.success("Neue Session gestartet - sauberer Start ohne alte Bugs!");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          {/* Premium Hero Header */}
          <CoachHeroHeader isPro={isPro} />

          {status.stage !== 'idle' && (
            <div className="mb-4">
              <AICallStatus stage={status.stage} message={status.message} retryAttempt={status.retryAttempt} />
            </div>
          )}

          {showCreditError && (
            <Alert className="mb-4 bg-red-500/10 border-red-500/30 backdrop-blur-sm">
              <AlertCircle className="h-4 w-4 text-red-400" />
              <AlertTitle className="text-red-400">Credits erschöpft</AlertTitle>
              <AlertDescription className="text-red-300/80">
                Du hast dein Nachrichten-Limit erreicht.{" "}
                <a href="/billing" className="underline font-medium text-primary hover:text-primary/80">
                  Jetzt upgraden
                </a>
              </AlertDescription>
            </Alert>
          )}

          {/* Quick Prompts - Premium Chips */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary/20 to-cyan-500/20 
                              flex items-center justify-center shadow-[0_0_15px_hsla(43,90%,68%,0.15)]">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              </div>
              <h3 className="text-sm font-medium text-foreground/80">{t("coach_quick_prompts")}</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <AnimatePresence mode="popLayout">
                {dynamicQuickPrompts.map((prompt, idx) => (
                  <motion.button
                    key={`${idx}-${prompt.substring(0, 20)}`}
                    initial={{ opacity: 0, scale: 0.9, y: 10 }}
                    animate={{ 
                      opacity: replacingIndex === idx ? 0.3 : 1, 
                      scale: replacingIndex === idx ? 0.95 : 1,
                      y: 0 
                    }}
                    exit={{ opacity: 0, scale: 0.9, y: -10 }}
                    transition={{ duration: 0.3, delay: idx * 0.05 }}
                    whileHover={{ scale: 1.01, y: -2 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => handleSend(prompt, idx)}
                    disabled={aiLoading || replacingIndex !== null}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl 
                               bg-muted/20 border border-white/10 
                               hover:border-primary/40 hover:shadow-[0_0_20px_hsla(43,90%,68%,0.15)]
                               transition-all duration-300 text-left group disabled:opacity-50"
                  >
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-cyan-500/20 
                                    flex items-center justify-center shrink-0
                                    group-hover:shadow-[0_0_15px_hsla(43,90%,68%,0.3)] transition-all">
                      <Sparkles className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-sm text-foreground/80 line-clamp-2">{prompt}</span>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* Chat Container with Glassmorphism */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl p-6
                       shadow-[0_0_40px_hsla(43,90%,68%,0.08)]"
          >
            {/* Messages */}
            <ScrollArea ref={scrollRef} className="h-[500px] pr-4 mb-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <motion.div
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ repeat: Infinity, duration: 3 }}
                    className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-cyan-500/20
                               flex items-center justify-center shadow-[0_0_30px_hsla(43,90%,68%,0.15)] mb-4"
                  >
                    <Sparkles className="h-10 w-10 text-primary/60" />
                  </motion.div>
                  <p className="text-muted-foreground">{t("coach_no_messages")}</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Starte mit einer Schnellfrage oder schreibe direkt</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message, idx) => (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className={`flex ${
                        message.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`flex gap-3 max-w-[80%] ${
                          message.role === "user" ? "flex-row-reverse" : "flex-row"
                        }`}
                      >
                        {/* Avatar with Glow */}
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                            message.role === "user"
                              ? "bg-gradient-to-br from-primary to-amber-500 shadow-[0_0_15px_hsla(43,90%,68%,0.4)]"
                              : "bg-gradient-to-br from-cyan-500/20 to-primary/20 shadow-[0_0_15px_hsla(186,100%,50%,0.2)]"
                          }`}
                        >
                          {message.role === "user" ? (
                            <User className="h-4 w-4 text-primary-foreground" />
                          ) : (
                            <Sparkles className="h-4 w-4 text-primary" />
                          )}
                        </div>
                        
                        {/* Message Bubble */}
                        <div
                          className={`rounded-2xl relative overflow-hidden ${
                            message.role === "user"
                              ? "p-3 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-[0_0_20px_hsla(43,90%,68%,0.3)]"
                              : "p-4 bg-gradient-to-br from-card/80 to-card/40 border border-white/10 backdrop-blur-xl shadow-[inset_0_1px_1px_hsla(0,0%,100%,0.1),0_4px_24px_hsla(0,0%,0%,0.2)]"
                          }`}
                        >
                          {/* Gradient accent line for assistant messages */}
                          {message.role === "assistant" && (
                            <div className="absolute top-0 left-4 right-4 h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
                          )}
                          
                          {message.role === "assistant" ? (
                            <div className="text-sm leading-relaxed prose-coach">
                              <ReactMarkdown
                                components={{
                                  h3: ({ children }) => (
                                  <h3 className="text-primary font-semibold text-base mt-3 mb-2 first:mt-0">
                                    {children}
                                  </h3>
                                ),
                                h2: ({ children }) => (
                                  <h2 className="text-primary font-semibold text-lg mt-4 mb-2 first:mt-0">
                                    {children}
                                  </h2>
                                ),
                                ul: ({ children }) => (
                                  <ul className="space-y-2 my-3">{children}</ul>
                                ),
                                li: ({ children }) => (
                                  <li className="flex items-start gap-2">
                                    <span className="text-primary mt-0.5 shrink-0">•</span>
                                    <span className="text-foreground/90">{children}</span>
                                  </li>
                                ),
                                strong: ({ children }) => (
                                  <strong className="text-primary font-semibold">{children}</strong>
                                ),
                                p: ({ children }) => (
                                  <p className="text-foreground/90 mb-2 last:mb-0">{children}</p>
                                ),
                                blockquote: ({ children }) => (
                                  <blockquote className="border-l-2 border-primary/50 pl-3 italic text-foreground/80 my-3 bg-primary/5 py-2 rounded-r-lg">
                                    {children}
                                  </blockquote>
                                ),
                                code: ({ children }) => (
                                  <code className="bg-muted/50 px-1.5 py-0.5 rounded text-xs font-mono text-primary">
                                    {children}
                                  </code>
                                ),
                              }}
                            >
                              {message.content}
                            </ReactMarkdown>
                            </div>
                          ) : (
                            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  
                  {/* Typing Indicator */}
                  {isTyping && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex justify-start"
                    >
                      <div className="flex gap-3">
                        <motion.div 
                          animate={{ scale: [1, 1.1, 1] }}
                          transition={{ repeat: Infinity, duration: 1 }}
                          className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500/20 to-primary/20 
                                     flex items-center justify-center shadow-[0_0_15px_hsla(43,90%,68%,0.2)]"
                        >
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        </motion.div>
                        <div className="rounded-xl p-3 bg-muted/30 border border-white/10">
                          <span className="text-sm text-muted-foreground">Coach antwortet...</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}
            </ScrollArea>

            {/* Input Area - Premium Styling */}
            <div className="space-y-3 border-t border-white/10 pt-4">
              <div className="flex gap-3">
                <Textarea
                  placeholder={t("coach_input_placeholder")}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={aiLoading}
                  className="min-h-[60px] max-h-[120px] bg-muted/20 border-white/10 
                             focus:border-primary/60 focus:ring-2 focus:ring-primary/20
                             placeholder:text-muted-foreground/50"
                />
                <div className="flex flex-col gap-2">
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button
                      onClick={() => handleSend()}
                      disabled={aiLoading || !input.trim()}
                      size="icon"
                      className="bg-gradient-to-r from-primary to-primary/80 
                                 shadow-[0_0_20px_hsla(43,90%,68%,0.3)]
                                 hover:shadow-[0_0_30px_hsla(43,90%,68%,0.5)]
                                 transition-all duration-300"
                    >
                      {aiLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </motion.div>
                  <Button
                    onClick={handleReset}
                    disabled={aiLoading}
                    size="sm"
                    variant="outline"
                    className="border-white/20 hover:bg-white/5 hover:border-primary/40 gap-1.5 px-3"
                    title="Neue Konversation starten - behebt 'Abs'-Bug"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span className="text-xs">Neu</span>
                  </Button>
                </div>
              </div>
              
              {/* Pro/Free Info Badge */}
              {!isPro && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg 
                                bg-muted/20 border border-white/10">
                  <Zap className="h-3 w-3 text-primary" />
                  <span className="text-xs text-muted-foreground">
                    Free plan: 5 messages/day • <span className="text-primary font-medium">Pro: Unlimited</span>
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </main>

      <Footer />

      <PlanLimitDialog
        open={showPlanLimit}
        onOpenChange={setShowPlanLimit}
        feature="AI Content Coach (Unlimited messages + Deep Strategy Mode)"
      />
    </div>
  );
};

export default Coach;
