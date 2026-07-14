import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ZoomIn, Clapperboard, Film, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { OutfitLook } from '@/hooks/useSavedOutfits';
import { OutfitLightbox, type LightboxFrame } from './OutfitLightbox';
import { EntityIdBadge } from '@/components/cast-world/EntityIdBadge';

const PERSPECTIVES: Array<{ key: keyof OutfitLook; label: string }> = [
  { key: 'front_url', label: 'Front' },
  { key: 'back_url', label: 'Back' },
  { key: 'side_url', label: 'Side' },
  { key: 'top_url', label: 'Top' },
];

export function SavedOutfitViewerCard({
  look, onBack,
}: { look: OutfitLook; onBack: () => void }) {
  const navigate = useNavigate();
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const { data: avatarName } = useQuery({
    queryKey: ['avatar-name', look.avatar_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('brand_characters')
        .select('name')
        .eq('id', look.avatar_id)
        .maybeSingle();
      return (data as any)?.name as string | undefined;
    },
  });

  const mentionToken = `@${avatarName ?? 'Avatar'} — ${look.name}`;

  const frames: LightboxFrame[] = PERSPECTIVES
    .map((p) => {
      const url = (look as any)[p.key] as string | null;
      return url ? { url, label: p.label } : null;
    })
    .filter((f): f is LightboxFrame => !!f);

  const handleSendTo = (target: 'composer' | 'toolkit') => {
    try {
      sessionStorage.setItem('studio:incoming-outfit', JSON.stringify({
        outfitLookId: look.id,
        avatarId: look.avatar_id,
        name: look.name,
        avatarName,
        referenceImageUrl: look.front_url ?? look.cover_url,
        mentionToken,
      }));
    } catch {}
    navigator.clipboard?.writeText(mentionToken).catch(() => {});
    toast.success(`Mention copied: ${mentionToken}`, {
      description: 'Paste with @ in the prompt to lock identity & outfit.',
    });
    navigate(target === 'composer' ? '/video-composer' : '/ai-video-studio');
  };

  return (
    <Card className="p-4 bg-card/60 border-primary/15 h-fit space-y-3">
      <Button variant="ghost" size="sm" onClick={onBack} className="h-7 px-2 text-xs">
        <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Portrait
      </Button>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Saved outfit</p>
        <h3 className="font-serif text-lg leading-tight">{look.name}</h3>
        <p className="text-[10px] text-muted-foreground mt-0.5">From your library · click any image to zoom</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {PERSPECTIVES.map(({ key, label }, i) => {
          const url = (look as any)[key] as string | null;
          const idxInFrames = frames.findIndex((f) => f.label === label);
          return (
            <div
              key={label}
              onClick={() => { if (url && idxInFrames >= 0) setLightboxIdx(idxInFrames); }}
              className={cn(
                'relative aspect-[3/4] rounded-md overflow-hidden border border-border/40 bg-muted/20 group',
                url && 'cursor-zoom-in hover:border-primary/60 transition',
              )}
            >
              {url && (
                <>
                  <img src={url} alt={`${look.name} — ${label}`} loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <ZoomIn className="h-5 w-5 text-white drop-shadow" />
                  </div>
                </>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-1.5">
                <span className="text-[10px] font-medium text-white drop-shadow">{label}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Send to studio actions */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between gap-2 rounded-md border border-primary/15 bg-primary/5 px-2.5 py-2">
          <code className="text-[10.5px] text-primary truncate flex-1">{mentionToken}</code>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 shrink-0"
            onClick={() => {
              navigator.clipboard?.writeText(mentionToken);
              toast.success('Mention copied');
            }}
            title="Copy mention"
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" onClick={() => handleSendTo('toolkit')}>
            <Clapperboard className="h-3.5 w-3.5 mr-1.5" /> AI Video Studio
          </Button>
          <Button size="sm" variant="outline" onClick={() => handleSendTo('composer')}>
            <Film className="h-3.5 w-3.5 mr-1.5" /> Motion Studio
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground leading-snug">
          Paste the <code className="text-primary">@-mention</code> into your prompt — the saved outfit
          is auto-injected as identity reference.
        </p>
      </div>

      <OutfitLightbox
        open={lightboxIdx !== null}
        onClose={() => setLightboxIdx(null)}
        initialIndex={lightboxIdx ?? 0}
        title={`${avatarName ?? 'Avatar'} — ${look.name}`}
        frames={frames}
      />
    </Card>
  );
}
