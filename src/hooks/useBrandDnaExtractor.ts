import { useMutation } from "@tanstack/react-query";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { tx } from "@/lib/i18nText";

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
  /** The exact URL that was analyzed (website source only). */
  source_url?: string;
  confidence?: number;
}

export type BrandDnaFetchFailureReason =
  | "timeout"
  | "blocked_host"
  | "http_error"
  | "http_403"
  | "invalid_content_type"
  | "too_large"
  | "too_many_redirects"
  | "invalid_url"
  | "empty_content";

function fetchFailureMessage(reason: string): string {
  switch (reason) {
    case "timeout":
      return tx({
        de: "Die Website hat zu lange gebraucht (Timeout). Bitte versuche es erneut.",
        en: "The website took too long to respond (timeout). Please try again.",
        es: "El sitio web tardó demasiado en responder (tiempo de espera agotado). Inténtalo de nuevo.",
      });
    case "blocked_host":
      return tx({
        de: "Diese URL ist aus Sicherheitsgründen nicht erlaubt.",
        en: "This URL is not allowed for security reasons.",
        es: "Esta URL no está permitida por motivos de seguridad.",
      });
    case "http_403":
      return tx({
        de: "Die Website hat den Zugriff verweigert (403).",
        en: "The website denied access (403).",
        es: "El sitio web denegó el acceso (403).",
      });
    case "http_error":
      return tx({
        de: "Die Website konnte nicht abgerufen werden.",
        en: "The website could not be reached.",
        es: "No se pudo acceder al sitio web.",
      });
    case "invalid_content_type":
      return tx({
        de: "Die URL liefert keinen HTML-Inhalt.",
        en: "The URL did not return HTML content.",
        es: "La URL no devolvió contenido HTML.",
      });
    case "too_large":
      return tx({
        de: "Die Seite ist zu groß, um analysiert zu werden.",
        en: "The page is too large to analyze.",
        es: "La página es demasiado grande para analizarla.",
      });
    case "too_many_redirects":
      return tx({
        de: "Zu viele Weiterleitungen bei dieser URL.",
        en: "Too many redirects for this URL.",
        es: "Demasiadas redirecciones para esta URL.",
      });
    case "invalid_url":
      return tx({
        de: "Diese URL ist ungültig.",
        en: "This URL is invalid.",
        es: "Esta URL no es válida.",
      });
    case "empty_content":
      return tx({
        de: "Von dieser Seite konnte kein Text extrahiert werden.",
        en: "No text could be extracted from this page.",
        es: "No se pudo extraer texto de esta página.",
      });
    default:
      return tx({
        de: "Die Website konnte nicht analysiert werden.",
        en: "The website could not be analyzed.",
        es: "No se pudo analizar el sitio web.",
      });
  }
}

export function useBrandDnaExtractor() {
  return useMutation<BrandDnaResult, Error, BrandDnaInput>({
    mutationFn: async (input) => {
      const { data, error } = await supabase.functions.invoke<BrandDnaResult>(
        "extract-brand-dna",
        { body: input },
      );

      if (error) {
        if (error instanceof FunctionsHttpError) {
          try {
            const body = await error.context.json();
            if (body?.error === "fetch_failed") {
              const reason: string = body.reason === "http_error" && error.context.status === 403
                ? "http_403"
                : body.reason;
              throw new Error(fetchFailureMessage(reason));
            }
            if (body?.error) throw new Error(body.error);
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message) throw parseErr;
          }
        }
        throw error;
      }
      if (!data) throw new Error("Empty response");
      return data;
    },
  });
}
