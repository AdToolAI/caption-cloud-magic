import { supabase } from "@/integrations/supabase/client";

export interface SeriesOptions {
  brief: string;
  platform: string;
  language: string;
  tone: string;
  weeks: number;
  postsPerWeek: number;
}

export interface SeriesResult {
  campaignId: string;
  title: string;
  postsCreated: number;
}

/**
 * Erzeugt aus dem Studio-Briefing eine ganze Serie statt eines Einzelposts.
 * Nutzt dieselbe Kampagnen-Engine wie zuvor der Kampagnen-Assistent.
 */
export async function generateSeries(options: SeriesOptions): Promise<SeriesResult> {
  const { data, error } = await supabase.functions.invoke("generate-campaign", {
    body: {
      goal: options.brief.slice(0, 200),
      topic: options.brief,
      tone: options.tone,
      audience: "",
      durationWeeks: options.weeks,
      platforms: [options.platform],
      postFrequency: options.postsPerWeek,
      language: options.language,
      media: [],
      postTypes: ["image"],
    },
  });

  if (error) throw error;
  if (!data?.success || !data?.campaign) {
    throw new Error(data?.error || "Serie konnte nicht erzeugt werden");
  }

  return {
    campaignId: data.campaign.id as string,
    title: (data.campaign.title as string) ?? "Serie",
    postsCreated: (data.posts_created as number) ?? 0,
  };
}

/** Ermittelt den Workspace des angemeldeten Nutzers (für die Terminübergabe). */
export async function resolveWorkspaceId(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return (data?.workspace_id as string) ?? null;
}

/** Überträgt eine erzeugte Serie als Termine in den Kalender. */
export async function seriesToCalendar(campaignId: string, workspaceId: string): Promise<number> {
  const { data, error } = await supabase.functions.invoke("campaign-to-calendar", {
    body: {
      campaignId,
      startDate: new Date().toISOString(),
      workspaceId,
    },
  });
  if (error) throw error;
  return (data?.eventsCreated as number) ?? 0;
}
