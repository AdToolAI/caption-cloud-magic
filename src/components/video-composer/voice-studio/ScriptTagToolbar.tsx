import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Pause, Volume1, Zap, Leaf, Quote, Sparkles } from 'lucide-react';
import { RefObject } from 'react';

interface ScriptTagToolbarProps {
  textareaRef: RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (next: string) => void;
}

interface TagDef {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  insert: string;        // raw token to insert
  wraps?: boolean;       // wraps current selection: [tag]...[/tag]
  tooltip: string;
}

const TAGS: TagDef[] = [
  { label: 'Pause', icon: Pause, insert: '[pause 0.5s]', tooltip: 'Kurze Sprechpause (0.5s)' },
  { label: 'Whisper', icon: Volume1, insert: '[whisper]', wraps: true, tooltip: 'Geflüstert sprechen' },
  { label: 'Excited', icon: Zap, insert: '[excited]', wraps: true, tooltip: 'Begeistert / energetisch' },
  { label: 'Calm', icon: Leaf, insert: '[soft]', wraps: true, tooltip: 'Ruhig / weich' },
  { label: 'Emphasize', icon: Quote, insert: '[emphasize]', wraps: true, tooltip: 'Betont / nachdrücklich' },
  { label: 'Laugh', icon: Sparkles, insert: '[laugh]', tooltip: 'Lachen einfügen' },
];

export function ScriptTagToolbar({ textareaRef, value, onChange }: ScriptTagToolbarProps) {
  const insertTag = (def: TagDef) => {
    const ta = textareaRef.current;
    if (!ta) {
      onChange(value + ' ' + def.insert);
      return;
    }
    const start = ta.selectionStart ?? value.length;
    const end = ta.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    const selected = value.slice(start, end);
    const after = value.slice(end);

    let inserted: string;
    let cursor: number;
    if (def.wraps && selected.length > 0) {
      const close = `[/${def.insert.replace(/[\[\]]/g, '').split(/\s/)[0]}]`;
      inserted = `${def.insert}${selected}${close}`;
      cursor = start + inserted.length;
    } else if (def.wraps) {
      const close = `[/${def.insert.replace(/[\[\]]/g, '').split(/\s/)[0]}]`;
      inserted = `${def.insert}${close}`;
      cursor = start + def.insert.length;
    } else {
      inserted = (before.endsWith(' ') || before.length === 0 ? '' : ' ') + def.insert + ' ';
      cursor = start + inserted.length;
    }

    const next = before + inserted + after;
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(cursor, cursor);
    });
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-border/40 bg-background/40 p-1">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground px-1.5">Tags:</span>
        {TAGS.map((def) => {
          const Icon = def.icon;
          return (
            <Tooltip key={def.label}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => insertTag(def)}
                >
                  <Icon className="h-3 w-3 mr-1" />
                  {def.label}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <span className="text-xs">{def.tooltip}</span>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
