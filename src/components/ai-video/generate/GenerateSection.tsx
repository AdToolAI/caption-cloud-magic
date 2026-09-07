import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Progressive-disclosure wrapper for the Generate tab.
 *
 * Purely presentational: it never touches the values inside, it only decides
 * whether they are visible. Open state is remembered per section id so power
 * users keep their layout, while newcomers get a calm default view.
 */
interface Props {
  /** Stable id — used for the localStorage key. */
  id: string;
  title: string;
  /** Short right-aligned summary, e.g. "2 Charaktere". */
  summary?: string | null;
  icon?: ReactNode;
  /** Force-open (model requires this section) — user can still collapse. */
  defaultOpen?: boolean;
  children: ReactNode;
}

const STORAGE_PREFIX = 'ai-video-toolkit:section:';

export function GenerateSection({ id, title, summary, icon, defaultOpen, children }: Props) {
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + id);
      if (raw === '1') return true;
      if (raw === '0') return false;
    } catch { /* noop */ }
    return !!defaultOpen;
  });

  /* When the model makes a section mandatory, reveal it once. */
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  const toggle = (next: boolean) => {
    setOpen(next);
    try { localStorage.setItem(STORAGE_PREFIX + id, next ? '1' : '0'); } catch { /* noop */ }
  };

  return (
    <Collapsible open={open} onOpenChange={toggle}>
      <div className="rounded-xl border border-border/60 bg-card/40 backdrop-blur-xl overflow-hidden">
        <CollapsibleTrigger className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-primary/5">
          {icon && <span className="text-primary shrink-0">{icon}</span>}
          <span className="text-sm font-medium">{title}</span>
          {summary && (
            <Badge variant="outline" className="border-primary/30 text-primary text-[10px] font-normal">
              {summary}
            </Badge>
          )}
          <ChevronDown
            className={cn(
              'ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-4 border-t border-border/40 p-4">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export default GenerateSection;
