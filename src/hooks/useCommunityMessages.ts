import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface CommunityMessage {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  tags: string[];
  is_spotlight: boolean;
  moderation_status: string;
  created_at: string;
  profiles?: { email: string } | null;
}

export function useCommunityMessages(channelId: string | null) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMessages = useCallback(async () => {
    if (!channelId || !user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("community_messages")
      .select("*, profiles:user_id(email)")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) {
      console.error("Error fetching messages:", error);
    } else {
      setMessages((data as any[]) || []);
    }
    setLoading(false);
  }, [channelId, user]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Realtime subscription
  useEffect(() => {
    if (!channelId) return;

    const channel = supabase
      .channel(`community-messages-${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "community_messages",
          filter: `channel_id=eq.${channelId}`,
        },
        async (payload) => {
          const newMsg = payload.new as CommunityMessage;
          // Fetch profile for new message
          const { data: profile } = await supabase
            .from("profiles")
            .select("email")
            .eq("id", newMsg.user_id)
            .maybeSingle();
          setMessages((prev) => [...prev, { ...newMsg, profiles: profile }]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelId]);

  const sendMessage = async (content: string, tags: string[]) => {
    if (!channelId || !user) return;

    const { error } = await supabase.from("community_messages").insert({
      channel_id: channelId,
      user_id: user.id,
      content,
      tags,
    });

    if (error) {
      toast.error("Nachricht konnte nicht gesendet werden");
      console.error(error);
    }

    // Log to audit
    await supabase.from("community_audit_log").insert({
      user_id: user.id,
      action: "message_sent",
      entity_type: "message",
      entity_id: null,
      metadata: { channel_id: channelId },
    });
  };

  return { messages, loading, sendMessage, refetch: fetchMessages };
}
