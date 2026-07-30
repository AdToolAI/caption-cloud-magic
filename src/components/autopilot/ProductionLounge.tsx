/**
 * Warte-Lounge — der Rahmen um die Produktion.
 *
 * Links: was die KI gerade tut, inkl. grober Restzeit. Rechts: Infos oder
 * Spiele, damit die ~20 Minuten nicht wie Leerlauf wirken.
 */

import { useEffect, useMemo, useRef } from 'react';
import { Clock, Bell } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ProductionStage } from '@/components/autopilot/ProductionStage';
import { LoungePanel } from '@/components/autopilot/lounge/LoungePanel';
import { StageProgressBar } from '@/components/autopilot/StageProgressBar';
import { customerFacingLogLine, estimateRemaining } from '@/lib/autopilot/eta';
import { useBrandKits } from '@/hooks/useBrandKitAutoApply';
import { useToast } from '@/hooks/use-toast';
import type {
  DirectorLogRow,
  ProductionRow,
  ProductionSceneRow,
} from '@/hooks/useAutopilotProduction';

interface Props {
  production: ProductionRow;
  scenes: ProductionSceneRow[];
  log: DirectorLogRow[];
  language?: string;
}

export function ProductionLounge({ production, scenes, log, language = 'de' }: Props) {
  const { data: brandKits } = useBrandKits();
  const brandKitId = brandKits?.[0]?.id ?? null;
  const { toast } = useToast();
  const notified = useRef(false);

  const eta = useMemo(() => estimateRemaining(production, scenes), [production, scenes]);
  const running = production.status !== 'completed' && production.status !== 'failed';

  const currentLine = useMemo(() => {
    for (const entry of log) {
      const line = customerFacingLogLine(entry.message);
      if (line) return line;
    }
    return null;
  }, [log]);

  // Erlaubnis nur einmal und nur während eines laufenden Films erfragen.
  useEffect(() => {
    if (!running) return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') void Notification.requestPermission();
  }, [running]);

  // Fertig-Signal: Tab-Titel, Systembenachrichtigung, Toast.
  useEffect(() => {
    if (production.status !== 'completed' || notified.current) return;
    notified.current = true;
    document.title = '(fertig) AdTool AI';
    toast({ title: 'Dein Film ist fertig', description: 'Der Clip wartet in der Produktion.' });
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('AdTool AI', { body: 'Dein Film ist fertig.' });
    }
  }, [production.status, toast]);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {running && (
          <Card className="border-primary/20 bg-card/60 p-4 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {currentLine ?? 'Die KI arbeitet an deinem Film.'}
              </p>
              {eta.label && (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {eta.label}
                </span>
              )}
            </div>
            <StageProgressBar
              className="mt-3"
              value={production.progress > 0 ? production.progress : null}
              label="Gesamtfortschritt"
            />
            {typeof Notification !== 'undefined' && Notification.permission === 'default' && (
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => void Notification.requestPermission()}
              >
                <Bell className="mr-1.5 h-3.5 w-3.5" />
                Benachrichtigen, wenn fertig
              </Button>
            )}
          </Card>
        )}

        <ProductionStage production={production} scenes={scenes} log={log} />
      </div>

      <div className="lg:sticky lg:top-4 lg:self-start">
        <LoungePanel brandKitId={brandKitId} language={language} />
      </div>
    </div>
  );
}
