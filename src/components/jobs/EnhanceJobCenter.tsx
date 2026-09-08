import { useEffect, useState } from 'react';
import { Loader2, Sparkles, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from '@/hooks/useTranslation';
import type { EnhanceRunRow } from '@/hooks/useEnhanceVideo';
import { runEngines, runPhaseLabel } from '@/lib/videoEnhance/runPresentation';
import type { EnhanceLang } from '@/lib/videoEnhance/engineErrors';
import {
  getEnhanceRuns,
  hydrateEnhanceRuns,
  isEnhanceLive,
  subscribeEnhanceRuns,
  upsertEnhanceRun,
} from '@/lib/videoEnhance/runStore';

/**
 * App-wide indicator for running video enhancements.
 *
 * The job lives on the server, so leaving the Enhance page must not make it
 * disappear. This badge stays in the shell: it shows every unfinished job of
 * the signed-in user on any page, survives reload and re-login, and can cancel
 * exactly one job without touching the others.
 */

const COPY = {
  title: { en: 'Enhancements running', de: 'Laufende Verbesserungen', es: 'Mejoras en curso' },
  cancel: { en: 'Cancel', de: 'Abbrechen', es: 'Cancelar' },
  hint: {
    en: 'These keep running even if you close this page.',
    de: 'Diese laufen weiter, auch wenn du diese Seite schließt.',
    es: 'Continúan aunque cierres esta página.',
  },
} as const;

export function EnhanceJobCenter() {
  const { language } = useTranslation();
  const lang = (['en', 'de', 'es'].includes(language) ? language : 'en') as EnhanceLang;
  const [runs, setRuns] = useState<EnhanceRunRow[]>(() => getEnhanceRuns());

  useEffect(() => subscribeEnhanceRuns(setRuns), []);
  useEffect(() => {
    // Also re-read after a fresh sign-in, so an unfinished job reappears.
    void hydrateEnhanceRuns();
    const { data } = supabase.auth.onAuthStateChange(() => {
      void hydrateEnhanceRuns(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const live = runs.filter((run) => isEnhanceLive(run.status));
  if (live.length === 0) return null;

  const cancel = async (runId: string) => {
    await supabase.functions.invoke('video-enhance', { body: { action: 'cancel', runId } });
    const { data } = await supabase.functions.invoke('video-enhance', {
      body: { action: 'status', runId },
    });
    if (data?.run) upsertEnhanceRun(data.run as EnhanceRunRow);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2" data-testid="enhance-job-center">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          <Sparkles className="w-4 h-4" aria-hidden="true" />
          <span className="tabular-nums">{live.length}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <p className="text-sm font-medium">{COPY.title[lang]}</p>
        {live.map((run) => (
          <div key={run.id} className="space-y-1 rounded-lg border border-border/60 p-2">
            <p className="text-xs font-medium truncate">{runEngines(run).executing}</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {run.resolution} · {run.fps} fps
            </p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs">{runPhaseLabel(run.status, lang)}</span>
              <Button size="sm" variant="ghost" onClick={() => void cancel(run.id)}>
                <XCircle className="w-4 h-4 mr-1" />
                {COPY.cancel[lang]}
              </Button>
            </div>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">{COPY.hint[lang]}</p>
      </PopoverContent>
    </Popover>
  );
}
