import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface EmailHealthSummary {
  byTemplate: Array<{ template: string; sends: number; lastSent: string | null }>;
  topRecipients: Array<{ email: string; sends: number }>;
  trialFunnel: Array<{ stage: string; users: number }>;
  marketingPaused: boolean;
}

export function useEmailHealth() {
  return useQuery({
    queryKey: ["email-health"],
    refetchInterval: 60_000,
    queryFn: async (): Promise<EmailHealthSummary> => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

      // Per-template (deduped by message_id)
      const { data: logs } = await supabase
        .from("email_send_log")
        .select("template_name, recipient_email, created_at, message_id, status")
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(5000);

      const seen = new Set<string>();
      const dedup: Array<{ template_name: string; recipient_email: string; created_at: string }> = [];
      for (const r of logs ?? []) {
        const k = r.message_id || `${r.template_name}|${r.recipient_email}|${r.created_at}`;
        if (seen.has(k)) continue;
        seen.add(k);
        if (r.status === "sent" || r.status === "pending") {
          dedup.push(r as any);
        }
      }

      const tplMap = new Map<string, { sends: number; lastSent: string }>();
      const recMap = new Map<string, number>();
      for (const r of dedup) {
        const t = tplMap.get(r.template_name) ?? { sends: 0, lastSent: r.created_at };
        t.sends++;
        if (r.created_at > t.lastSent) t.lastSent = r.created_at;
        tplMap.set(r.template_name, t);
        recMap.set(r.recipient_email, (recMap.get(r.recipient_email) ?? 0) + 1);
      }

      const byTemplate = Array.from(tplMap.entries())
        .map(([template, v]) => ({ template, sends: v.sends, lastSent: v.lastSent }))
        .sort((a, b) => b.sends - a.sends);

      const topRecipients = Array.from(recMap.entries())
        .map(([email, sends]) => ({ email, sends }))
        .sort((a, b) => b.sends - a.sends)
        .slice(0, 10);

      // Trial funnel — bucket users by days since trial_started_at
      const { data: trialUsers } = await supabase
        .from("profiles")
        .select("trial_status, trial_ends_at, created_at")
        .in("trial_status", ["active", "grace"])
        .limit(2000);

      const buckets: Record<string, number> = {
        "Day 1-3": 0, "Day 4-6": 0, "Day 7-9": 0,
        "Day 10-12": 0, "Day 13 (final)": 0,
        "Grace 14-26": 0, "Grace 27 (pre-pause)": 0,
      };
      const now = Date.now();
      for (const u of trialUsers ?? []) {
        if (!u.trial_ends_at) continue;
        const endsMs = new Date(u.trial_ends_at).getTime();
        const trialDay = 14 - Math.ceil((endsMs - now) / 86_400_000);
        if (u.trial_status === "active") {
          if (trialDay <= 3) buckets["Day 1-3"]++;
          else if (trialDay <= 6) buckets["Day 4-6"]++;
          else if (trialDay <= 9) buckets["Day 7-9"]++;
          else if (trialDay <= 12) buckets["Day 10-12"]++;
          else buckets["Day 13 (final)"]++;
        } else {
          const graceDay = -Math.ceil((endsMs - now) / 86_400_000);
          if (graceDay >= 13) buckets["Grace 27 (pre-pause)"]++;
          else buckets["Grace 14-26"]++;
        }
      }
      const trialFunnel = Object.entries(buckets).map(([stage, users]) => ({ stage, users }));

      // Global pause flag
      const { data: cfg } = await supabase
        .from("system_config")
        .select("value")
        .eq("key", "email.marketing_paused")
        .maybeSingle();
      const marketingPaused =
        (cfg as any)?.value === true || (cfg as any)?.value?.paused === true;

      return { byTemplate, topRecipients, trialFunnel, marketingPaused };
    },
  });
}

export async function setMarketingPaused(paused: boolean) {
  const { error } = await supabase
    .from("system_config")
    .upsert(
      { key: "email.marketing_paused", value: paused as any },
      { onConflict: "key" },
    );
  if (error) throw error;
}
