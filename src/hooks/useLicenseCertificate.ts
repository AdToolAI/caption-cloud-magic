import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface IssueCertificateInput {
  asset_type: string;
  asset_id: string;
  asset_title: string;
  asset_thumbnail_url?: string | null;
  asset_source_url?: string | null;
  source_provider: string;
  license_tier?: "personal" | "commercial" | "pro";
  metadata?: Record<string, unknown>;
}

export interface IssuedCertificate {
  certificate_id: string;
  certificate_number: string;
  pdf_url: string;
  verify_url: string;
  verify_token: string;
}

export function useLicenseCertificate() {
  const [issuing, setIssuing] = useState(false);

  const issue = useCallback(async (input: IssueCertificateInput): Promise<IssuedCertificate | null> => {
    setIssuing(true);
    try {
      const { data, error } = await supabase.functions.invoke("issue-license-certificate", {
        body: input,
      });
      if (error) throw error;
      return data as IssuedCertificate;
    } catch (err) {
      console.error("[useLicenseCertificate]", err);
      toast({
        title: "License generation failed",
        description: (err as Error).message,
        variant: "destructive",
      });
      return null;
    } finally {
      setIssuing(false);
    }
  }, []);

  const issueAndDownload = useCallback(
    async (input: IssueCertificateInput) => {
      const result = await issue(input);
      if (result?.pdf_url) {
        window.open(result.pdf_url, "_blank");
        toast({
          title: "License certificate ready",
          description: `#${result.certificate_number}`,
        });
      }
      return result;
    },
    [issue],
  );

  return { issue, issueAndDownload, issuing };
}
