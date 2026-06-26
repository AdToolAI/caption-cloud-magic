import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BrandDnaInput {
  websiteUrl?: string;
  screenshotUrl?: string;
  logoUrl?: string;
  language?: "de" | "en" | "es";
}

export interface BrandDnaResult {
  brand_name?: string;
  brand_description?: string;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  palette?: string[];
  fonts?: { headline?: string; body?: string };
  tone?: string;
  mood?: string;
  keywords?: string[];
  values?: string[];
  emoji_suggestions?: string[];
  ai_comment?: string;
  source: "website" | "screenshot" | "logo";
  confidence: number;
}

export function useBrandDnaExtractor() {
  return useMutation<BrandDnaResult, Error, BrandDnaInput>({
    mutationFn: async (input) => {
      const { data, error } = await supabase.functions.invoke<BrandDnaResult>(
        "extract-brand-dna",
        { body: input },
      );
      if (error) throw error;
      if (!data) throw new Error("Empty response");
      return data;
    },
  });
}
