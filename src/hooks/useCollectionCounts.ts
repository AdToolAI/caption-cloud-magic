import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  MEDIA_COLLECTIONS,
  emptyCounts,
  type CollectionCounts,
} from "@/config/mediaCollections";

/**
 * Auto Collection counts, computed on the server.
 *
 * We never download the image rows just to count them: each collection asks
 * for an exact head count, scoped to the signed-in user by RLS plus an explicit
 * user_id filter.
 */
export function useCollectionCounts() {
  const { user } = useAuth();
  const [counts, setCounts] = useState<CollectionCounts>(emptyCounts);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setCounts(emptyCounts());
      return;
    }
    setLoading(true);
    try {
      const results = await Promise.all(
        MEDIA_COLLECTIONS.map(async (collection) => {
          const { count } = await supabase
            .from("studio_images")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("workflow_type", collection.workflowType);
          return [collection.workflowType, count ?? 0] as const;
        }),
      );
      const next = emptyCounts();
      for (const [workflow, count] of results) next[workflow] = count;
      setCounts(next);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return { counts, total, loading, refresh };
}
