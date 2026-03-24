import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface AnalysisResult {
  strengths: string[];
  weaknesses: string[];
  tips: string[];
  strategy: string;
}

export function usePerformanceAnalysis() {
  const { user } = useAuth();
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "analyze-performance-strategy",
        { body: {} }
      );
      if (fnError) throw fnError;
      setAnalysis(data?.analysis || null);
      return data?.analysis;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { analysis, loading, error, analyze };
}
