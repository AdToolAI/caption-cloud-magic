import { useState, useEffect, useRef } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { getProductInfo } from "@/config/pricing";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Send, RotateCcw, Sparkles, User } from "lucide-react";
import { PlanLimitDialog } from "@/components/performance/PlanLimitDialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

const Coach = () => {
  const { t, language } = useTranslation();
  const { session, subscribed, productId } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showPlanLimit, setShowPlanLimit] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isTyping, setIsTyping] = useState(false);
  
  const isPro = subscribed && productId === 'prod_TDoYdYP1nOOWsN';

  const quickPrompts = [
    t("coach_prompt_1"),
    t("coach_prompt_2"),
    t("coach_prompt_3"),
    t("coach_prompt_4"),
  ];

  useEffect(() => {
    if (session?.user) {
      initSession();
    }
  }, [session]);

  useEffect(() => {
    // Scroll to bottom when messages change
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const initSession = async () => {
    if (!session?.user) return;

    // Get or create session
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

  const handleSend = async (messageText?: string) => {
    const textToSend = messageText || input.trim();
    
    if (!textToSend || !sessionId || !session?.user) return;

    setInput("");
    setIsLoading(true);
    setIsTyping(true);

    // Add user message to UI immediately
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: textToSend,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMessage]);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/coach-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            message: textToSend,
            sessionId,
            language,
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          const data = await response.json();
          toast.error(data.error || t("coach_limit_reached"));
          setShowPlanLimit(true);
          setMessages(prev => prev.slice(0, -1)); // Remove user message
          return;
        }
        throw new Error("Failed to send message");
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = "";

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

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              setIsTyping(false);
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                assistantMessage += parsed.content;
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
              // Skip invalid JSON
            }
          }
        }
      }

      toast.success("Message sent!");
    } catch (error: any) {
      console.error("Error sending message:", error);
      toast.error("Failed to send message");
      setMessages(prev => prev.slice(0, -1)); // Remove user message on error
    } finally {
      setIsLoading(false);
      setIsTyping(false);
    }
  };

  const handleReset = async () => {
    if (!session?.user) return;

    if (sessionId) {
      // Delete old session
      await supabase.from("coach_sessions").delete().eq("id", sessionId);
    }

    await createNewSession();
    toast.success(t("coach_new_session"));
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
          <div className="mb-6">
            <h1 className="text-4xl font-bold mb-2">{t("coach_title")}</h1>
            <p className="text-muted-foreground">{t("coach_subtitle")}</p>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <Card className="p-6">
              {/* Quick Prompts */}
              <div className="mb-4">
                <h3 className="text-sm font-medium mb-3">{t("coach_quick_prompts")}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {quickPrompts.map((prompt, idx) => (
                    <Button
                      key={idx}
                      variant="outline"
                      size="sm"
                      onClick={() => handleSend(prompt)}
                      disabled={isLoading}
                      className="text-left justify-start h-auto py-2 px-3"
                    >
                      <Sparkles className="h-3 w-3 mr-2 shrink-0" />
                      <span className="text-xs">{prompt}</span>
                    </Button>
                  ))}
                </div>
              </div>

              {/* Messages */}
              <ScrollArea ref={scrollRef} className="h-[500px] pr-4 mb-4">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                    <Sparkles className="h-12 w-12 mb-4 opacity-50" />
                    <p>{t("coach_no_messages")}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${
                          message.role === "user" ? "justify-end" : "justify-start"
                        }`}
                      >
                        <div
                          className={`flex gap-3 max-w-[80%] ${
                            message.role === "user" ? "flex-row-reverse" : "flex-row"
                          }`}
                        >
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                              message.role === "user"
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted"
                            }`}
                          >
                            {message.role === "user" ? (
                              <User className="h-4 w-4" />
                            ) : (
                              <Sparkles className="h-4 w-4" />
                            )}
                          </div>
                          <div
                            className={`rounded-lg p-3 ${
                              message.role === "user"
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted"
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {isTyping && (
                      <div className="flex justify-start">
                        <div className="flex gap-3">
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                            <Sparkles className="h-4 w-4" />
                          </div>
                          <div className="rounded-lg p-3 bg-muted">
                            <div className="flex gap-1">
                              <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                              <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                              <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </ScrollArea>

              {/* Input */}
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Textarea
                    placeholder={t("coach_input_placeholder")}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={isLoading}
                    className="min-h-[60px] max-h-[120px]"
                  />
                  <div className="flex flex-col gap-2">
                    <Button
                      onClick={() => handleSend()}
                      disabled={isLoading || !input.trim()}
                      size="icon"
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      onClick={handleReset}
                      disabled={isLoading}
                      size="icon"
                      variant="outline"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {!isPro && (
                  <p className="text-xs text-muted-foreground">
                    Free plan: 5 messages/day • Pro: Unlimited + Deep Strategy Mode
                  </p>
                )}
              </div>
            </Card>
          </div>
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
