// Compare Lab — Standalone Page
//
// Hosts the full CompareLabGrid + a sidebar of recent runs.

import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Beaker, History, Sparkles, Trophy } from 'lucide-react';
import CompareLabGrid from '@/components/compare-lab/CompareLabGrid';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface RunHistoryItem {
  id: string;
  prompt: string;
  engines: string[];
  status: string;
  ai_judge_winner_engine: string | null;
  user_winner_engine: string | null;
  total_cost_euros: number;
  currency: string;
  created_at: string;
}

export default function CompareLab() {
  const { user } = useAuth();
  const [history, setHistory] = useState<RunHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('compare_lab_runs')
        .select('id, prompt, engines, status, ai_judge_winner_engine, user_winner_engine, total_cost_euros, currency, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (data) setHistory(data as RunHistoryItem[]);
      setHistoryLoading(false);
    })();
  }, [user]);

  return (
    <>
      <Helmet>
        <title>Compare Lab — Multi-Engine AI Video Showdown</title>
        <meta
          name="description"
          content="Vergleiche dieselbe Idee parallel auf bis zu 6 KI-Video-Engines. AI-Judge wählt den Sieger."
        />
        <link rel="canonical" href="/compare-lab" />
      </Helmet>

      <div className="container mx-auto px-4 py-6 max-w-7xl space-y-6">
        {/* Hero */}
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 flex items-center justify-center">
            <Beaker className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Compare Lab</h1>
            <p className="text-sm text-muted-foreground">
              Ein Prompt — bis zu 6 Engines parallel. AI-Judge wählt den Sieger.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
          {/* Main Grid */}
          <div>
            <CompareLabGrid />
          </div>

          {/* History Sidebar */}
          <aside className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <History className="h-4 w-4" /> Letzte Vergleiche
            </div>
            {historyLoading ? (
              <Card className="bg-card/60 border-white/10">
                <CardContent className="p-4 text-sm text-muted-foreground">
                  Lade…
                </CardContent>
              </Card>
            ) : history.length === 0 ? (
              <Card className="bg-card/60 border-white/10">
                <CardContent className="p-4 text-sm text-muted-foreground">
                  Noch keine Vergleiche. Starte oben deinen ersten.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {history.map((h) => (
                  <Card
                    key={h.id}
                    className={cn(
                      "bg-card/60 border-white/10 hover:border-primary/40 transition-colors cursor-pointer",
                      h.status === 'running' && "border-primary/30"
                    )}
                  >
                    <CardContent className="p-3 space-y-2">
                      <div className="text-xs text-muted-foreground line-clamp-2">
                        {h.prompt}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          {h.engines.length} Engines
                        </Badge>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {h.total_cost_euros.toFixed(2)}€
                        </span>
                      </div>
                      {(h.user_winner_engine || h.ai_judge_winner_engine) && (
                        <div className="text-[11px] flex items-center gap-1 text-primary">
                          <Trophy className="h-3 w-3" />
                          {h.user_winner_engine ?? h.ai_judge_winner_engine}
                        </div>
                      )}
                      <div className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(h.created_at), { addSuffix: true, locale: de })}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}
