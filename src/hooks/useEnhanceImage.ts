import { tx } from "@/lib/i18nText";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface EnhanceParams {
  modelId: string;
  imageUrl: string;
  imageId?: string;
  scale?: number;
  values?: Record<string, unknown>;
  inputWidth?: number;
  inputHeight?: number;
  /** Suppress the success toast (used by the compare run). */
  quiet?: boolean;
}

export interface EnhanceResult {
  id?: string;
  url: string;
  previewUrl: string;
  modelId: string;
  scale: number | null;
  parentId: string | null;
  enhanceModel?: string | null;
  cost?: number;
  currency?: string;
  durationMs?: number;
}

/**
 * Runs any Picture Studio enhance model (Clarity, Topaz …) through the
 * `enhance-image` edge function. Credits are only charged after a persisted
 * result — a provider failure never costs the customer anything.
 */
export function useEnhanceImage() {
  const [runningModelId, setRunningModelId] = useState<string | null>(null);
  const navigate = useNavigate();

  const enhance = async (params: EnhanceParams): Promise<EnhanceResult | null> => {
    const { quiet, ...payload } = params;
    setRunningModelId(params.modelId);
    const startedAt = Date.now();
    try {
      const { data, error } = await supabase.functions.invoke("enhance-image", { body: payload });

      if (error) {
        const fnError = error as { context?: { json?: () => Promise<any> }; message?: string };
        if (fnError.context && typeof fnError.context.json === "function") {
          const body = await fnError.context.json();
          if (body?.code === "INSUFFICIENT_CREDITS" || body?.code === "NO_WALLET") {
            toast.error(body.error);
            navigate("/ai-video-purchase-credits");
            return null;
          }
          throw new Error(body?.error || fnError.message);
        }
        throw error;
      }

      if (data?.error) throw new Error(data.error);
      if (!data?.image) return null;

      if (!quiet) {
        const sym = data.currency === "USD" ? "$" : "€";
        toast.success(
          tx({
            de: `Fertig! Verbleibend: ${sym}${(data.newBalance ?? 0).toFixed(2)}`,
            en: `Done! Remaining: ${sym}${(data.newBalance ?? 0).toFixed(2)}`,
            es: `¡Listo! Restante: ${sym}${(data.newBalance ?? 0).toFixed(2)}`,
          }),
        );
      }

      return {
        ...(data.image as EnhanceResult),
        cost: data.cost,
        currency: data.currency,
        durationMs: Date.now() - startedAt,
      };
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : tx({ de: "Verbesserung fehlgeschlagen", en: "Enhance failed", es: "La mejora falló" });
      console.error("[useEnhanceImage] error:", err);
      toast.error(message);
      return null;
    } finally {
      setRunningModelId(null);
    }
  };

  return { enhance, runningModelId, isEnhancing: runningModelId !== null };
}
