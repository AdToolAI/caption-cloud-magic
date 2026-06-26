import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type VoiceSampleKind = "do" | "dont" | "tagline" | "banned";

export interface BrandVoiceSample {
  id: string;
  brand_kit_id: string;
  user_id: string;
  kind: VoiceSampleKind;
  text: string;
  created_at: string;
}

export function useBrandVoiceSamples(brandKitId: string | null | undefined) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const list = useQuery({
    queryKey: ["brand-voice-samples", brandKitId],
    enabled: !!brandKitId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_voice_samples")
        .select("*")
        .eq("brand_kit_id", brandKitId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        id: r.id,
        brand_kit_id: r.brand_kit_id,
        user_id: r.user_id,
        kind: (r.kind ?? "do") as VoiceSampleKind,
        text: r.text ?? r.sample_text ?? "",
        created_at: r.created_at,
      })) as BrandVoiceSample[];
    },
  });

  const add = useMutation({
    mutationFn: async (input: { kind: VoiceSampleKind; text: string }) => {
      if (!brandKitId) throw new Error("no_brand_kit");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("unauthorized");
      const text = input.text.trim();
      const { error } = await supabase.from("brand_voice_samples").insert({
        brand_kit_id: brandKitId,
        user_id: user.id,
        kind: input.kind,
        text,
        sample_text: text, // legacy mirror
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brand-voice-samples", brandKitId] });
    },
    onError: (e: any) => toast({ title: "Konnte nicht speichern", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("brand_voice_samples").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brand-voice-samples", brandKitId] });
    },
  });

  return { samples: list.data ?? [], loading: list.isLoading, add, remove };
}

/** Build a Brand-Voice prompt block for injection in AI generators. */
export function buildBrandVoicePrompt(samples: BrandVoiceSample[]): string {
  if (!samples.length) return "";
  const dos = samples.filter((s) => s.kind === "do").map((s) => `- ${s.text}`);
  const donts = samples.filter((s) => s.kind === "dont").map((s) => `- ${s.text}`);
  const taglines = samples.filter((s) => s.kind === "tagline").map((s) => `- ${s.text}`);
  const banned = samples.filter((s) => s.kind === "banned").map((s) => s.text);

  const parts: string[] = ["BRAND VOICE GUIDELINES (must follow):"];
  if (dos.length) parts.push("DO:\n" + dos.join("\n"));
  if (donts.length) parts.push("DON'T:\n" + donts.join("\n"));
  if (taglines.length) parts.push("TAGLINE EXAMPLES:\n" + taglines.join("\n"));
  if (banned.length) parts.push(`BANNED WORDS (never use): ${banned.join(", ")}`);
  return parts.join("\n\n");
}
