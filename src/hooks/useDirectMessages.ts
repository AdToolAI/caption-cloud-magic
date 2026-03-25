import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface DirectMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  read_at: string | null;
  created_at: string;
  sender_profile?: { email: string } | null;
  receiver_profile?: { email: string } | null;
}

export interface Conversation {
  partner_id: string;
  partner_email: string;
  last_message: string;
  last_message_at: string;
  unread_count: number;
}

export function useDirectMessages(partnerId: string | null) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchConversations = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("direct_messages")
      .select("*, sender_profile:sender_id(email), receiver_profile:receiver_id(email)")
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching conversations:", error);
      setLoading(false);
      return;
    }

    // Group by conversation partner
    const convMap = new Map<string, Conversation>();
    for (const msg of (data || []) as any[]) {
      const partnerId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
      const partnerEmail =
        msg.sender_id === user.id
          ? msg.receiver_profile?.email || "Unbekannt"
          : msg.sender_profile?.email || "Unbekannt";

      if (!convMap.has(partnerId)) {
        convMap.set(partnerId, {
          partner_id: partnerId,
          partner_email: partnerEmail,
          last_message: msg.content,
          last_message_at: msg.created_at,
          unread_count: 0,
        });
      }

      if (msg.receiver_id === user.id && !msg.read_at) {
        const conv = convMap.get(partnerId)!;
        conv.unread_count += 1;
      }
    }

    setConversations(Array.from(convMap.values()));
    setLoading(false);
  }, [user]);

  const fetchMessages = useCallback(async () => {
    if (!user || !partnerId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("direct_messages")
      .select("*, sender_profile:sender_id(email), receiver_profile:receiver_id(email)")
      .or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${user.id})`
      )
      .order("created_at", { ascending: true });

    if (error) console.error(error);
    else setMessages((data as any[]) || []);
    setLoading(false);

    // Mark as read
    await supabase
      .from("direct_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("sender_id", partnerId)
      .eq("receiver_id", user.id)
      .is("read_at", null);
  }, [user, partnerId]);

  useEffect(() => {
    if (partnerId) fetchMessages();
    else fetchConversations();
  }, [partnerId, fetchMessages, fetchConversations]);

  // Realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("dm-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "direct_messages" }, () => {
        if (partnerId) fetchMessages();
        else fetchConversations();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, partnerId, fetchMessages, fetchConversations]);

  const sendMessage = async (receiverId: string, content: string) => {
    if (!user || !content.trim()) return;
    const { error } = await supabase.from("direct_messages").insert({
      sender_id: user.id,
      receiver_id: receiverId,
      content: content.trim(),
    });
    if (error) console.error(error);
  };

  return { messages, conversations, loading, sendMessage, refetch: partnerId ? fetchMessages : fetchConversations };
}
