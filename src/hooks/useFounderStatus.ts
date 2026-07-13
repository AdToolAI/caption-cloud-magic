import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface FounderStatus {
  isActive: boolean;
  claimedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  loading: boolean;
}

const initial: FounderStatus = {
  isActive: false,
  claimedAt: null,
  expiresAt: null,
  revokedAt: null,
  revokedReason: null,
  loading: true,
};

export function useFounderStatus(): FounderStatus {
  const { user } = useAuth();
  const [status, setStatus] = useState<FounderStatus>(initial);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setStatus({ ...initial, loading: false });
      return;
    }
    (async () => {
      const { data, error } = await supabase.rpc("founder_status_details", { _user_id: user.id });
      if (cancelled) return;
      if (error || !data || !Array.isArray(data) || data.length === 0) {
        setStatus({ ...initial, loading: false });
        return;
      }
      const row = data[0] as any;
      setStatus({
        isActive: !!row.is_active,
        claimedAt: row.claimed_at,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at,
        revokedReason: row.revoked_reason,
        loading: false,
      });
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  return status;
}
