import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";

export interface FirstVideoPrompt {
  prompt: string;
  prompt_en: string;
  style_hint: string;
}

const FALLBACK: Record<string, FirstVideoPrompt[]> = {
  de: [
    { prompt: "Cinematische Drohnenaufnahme über einer modernen Skyline bei Sonnenuntergang", prompt_en: "Cinematic drone shot over a modern skyline at sunset", style_hint: "cinematic" },
    { prompt: "Eleganter Produkt-Shot eines Parfüm-Flakons mit weichem Goldlicht", prompt_en: "Elegant product shot of a perfume bottle with soft gold light", style_hint: "product" },
    { prompt: "Eine entspannte Person auf einer Couch, die in die Kamera lächelt", prompt_en: "A relaxed person on a couch smiling at the camera", style_hint: "lifestyle" },
  ],
  en: [
    { prompt: "Cinematic drone shot over a modern skyline at sunset", prompt_en: "Cinematic drone shot over a modern skyline at sunset", style_hint: "cinematic" },
    { prompt: "Elegant product shot of a perfume bottle with soft gold light", prompt_en: "Elegant product shot of a perfume bottle with soft gold light", style_hint: "product" },
    { prompt: "A relaxed person on a couch smiling at the camera", prompt_en: "A relaxed person on a couch smiling at the camera", style_hint: "lifestyle" },
  ],
  es: [
    { prompt: "Toma cinematográfica con dron sobre una ciudad moderna al atardecer", prompt_en: "Cinematic drone shot over a modern skyline at sunset", style_hint: "cinematic" },
    { prompt: "Toma elegante de un frasco de perfume con luz dorada suave", prompt_en: "Elegant product shot of a perfume bottle with soft gold light", style_hint: "product" },
    { prompt: "Persona relajada en un sofá sonriendo a la cámara", prompt_en: "A relaxed person on a couch smiling at the camera", style_hint: "lifestyle" },
  ],
};

/**
 * Loads the user's personalized first-video prompts.
 * Fallback chain:
 *   1. onboarding_profiles.first_video_prompts (DB cache)
 *   2. lazy-trigger generate-first-video-prompts edge function (backfill)
 *   3. localized static defaults
 */
export function useFirstVideoPrompts() {
  const { user } = useAuth();
  const { language } = useTranslation();
  const lang = (["de", "en", "es"].includes(language) ? language : "en") as "de" | "en" | "es";

  const [prompts, setPrompts] = useState<FirstVideoPrompt[]>(FALLBACK[lang]);
  const [loading, setLoading] = useState(true);
  const [personalized, setPersonalized] = useState(false);

  useEffect(() => {
    if (!user) {
      setPrompts(FALLBACK[lang]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      // Step 1: try to load cached prompts
      const { data: profile } = await supabase
        .from("onboarding_profiles")
        .select("first_video_prompts, niche")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      const cached = (profile as any)?.first_video_prompts;
      if (Array.isArray(cached) && cached.length === 3) {
        setPrompts(cached as FirstVideoPrompt[]);
        setPersonalized(true);
        setLoading(false);
        return;
      }

      // Step 2: backfill — only if user has an onboarding profile
      if (profile?.niche) {
        // Show defaults while we generate
        setPrompts(FALLBACK[lang]);
        setLoading(false);

        try {
          const { data, error } = await supabase.functions.invoke("generate-first-video-prompts", {
            body: { language: lang },
          });
          if (cancelled) return;
          if (!error && Array.isArray(data?.prompts) && data.prompts.length === 3 && !data?.fallback) {
            setPrompts(data.prompts as FirstVideoPrompt[]);
            setPersonalized(true);
          }
        } catch (e) {
          console.warn("[useFirstVideoPrompts] backfill failed:", e);
        }
        return;
      }

      // Step 3: no onboarding → static fallback
      setPrompts(FALLBACK[lang]);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [user?.id, lang]);

  return { prompts, loading, personalized };
}
