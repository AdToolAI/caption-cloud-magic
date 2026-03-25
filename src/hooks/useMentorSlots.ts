import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export interface MentorSlot {
  id: string;
  mentor_user_id: string;
  channel_id: string | null;
  slot_time: string;
  duration_min: number;
  booked_by: string | null;
  status: string;
  created_at: string;
  profiles?: { email: string } | null;
}

export function useMentorSlots(channelId?: string | null) {
  const { user } = useAuth();
  const [slots, setSlots] = useState<MentorSlot[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSlots = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    let query = supabase
      .from("mentor_slots")
      .select("*, profiles:mentor_user_id(email)")
      .order("slot_time", { ascending: true });

    if (channelId) {
      query = query.eq("channel_id", channelId);
    }

    const { data, error } = await query;
    if (error) console.error(error);
    else setSlots((data as any[]) || []);
    setLoading(false);
  }, [user, channelId]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("mentor-slots-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "mentor_slots" }, () => {
        fetchSlots();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchSlots]);

  const bookSlot = async (slotId: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("mentor_slots")
      .update({ booked_by: user.id, status: "booked" })
      .eq("id", slotId)
      .eq("status", "open");

    if (error) {
      toast.error("Slot konnte nicht gebucht werden");
      console.error(error);
      return;
    }

    toast.success("Mentor-Slot gebucht!");

    // Audit log
    await supabase.from("community_audit_log").insert({
      user_id: user.id,
      action: "slot_booked",
      entity_type: "mentor_slot",
      entity_id: slotId,
    });

    // Trigger notification
    await supabase.functions.invoke("community-notify", {
      body: { type: "mentor_booked", slot_id: slotId, booked_by: user.id },
    });

    fetchSlots();
  };

  const createSlot = async (slotTime: string, durationMin: number, chId?: string) => {
    if (!user) return;
    const { error } = await supabase.from("mentor_slots").insert({
      mentor_user_id: user.id,
      channel_id: chId || null,
      slot_time: slotTime,
      duration_min: durationMin,
    });

    if (error) {
      toast.error("Slot konnte nicht erstellt werden");
      console.error(error);
      return;
    }

    toast.success("Mentor-Slot erstellt!");
    fetchSlots();
  };

  return { slots, loading, bookSlot, createSlot, refetch: fetchSlots };
}
