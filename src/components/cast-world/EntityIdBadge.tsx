import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface EntityIdBadgeProps {
  id: string | null | undefined;
  label?: string;
  className?: string;
  /** Show short (first 8 chars) or full UUID */
  short?: boolean;
}

/**
 * Small monospace ID chip with copy-to-clipboard.
 * Used across Cast & World to expose entity UUIDs (characters, locations,
 * buildings, props, outfits, …) so they can be referenced downstream.
 */
export function EntityIdBadge({
  id,
  label = 'ID',
  className,
  short = true,
}: EntityIdBadgeProps) {
  const [copied, setCopied] = useState(false);
  if (!id) return null;

  const displayId = short && id.length > 12 ? `${id.slice(0, 8)}…` : id;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      toast.success('ID kopiert', { description: id });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Konnte ID nicht kopieren');
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`${label}: ${id} (Klick zum Kopieren)`}
      className={cn(
        'inline-flex items-center gap-1 rounded border border-border/40 bg-background/60 px-1.5 py-0.5',
        'text-[10px] font-mono text-muted-foreground hover:text-primary hover:border-primary/40 transition',
        className,
      )}
    >
      <span className="uppercase tracking-widest text-[9px] opacity-70">{label}</span>
      <span className="tabular-nums">{displayId}</span>
      {copied ? (
        <Check className="h-2.5 w-2.5 text-primary" />
      ) : (
        <Copy className="h-2.5 w-2.5 opacity-60" />
      )}
    </button>
  );
}

export default EntityIdBadge;
