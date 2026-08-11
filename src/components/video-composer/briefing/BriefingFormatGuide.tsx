/**
 * BriefingFormatGuide — renders the canonical sample briefing plus the field
 * reference and the common pitfalls. Used inline inside the briefing import
 * dialog and as a sheet next to the description field in the BriefingTab.
 */

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { tx } from '@/lib/i18nText';
import {
  getBriefingTemplate,
  getBriefingFieldReference,
  getBriefingPitfalls,
} from '@/lib/video-composer/briefingTemplate';

interface Props {
  /** Shown when the host can write the template into its input. */
  onInsert?: () => void;
  className?: string;
}

export default function BriefingFormatGuide({ onInsert, className = '' }: Props) {
  const [copied, setCopied] = useState(false);
  const template = getBriefingTemplate();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(template);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({
        title: tx({ de: 'Kopieren fehlgeschlagen', en: 'Copy failed', es: 'Error al copiar' }),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className={`rounded-lg border border-border/60 bg-card/60 ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          {tx({ de: 'Muster-Briefing', en: 'Sample briefing', es: 'Briefing de muestra' })}
        </span>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={handleCopy}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied
              ? tx({ de: 'Kopiert', en: 'Copied', es: 'Copiado' })
              : tx({ de: 'Kopieren', en: 'Copy', es: 'Copiar' })}
          </Button>
          {onInsert && (
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs hover:text-amber-200" onClick={onInsert}>
              {tx({ de: 'Einfügen', en: 'Insert', es: 'Insertar' })}
            </Button>
          )}
        </div>
      </div>

      <div className="max-h-[280px] overflow-auto px-4 py-3">
        <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground">{template}</pre>
      </div>

      <div className="grid gap-4 border-t border-border/50 px-4 py-3 md:grid-cols-2">
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            {tx({ de: 'Welche Zeile füllt was', en: 'Which line fills what', es: 'Qué línea rellena qué' })}
          </p>
          <ul className="space-y-1.5">
            {getBriefingFieldReference().map((row) => (
              <li key={row.key} className="text-[11px] leading-snug">
                <code className="rounded bg-muted/60 px-1 py-0.5 font-mono text-[10px] text-amber-200/90">{row.key}</code>
                <span className="ml-1.5 text-muted-foreground">{row.effect}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            {tx({ de: 'Häufigste Fehler', en: 'Most common mistakes', es: 'Errores más comunes' })}
          </p>
          <ul className="space-y-1.5">
            {getBriefingPitfalls().map((p) => (
              <li key={p} className="text-[11px] leading-snug text-muted-foreground">
                <span className="mr-1.5 text-destructive">×</span>
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
