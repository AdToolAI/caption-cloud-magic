import { supabase } from "@/integrations/supabase/client";
import { getRecentConsoleErrors } from "@/hooks/useConsoleErrorBuffer";

export interface BrowserInfo {
  userAgent: string;
  platform: string;
  language: string;
  viewport: { width: number; height: number; dpr: number };
  url: string;
  referrer: string;
  timezone: string;
  user_id?: string | null;
  user_email?: string | null;
  plan_code?: string | null;
  recent_errors: Array<{ ts: string; message: string }>;
  timestamp: string;
}

/** Try to derive the affected module from the current URL path. */
export function detectAffectedModule(pathname?: string): string {
  const path = (pathname ?? (typeof window !== "undefined" ? window.location.pathname : "")) || "";
  const segments = path.split("/").filter(Boolean);
  if (!segments.length) return "dashboard";
  // First segment after the leading slash usually identifies the feature/module
  return segments[0];
}

/** Collect a flat snapshot of the current browser/user context. */
export async function collectBrowserInfo(): Promise<BrowserInfo> {
  const w = typeof window !== "undefined" ? window : ({} as Window);
  const nav = typeof navigator !== "undefined" ? navigator : ({} as Navigator);

  let userId: string | null = null;
  let userEmail: string | null = null;
  let planCode: string | null = null;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id ?? null;
    userEmail = user?.email ?? null;

    if (userId) {
      const { data: wallet } = await supabase
        .from("wallets")
        .select("plan_code")
        .eq("user_id", userId)
        .maybeSingle();
      planCode = wallet?.plan_code ?? null;
    }
  } catch {
    /* ignore — context collection is best-effort */
  }

  return {
    userAgent: nav.userAgent ?? "",
    platform: (nav as Navigator & { platform?: string }).platform ?? "",
    language: nav.language ?? "",
    viewport: {
      width: w.innerWidth ?? 0,
      height: w.innerHeight ?? 0,
      dpr: w.devicePixelRatio ?? 1,
    },
    url: w.location?.href ?? "",
    referrer: typeof document !== "undefined" ? document.referrer : "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    user_id: userId,
    user_email: userEmail,
    plan_code: planCode,
    recent_errors: getRecentConsoleErrors(),
    timestamp: new Date().toISOString(),
  };
}
