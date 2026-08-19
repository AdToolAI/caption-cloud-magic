import { useEffect, useState } from 'react';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { History, Loader2 } from 'lucide-react';
import { useContinuityDrift, driftSeverity, type DriftHistoryEntry } from '@/hooks/useContinuityDrift';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
}

export default function ContinuityHistoryDrawer({ open, onOpenChange, projectId }: Props) {
  const { fetchHistory } = useContinuityDrift();
  const [entries, setEntries] = useState<DriftHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !projectId) return;
    let cancel = false;
    setLoading(true);
    fetchHistory(projectId)
      .then((rows) => {
        if (!cancel) setEntries(rows);
      })
      .finally(() => !cancel && setLoading(false));
    return () => {
      cancel = true;
    };
  }, [open, projectId, fetchHistory]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Continuity-Verlauf
          </DrawerTitle>
          <DrawerDescription>
            Alle Drift-Prüfungen dieses Projekts, neueste zuerst.
          </DrawerDescription>
        </DrawerHeader>
        <ScrollArea className="px-4 pb-6 max-h-[70vh]">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Lade Verlauf …
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              Noch keine Drift-Prüfungen für dieses Projekt.
            </div>
          ) : (
            <div className="space-y-2">
              {entries.map((e) => {
                const sev = driftSeverity(e.drift_score ?? null);
                return (
                  <div
                    key={e.id}
                    className={`rounded-lg border p-3 flex gap-3 items-start ${sev.bg}`}
                  >
                    <div className="flex gap-2 shrink-0">
                      {e.anchor_image_url && (
                        <img
                          src={e.anchor_image_url}
                          alt="anchor"
                          className="h-16 w-24 object-cover rounded border border-border/40"
                        />
                      )}
                      {e.candidate_image_url && (
                        <img
                          src={e.candidate_image_url}
                          alt="candidate"
                          className="h-16 w-24 object-cover rounded border border-border/40"
                        />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge className={`${sev.color} bg-transparent border-current`}>
                          {sev.label}
                        </Badge>
                        {typeof e.drift_score === 'number' && (
                          <span className={`text-sm font-bold tabular-nums ${sev.color}`}>
                            Score {e.drift_score}
                          </span>
                        )}
                        {e.repaired && (
                          <Badge variant="outline" className="text-emerald-400 border-emerald-500/40">
                            ✓ repariert
                          </Badge>
                        )}
                      </div>
                      {e.label && (
                        <p className="text-xs text-foreground/80 line-clamp-2">{e.label}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(e.created_at), { addSuffix: true, locale: de })}
                        {e.recommendation ? ` · ${e.recommendation}` : ''}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
