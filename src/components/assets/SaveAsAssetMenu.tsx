// Stage 4 — "Save as Character / Location" UI
//
// Drop-in dropdown menu used on any image (Frame-First variants, Picture
// Studio outputs, video thumbnails). Calls `extract-asset-from-frame` which
// re-hosts the image into the right bucket, runs Gemini Vision, and inserts
// into `brand_characters` or `brand_locations`.

import { useState } from 'react';
import { Bookmark, User, MapPin, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props {
  imageUrl: string;
  /** Optional default name (e.g. derived from prompt). */
  defaultName?: string;
  language?: 'en' | 'de' | 'es';
  className?: string;
  /** Render trigger inline (icon-only) instead of a Button. */
  iconOnly?: boolean;
}

type Mode = 'character' | 'location';

const t = (lang: 'en' | 'de' | 'es', en: string, de: string, es: string) =>
  lang === 'de' ? de : lang === 'es' ? es : en;

export default function SaveAsAssetMenu({
  imageUrl,
  defaultName = '',
  language = 'en',
  className,
  iconOnly,
}: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('character');
  const [name, setName] = useState(defaultName);
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);

  const start = (m: Mode) => {
    setMode(m);
    setName(defaultName);
    setDesc('');
    setOpen(true);
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error(t(language, 'Name required', 'Name erforderlich', 'Nombre requerido'));
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('extract-asset-from-frame', {
        body: {
          image_url: imageUrl,
          mode,
          name: name.trim(),
          description: desc.trim() || undefined,
        },
      });
      if (error) throw error;
      if (!(data as any)?.success) throw new Error((data as any)?.error || 'Save failed');

      qc.invalidateQueries({
        queryKey: [mode === 'character' ? 'brand-characters' : 'brand-locations'],
      });
      qc.invalidateQueries({ queryKey: ['unified-mention-library'] });

      toast.success(
        mode === 'character'
          ? t(language, 'Character saved', 'Charakter gespeichert', 'Personaje guardado')
          : t(language, 'Location saved', 'Location gespeichert', 'Ubicación guardada'),
      );
      setOpen(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? t(language, 'Save failed', 'Speichern fehlgeschlagen', 'Error al guardar'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {iconOnly ? (
            <button
              type="button"
              className={cn(
                'h-6 w-6 rounded-full bg-background/80 backdrop-blur border border-border/50 flex items-center justify-center hover:bg-primary/15 hover:border-primary/50 transition',
                className,
              )}
              title={t(language, 'Save as asset', 'Als Asset speichern', 'Guardar como recurso')}
              onClick={(e) => e.stopPropagation()}
            >
              <Bookmark className="h-3 w-3" />
            </button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className={cn('h-7 text-[11px] gap-1', className)}
              onClick={(e) => e.stopPropagation()}
            >
              <Bookmark className="h-3 w-3" />
              {t(language, 'Save as…', 'Speichern als…', 'Guardar como…')}
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => start('character')}>
            <User className="h-3.5 w-3.5 mr-2" />
            {t(language, 'Save as Character', 'Als Charakter speichern', 'Guardar como personaje')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => start('location')}>
            <MapPin className="h-3.5 w-3.5 mr-2" />
            {t(language, 'Save as Location', 'Als Location speichern', 'Guardar como ubicación')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {mode === 'character'
                ? t(language, 'Save as Character', 'Als Charakter speichern', 'Guardar como personaje')
                : t(language, 'Save as Location', 'Als Location speichern', 'Guardar como ubicación')}
            </DialogTitle>
          </DialogHeader>

          <div className="flex gap-3">
            <img
              src={imageUrl}
              alt="preview"
              className="h-24 w-24 rounded-md object-cover border border-border/40"
            />
            <div className="flex-1 space-y-2">
              <div>
                <Label className="text-[11px]">{t(language, 'Name', 'Name', 'Nombre')}</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={mode === 'character' ? 'Sarah' : 'Berlin Loft'}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-[11px]">
                  {t(language, 'Description (optional)', 'Beschreibung (optional)', 'Descripción (opcional)')}
                </Label>
                <Textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  rows={2}
                  className="text-sm"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={saving}>
              {t(language, 'Cancel', 'Abbrechen', 'Cancelar')}
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              {t(language, 'Save', 'Speichern', 'Guardar')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
