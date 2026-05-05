import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Minus,
  X,
  Maximize2,
  Send,
  Loader2,
  GripHorizontal,
  ExternalLink,
  Pin,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { usePinnedChat } from "@/contexts/PinnedChatContext";
import { TEXT_MODELS } from "@/lib/text-studio/models";

type Msg = { role: "user" | "assistant"; content: string };

const MIN_W = 280;
const MIN_H = 320;
const MAX_W = 720;
const MAX_H = 900;

export default function PinnedChatWindow() {
  const { pinned, windowState, unpin, setWindowState } = usePinnedChat();
  const location = useLocation();
  const navigate = useNavigate();
  const isOnStudio = location.pathname.startsWith("/ai-text-studio");

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Drag/resize state
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);

  // Load conversation messages
  useEffect(() => {
    if (!pinned?.conversationId) {
      setMessages([]);
      return;
    }
    setLoading(true);
    supabase
      .from("text_studio_messages")
      .select("role,content")
      .eq("conversation_id", pinned.conversationId)
      .order("created_at")
      .then(({ data }) => {
        setMessages(((data as Msg[]) || []).filter((m) => (m.role as any) !== "system"));
        setLoading(false);
      });
  }, [pinned?.conversationId]);

  // Realtime sync
  useEffect(() => {
    if (!pinned?.conversationId) return;
    const channel = supabase
      .channel(`pinned-chat-${pinned.conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "text_studio_messages",
          filter: `conversation_id=eq.${pinned.conversationId}`,
        },
        (payload: any) => {
          const row = payload.new;
          if (!row || row.role === "system") return;
          setMessages((prev) => {
            // Avoid duplicating optimistic streaming entries
            if (prev.length && prev[prev.length - 1].role === row.role && prev[prev.length - 1].content === row.content)
              return prev;
            return [...prev, { role: row.role, content: row.content }];
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [pinned?.conversationId]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  // Drag handlers
  const onDragStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: windowState.x,
        origY: windowState.y,
      };
      (e.target as Element).setPointerCapture?.(e.pointerId);
    },
    [windowState.x, windowState.y],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragRef.current) {
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        const maxX = window.innerWidth - 100;
        const maxY = window.innerHeight - 60;
        setWindowState({
          x: Math.min(maxX, Math.max(0, dragRef.current.origX + dx)),
          y: Math.min(maxY, Math.max(0, dragRef.current.origY + dy)),
        });
      } else if (resizeRef.current) {
        const dw = e.clientX - resizeRef.current.startX;
        const dh = e.clientY - resizeRef.current.startY;
        setWindowState({
          w: Math.min(MAX_W, Math.max(MIN_W, resizeRef.current.origW + dw)),
          h: Math.min(MAX_H, Math.max(MIN_H, resizeRef.current.origH + dh)),
        });
      }
    },
    [setWindowState],
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    resizeRef.current = null;
  }, []);

  const onResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resizeRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origW: windowState.w,
        origH: windowState.h,
      };
      (e.target as Element).setPointerCapture?.(e.pointerId);
    },
    [windowState.w, windowState.h],
  );

  async function send() {
    if (!input.trim() || streaming || !pinned) return;
    const userMsg: Msg = { role: "user", content: input };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setStreaming(true);
    let assistantText = "";
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/text-studio-chat`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          conversationId: pinned.conversationId,
          messages: next,
          model: pinned.model,
          reasoningEffort: TEXT_MODELS[pinned.model]?.supportsReasoningEffort ? pinned.reasoning : undefined,
          systemPrompt: pinned.systemPrompt,
          personaId: pinned.personaId && pinned.personaId !== "none" ? pinned.personaId : undefined,
          isPrivate: pinned.isPrivate,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        if (resp.status === 402) toast.error(err.error || "Wallet leer – bitte Credits aufladen.");
        else if (resp.status === 429) toast.error("Rate limit – kurz warten und erneut probieren.");
        else toast.error(err.error || "Fehler beim Senden");
        setMessages(next);
        setStreaming(false);
        return;
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, idx).replace(/\r$/, "");
          buffer = buffer.slice(idx + 1);
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload);
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              assistantText += delta;
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: assistantText };
                return copy;
              });
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch (e) {
      toast.error("Verbindungsfehler");
      console.error(e);
    } finally {
      setStreaming(false);
    }
  }

  // Don't render on the studio page itself, or on mobile
  if (!pinned) return null;
  if (isOnStudio) return null;
  if (typeof window !== "undefined" && window.innerWidth < 768) return null;

  const modelLabel = TEXT_MODELS[pinned.model]?.label || pinned.model;

  // Minimized pill
  if (windowState.minimized) {
    return (
      <button
        onClick={() => setWindowState({ minimized: false })}
        className="fixed z-[60] bottom-6 right-6 flex items-center gap-2 rounded-full bg-black/90 backdrop-blur-md border border-[#F5C76A]/40 px-4 py-2.5 text-sm text-[#F5C76A] shadow-2xl shadow-[#F5C76A]/20 hover:border-[#F5C76A] transition-all hover:scale-105"
        aria-label="Angeheftet Chat öffnen"
      >
        <Pin className="h-3.5 w-3.5" />
        <span className="font-medium">{modelLabel}</span>
        <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-[#F5C76A] animate-pulse" />
      </button>
    );
  }

  return (
    <div
      className="fixed z-[60] flex flex-col rounded-xl bg-black/95 backdrop-blur-xl border border-[#F5C76A]/30 shadow-2xl shadow-[#F5C76A]/10 overflow-hidden"
      style={{
        left: windowState.x,
        top: windowState.y,
        width: windowState.w,
        height: windowState.h,
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Header (drag handle) */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b border-white/10 bg-gradient-to-r from-black to-[#0a0a14] cursor-grab active:cursor-grabbing select-none"
        onPointerDown={onDragStart}
      >
        <GripHorizontal className="h-3.5 w-3.5 text-white/40" />
        <Pin className="h-3.5 w-3.5 text-[#F5C76A]" />
        <Badge variant="outline" className="text-[10px] border-[#F5C76A]/40 text-[#F5C76A]">
          {modelLabel}
        </Badge>
        <span className="text-xs text-white/60 truncate flex-1">
          {pinned.title || "Angehefteter Chat"}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-white/60 hover:text-white"
          onClick={() => navigate("/ai-text-studio")}
          title="Im Studio öffnen"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-white/60 hover:text-white"
          onClick={() => setWindowState({ minimized: true })}
          title="Minimieren"
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-white/60 hover:text-white"
          onClick={() => {
            setWindowState({ w: Math.min(MAX_W, 600), h: Math.min(MAX_H, 700) });
          }}
          title="Vergrößern"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 text-white/60 hover:text-red-400"
          onClick={unpin}
          title="Schließen (Chat bleibt erhalten)"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
        {loading ? (
          <div className="flex items-center justify-center h-full text-white/40">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-white/40 text-xs text-center py-8">
            Noch keine Nachrichten. Schreib etwas …
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={`rounded-lg p-2.5 ${
                m.role === "user"
                  ? "bg-[#F5C76A]/10 border border-[#F5C76A]/20 text-white"
                  : "bg-white/5 border border-white/10 text-white/90"
              }`}
            >
              <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1">
                {m.role === "user" ? "Du" : modelLabel}
              </div>
              <div className="prose prose-invert prose-sm max-w-none break-words [&_p]:my-1 [&_pre]:my-1 [&_pre]:text-xs">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
                </ReactMarkdown>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="border-t border-white/10 p-2 flex gap-2 bg-black/60">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Nachricht … (⌘+Enter)"
          className="min-h-[44px] max-h-[120px] resize-none text-sm bg-white/5 border-white/10 text-white placeholder:text-white/30"
          disabled={streaming}
        />
        <Button
          onClick={() => void send()}
          disabled={streaming || !input.trim()}
          size="icon"
          className="h-11 w-11 bg-[#F5C76A] hover:bg-[#F5C76A]/90 text-black shrink-0"
        >
          {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>

      {/* Resize handle */}
      <div
        onPointerDown={onResizeStart}
        className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
        style={{
          background:
            "linear-gradient(135deg, transparent 50%, rgba(245,199,106,0.5) 50%, rgba(245,199,106,0.5) 100%)",
        }}
        title="Größe ändern"
      />
    </div>
  );
}
