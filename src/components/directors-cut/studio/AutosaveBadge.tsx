import { Check, CloudUpload, AlertCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { tx } from '@/lib/i18nText';

interface AutosaveBadgeProps {
  status: 'idle' | 'saving' | 'saved' | 'error';
  lastSavedAt: number | null;
}

function formatRelative(ts: number, now: number): string {
  const diffSec = Math.max(0, Math.round((now - ts) / 1000));
  if (diffSec < 5) return tx({ de: 'gerade eben', en: 'just now', es: 'justo ahora' });
  if (diffSec < 60) return tx({ de: `vor ${diffSec}s`, en: `${diffSec}s ago`, es: `hace ${diffSec}s` });
  const min = Math.round(diffSec / 60);
  if (min < 60) return tx({ de: `vor ${min} min`, en: `${min} min ago`, es: `hace ${min} min` });
  const hr = Math.round(min / 60);
  return tx({ de: `vor ${hr}h`, en: `${hr}h ago`, es: `hace ${hr}h` });
}

/**
 * Welle 3 · M3 — subtle autosave indicator in the Director's Cut top bar.
 * Shows "Speichere…" while a debounced save is in flight, "Gesichert · vor Xs"
 * after success, and an error state otherwise. Idle collapses to a quiet
 * "Zuletzt: …" line so the toolbar never shouts.
 */
export function AutosaveBadge({ status, lastSavedAt }: AutosaveBadgeProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!lastSavedAt) return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [lastSavedAt]);

  const relative = lastSavedAt ? formatRelative(lastSavedAt, now) : null;

  if (status === 'saving') {
    return (
      <div className="flex items-center gap-1.5 h-6 px-2 rounded-md bg-white/5 border border-white/10 text-[10px] text-white/70">
        <CloudUpload className="h-3 w-3 text-cyan-300 animate-pulse" />
        <span>{tx({ de: 'Speichere…', en: 'Saving…', es: 'Guardando…' })}</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex items-center gap-1.5 h-6 px-2 rounded-md bg-red-500/10 border border-red-500/30 text-[10px] text-red-300">
        <AlertCircle className="h-3 w-3" />
        <span>{tx({ de: 'Speichern fehlgeschlagen', en: 'Save failed', es: 'Error al guardar' })}</span>
      </div>
    );
  }

  if (status === 'saved') {
    return (
      <div className="flex items-center gap-1.5 h-6 px-2 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-[10px] text-emerald-200">
        <Check className="h-3 w-3" />
        <span>{tx({ de: 'Gesichert', en: 'Saved', es: 'Guardado' })}{relative ? ` · ${relative}` : ''}</span>
      </div>
    );
  }

  // idle
  if (!relative) return null;
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 h-6 px-2 rounded-md text-[10px] text-white/40',
        'bg-transparent border border-transparent hover:border-white/10 transition-colors'
      )}
      title={new Date(lastSavedAt!).toLocaleString()}
    >
      <Check className="h-3 w-3 text-white/30" />
      <span>{tx({ de: 'Zuletzt gesichert', en: 'Last saved', es: 'Guardado por última vez' })} {relative}</span>
    </div>
  );
}
