import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { User, Send, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useDirectMessages } from "@/hooks/useDirectMessages";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";

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
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  // Chat view
  if (selectedPartner) {
    return (
      <div className="flex flex-col h-[500px]">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSelectedPartner(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <User className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {conversations.find((c) => c.partner_id === selectedPartner)?.partner_email?.split("@")[0] || "Chat"}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.sender_id === user?.id ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[70%] px-3 py-2 rounded-xl text-sm ${
                  msg.sender_id === user?.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                <p className="text-xs opacity-70 mt-1">
                  {format(new Date(msg.created_at), "HH:mm", { locale: de })}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="p-3 border-t flex gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Nachricht schreiben..."
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          />
          <Button size="icon" onClick={handleSend} disabled={!newMessage.trim()}>
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
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <p className="text-sm">Noch keine Nachrichten.</p>
          <p className="text-xs mt-1">Starte eine Konversation mit einem Creator!</p>
        </div>
      ) : (
        conversations.map((conv) => (
          <button
            key={conv.partner_id}
            onClick={() => setSelectedPartner(conv.partner_id)}
            className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors text-left"
          >
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
              <User className="h-4 w-4 text-muted-foreground" />
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
              <Badge className="text-xs">{conv.unread_count}</Badge>
            )}
          </button>
        ))
      )}
    </div>
  );
}
