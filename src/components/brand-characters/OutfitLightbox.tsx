import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LightboxFrame {
  url: string;
  label: string;
}

interface Props {
  open: boolean;
  frames: LightboxFrame[];
  initialIndex?: number;
  title?: string;
  onClose: () => void;
}

export function OutfitLightbox({ open, frames, initialIndex = 0, title, onClose }: Props) {
  const [idx, setIdx] = useState(initialIndex);

  useEffect(() => {
    if (open) setIdx(Math.max(0, Math.min(initialIndex, frames.length - 1)));
  }, [open, initialIndex, frames.length]);

  const go = useCallback((delta: number) => {
    setIdx((i) => (i + delta + frames.length) % frames.length);
  }, [frames.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, go]);

  if (!frames.length) return null;
  const current = frames[idx];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-[96vw] sm:max-w-[92vw] md:max-w-[88vw] w-full p-0 bg-black/95 border-primary/20 overflow-hidden"
      >
        <div className="relative w-full" style={{ height: 'min(90vh, 1200px)' }}>
          {/* Header */}
          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent">
            <div className="text-white">
              {title && <p className="text-[11px] uppercase tracking-wider text-white/60">{title}</p>}
              <p className="font-serif text-base sm:text-lg">{current.label}</p>
            </div>
            <div className="flex items-center gap-1">
              <Button asChild variant="ghost" size="sm" className="text-white hover:bg-white/10">
                <a href={current.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open original
                </a>
              </Button>
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Image */}
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <img
              key={current.url}
              src={current.url}
              alt={current.label}
              className="max-w-full max-h-full object-contain select-none"
              draggable={false}
            />
          </div>

          {/* Arrows */}
          {frames.length > 1 && (
            <>
              <button
                onClick={() => go(-1)}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center transition"
                aria-label="Previous"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={() => go(1)}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center transition"
                aria-label="Next"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}

          {/* Thumbnail strip */}
          {frames.length > 1 && (
            <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/90 to-transparent p-3 pt-8">
              <div className="flex justify-center gap-2">
                {frames.map((f, i) => (
                  <button
                    key={f.url + i}
                    onClick={() => setIdx(i)}
                    className={cn(
                      'relative h-14 w-12 rounded overflow-hidden border-2 transition',
                      i === idx ? 'border-primary ring-1 ring-primary/40' : 'border-white/20 hover:border-white/60',
                    )}
                  >
                    <img src={f.url} alt={f.label} className="w-full h-full object-cover" />
                    <span className="absolute inset-x-0 bottom-0 text-[9px] text-white bg-black/60 px-1">{f.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
