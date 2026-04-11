import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { User, Send, ArrowLeft, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useDirectMessages } from "@/hooks/useDirectMessages";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";

export function DirectMessages() {
  const { user } = useAuth();
  const [selectedPartner, setSelectedPartner] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const { messages, conversations, loading, sendMessage } = useDirectMessages(selectedPartner);

  const handleSend = () => {
    if (!selectedPartner || !newMessage.trim()) return;
    sendMessage(selectedPartner, newMessage);
    setNewMessage("");
  };

  if (loading && !selectedPartner && conversations.length === 0) {
    return (
      <div className="space-y-3 p-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  // Chat view
  if (selectedPartner) {
    return (
      <div className="flex flex-col h-[500px]">
        <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2 bg-card/40 backdrop-blur-md">
          <Button variant="ghost" size="sm" onClick={() => setSelectedPartner(null)} className="hover:bg-white/5">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[hsla(43,90%,68%,0.3)] to-[hsla(187,84%,55%,0.2)] flex items-center justify-center">
            <User className="h-3.5 w-3.5 text-[hsl(43,90%,68%)]" />
          </div>
          <span className="text-sm font-medium">
            {conversations.find((c) => c.partner_id === selectedPartner)?.partner_email?.split("@")[0] || "Chat"}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <AnimatePresence>
            {messages.map((msg, idx) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: idx * 0.03 }}
                className={`flex ${msg.sender_id === user?.id ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[70%] px-3 py-2 rounded-xl text-sm transition-all ${
                    msg.sender_id === user?.id
                      ? "bg-gradient-to-br from-[hsla(43,90%,68%,0.25)] to-[hsla(187,84%,55%,0.15)] border border-[hsla(43,90%,68%,0.2)] text-foreground shadow-[0_0_20px_hsla(43,90%,68%,0.08)]"
                      : "bg-card/60 backdrop-blur-md border border-white/10"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  <p className="text-xs opacity-50 mt-1">
                    {format(new Date(msg.created_at), "HH:mm", { locale: de })}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        <div className="p-3 border-t border-white/10 flex gap-2 bg-card/40 backdrop-blur-md">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Nachricht schreiben..."
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            className="bg-card/60 backdrop-blur-md border-white/10 focus:border-[hsla(43,90%,68%,0.3)]"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!newMessage.trim()}
            className="shadow-[0_0_15px_hsla(43,90%,68%,0.1)]"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // Conversation list
  return (
    <div className="space-y-1 p-2">
      {conversations.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-16 text-muted-foreground"
        >
          <motion.div
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <MessageSquare className="h-8 w-8 mb-2 opacity-40 text-[hsl(43,90%,68%)]" />
          </motion.div>
          <p className="text-sm">Noch keine Konversationen.</p>
          <p className="text-xs mt-1 opacity-60">Starte einen Chat mit einem Creator!</p>
        </motion.div>
      ) : (
        conversations.map((conv, idx) => (
          <motion.button
            key={conv.partner_id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.05 }}
            onClick={() => setSelectedPartner(conv.partner_id)}
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 backdrop-blur-sm transition-all duration-200 text-left border border-transparent hover:border-white/10 hover:shadow-[0_0_20px_hsla(43,90%,68%,0.05)]"
          >
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[hsla(43,90%,68%,0.2)] to-[hsla(187,84%,55%,0.15)] flex items-center justify-center shrink-0">
              <User className="h-4 w-4 text-[hsl(43,90%,68%)]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium truncate">
                  {conv.partner_email.split("@")[0]}
                </span>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(conv.last_message_at), "dd. MMM", { locale: de })}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">{conv.last_message}</p>
            </div>
            {conv.unread_count > 0 && (
              <Badge className="text-xs shadow-[0_0_10px_hsla(43,90%,68%,0.2)]">{conv.unread_count}</Badge>
            )}
          </motion.button>
        ))
      )}
    </div>
  );
}
