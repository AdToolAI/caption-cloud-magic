import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import {
  CHANNEL_ORDER,
  type CrossPostChannel,
  type CrossPostTone,
} from "@/config/crossPostRules";

export interface CrossPostDraft {
  channel: CrossPostChannel;
  caption: string;
  hashtags: string[];
  title?: string;
  description?: string;
  tags?: string[];
  hook_score?: number;
  edited_by_user?: boolean;
}

interface GenerateArgs {
  videoId?: string;
  videoUrl?: string;
  channels: CrossPostChannel[];
  briefingPlan?: unknown;
  briefingText?: string;
  tone?: CrossPostTone;
  language?: string;
}

export function useCrossPostMagic(initialVideoId?: string) {
  const [drafts, setDrafts] = useState<Record<CrossPostChannel, CrossPostDraft | undefined>>({
    instagram: undefined,
    tiktok: undefined,
    linkedin: undefined,
    youtube: undefined,
  });
  const [loading, setLoading] = useState(false);
  const [tone, setTone] = useState<CrossPostTone>("default");
  const { toast } = useToast();
  const { language } = useTranslation();

  // Hydrate existing drafts from DB when videoId known.
  useEffect(() => {
    if (!initialVideoId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("cross_post_drafts")
        .select("*")
        .eq("video_id", initialVideoId);
      if (cancelled || !data?.length) return;
      const next: typeof drafts = { instagram: undefined, tiktok: undefined, linkedin: undefined, youtube: undefined };
      for (const row of data) {
        const ch = row.channel as CrossPostChannel;
        if (!CHANNEL_ORDER.includes(ch)) continue;
        next[ch] = {
          channel: ch,
          caption: row.caption ?? "",
          hashtags: row.hashtags ?? [],
          title: row.title ?? undefined,
          description: row.description ?? undefined,
          tags: row.tags ?? undefined,
          hook_score: row.hook_score ?? undefined,
          edited_by_user: row.edited_by_user ?? false,
        };
      }
      setDrafts(next);
      if (data[0]?.tone) setTone(data[0].tone as CrossPostTone);
    })();
    return () => { cancelled = true; };
  }, [initialVideoId]);

  const generate = useCallback(
    async (args: GenerateArgs) => {
      setLoading(true);
      try {
        const { data, error } = await supabase.functions.invoke(
          "generate-cross-post-captions",
          {
            body: {
              ...args,
              tone: args.tone ?? tone,
              language: args.language ?? language ?? "en",
            },
          },
        );
        if (error) throw error;
        const incoming: CrossPostDraft[] = data?.drafts ?? [];
        const next = { ...drafts };
        for (const d of incoming) {
          next[d.channel] = { ...d, edited_by_user: false };
        }
        setDrafts(next);
        toast({
          title: "✨ Cross-Post Magic",
          description: `${incoming.length} captions generated.`,
        });
        return next;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        toast({
          title: "Magic failed",
          description: msg,
          variant: "destructive",
        });
        return null;
      } finally {
        setLoading(false);
      }
    },
    [drafts, tone, language, toast],
  );

  const updateDraft = useCallback(
    async (channel: CrossPostChannel, patch: Partial<CrossPostDraft>, videoId?: string) => {
      setDrafts((prev) => {
        const current = prev[channel];
        if (!current) return prev;
        return { ...prev, [channel]: { ...current, ...patch, edited_by_user: true } };
      });
      if (videoId) {
        await supabase
          .from("cross_post_drafts")
          .update({
            caption: patch.caption,
            hashtags: patch.hashtags,
            title: patch.title,
            description: patch.description,
            tags: patch.tags,
            edited_by_user: true,
          })
          .eq("video_id", videoId)
          .eq("channel", channel);
      }
    },
    [],
  );

  return { drafts, loading, tone, setTone, generate, updateDraft };
}
