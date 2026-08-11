import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * v418 — client mirror of the server rollout brake for Seedance 2.5 as a
 * lip-sync master-plate provider (`composer.feature.seedance25_lipsync` in
 * `system_config`). The server enforces the same flag at dispatch time; this
 * hook only decides whether the model is offered in the picker.
 *
 * Accepted shapes: `true` / `"true"` / `{ enabled: true }` /
 * `{ user_ids: [...] }`. Anything unreadable or missing means OFF.
 */
const CFG_KEY = "composer.feature.seedance25_lipsync";

function resolveFlag(raw: unknown, userId: string | null): boolean {
  if (raw === null || raw === undefined) return false;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") return raw.toLowerCase() === "true";
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (obj.enabled === true) return true;
    const ids = Array.isArray(obj.user_ids) ? obj.user_ids.map(String) : [];
    return !!userId && ids.includes(userId);
  }
  return false;
}

export function useSeedance25Lipsync(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [{ data: auth }, { data }] = await Promise.all([
          supabase.auth.getUser(),
          supabase.from("system_config").select("value").eq("key", CFG_KEY).maybeSingle(),
        ]);
        if (!active) return;
        setEnabled(resolveFlag((data as any)?.value ?? null, auth?.user?.id ?? null));
      } catch {
        if (active) setEnabled(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return enabled;
}

export { resolveFlag as __resolveSeedance25LipsyncFlag };
