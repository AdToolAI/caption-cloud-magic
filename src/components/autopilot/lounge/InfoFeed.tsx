/**
 * Info-Feed der Warte-Lounge — tagesaktuelle, auf die Brand gerankte Signale.
 * Quelle: Edge Function `autopilot-lounge-feed` (24 h Cache pro Brand-Kit).
 */

import { useQuery } from '@tanstack/react-query';
import { ExternalLink, RefreshCw, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StageProgressBar } from '@/components/autopilot/StageProgressBar';

export interface LoungeFeedItem {
  headline: string;
  insight?: string;
  action?: string;
  relevance?: string;
  source?: string;
  source_url?: string;
  category?: string;
}

interface Props {
  brandKitId?: string | null;
  language?: string;
}

export function InfoFeed({ brandKitId, language = 'de' }: Props) {
  const query = useQuery({
    queryKey: ['autopilot-lounge-feed', brandKitId ?? 'none', language],
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('autopilot-lounge-feed', {
        body: { brandKitId, language },
      });
      if (error) throw error;
      return (data?.items ?? []) as LoungeFeedItem[];
    },
  });

  const refresh = async () => {
    await supabase.functions.invoke('autopilot-lounge-feed', {
      body: { brandKitId, language, refresh: true },
    });
    await query.refetch();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Tagesaktuell, gefiltert auf deine Marke.
        </p>
        <Button size="sm" variant="outline" onClick={refresh} disabled={query.isFetching}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${query.isFetching ? 'animate-spin' : ''}`} />
          Aktualisieren
        </Button>
      </div>

      {query.isLoading ? (
        <StageProgressBar label="Signale werden zusammengestellt" />
      ) : query.isError ? (
        <p className="text-sm text-muted-foreground">
          Der Feed ist gerade nicht erreichbar. Später erneut versuchen.
        </p>
      ) : (query.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Noch keine Signale für deine Marke. Aktualisieren anstoßen.
        </p>
      ) : (
        <div className="space-y-2">
          {(query.data ?? []).map((item, i) => (
            <article
              key={`${item.headline}-${i}`}
              className="rounded-xl border border-primary/15 bg-black/30 p-3 backdrop-blur"
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-medium leading-tight">{item.headline}</h4>
                {item.category && (
                  <Badge variant="outline" className="shrink-0 text-[10px] capitalize">
                    {item.category}
                  </Badge>
                )}
              </div>
              {item.insight && (
                <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{item.insight}</p>
              )}
              {item.relevance && (
                <p className="mt-1.5 flex items-start gap-1.5 text-xs text-primary/90">
                  <Sparkles className="mt-0.5 h-3 w-3 shrink-0" />
                  {item.relevance}
                </p>
              )}
              {item.action && <p className="mt-1 text-xs text-foreground/80">→ {item.action}</p>}
              {item.source_url && (
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  {item.source ?? 'Quelle'}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
