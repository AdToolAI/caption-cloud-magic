/**
 * extractSubtitleKeywords — client helper for the Hormozi caption flow.
 * Calls the `extract-subtitle-keywords` Edge Function and returns a map
 * of subtitle.id → keywords[]. Safe to call from the Director's Cut UI
 * right before render or whenever Hormozi mode is enabled.
 */
import { supabase } from '@/integrations/supabase/client';

export interface SubtitleKeywordInput {
  id: string;
  text: string;
}

export interface SubtitleKeywordResult {
  id: string;
  keywords: string[];
}

export async function extractSubtitleKeywords(
  subtitles: SubtitleKeywordInput[],
  language: string = 'de',
): Promise<Record<string, string[]>> {
  if (!subtitles.length) return {};

  const { data, error } = await supabase.functions.invoke('extract-subtitle-keywords', {
    body: { subtitles, language },
  });

  if (error) {
    console.warn('[extractSubtitleKeywords] failed', error);
    return Object.fromEntries(subtitles.map((s) => [s.id, []]));
  }

  const results: SubtitleKeywordResult[] = (data?.results as SubtitleKeywordResult[]) ?? [];
  return Object.fromEntries(results.map((r) => [r.id, r.keywords ?? []]));
}
