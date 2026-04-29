/**
 * MultiReferenceUploader
 * --------------------------------------------------------------
 * UI for Vidu Q2 Reference2V mode: 1–7 reference images with role tagging.
 *
 * Roles drive prompt augmentation in `generate-vidu-video`:
 *   character → "featuring the character from image N"
 *   product   → "prominently showing the product from image N"
 *   location  → "set in the location from image N"
 *   style     → "in the visual style of image N"
 *   prop      → "incorporating the prop from image N"
 *
 * RLS-conform storage path: `${userId}/vidu-ref-${ts}.${ext}` in the
 * existing `ai-video-reference` bucket.
 */
import { useRef, useState } from 'react';
import { Loader2, ImagePlus, X, UserCircle2, Package, MapPin, Palette, Box } from 'lucide-react';
import { motion } from 'framer-motion';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTranslation } from '@/hooks/useTranslation';
import {
  VIDU_REFERENCE_ROLES,
  type ViduReferenceRole,
} from '@/config/viduVideoCredits';

export interface ViduReferenceSlot {
  url: string;
  role: ViduReferenceRole;
}

interface Props {
  slots: ViduReferenceSlot[];
  onChange: (slots: ViduReferenceSlot[]) => void;
  maxReferences?: number;
  /** Optional: URL of the active Brand Character to offer "Load from Lock". */
  brandCharacterUrl?: string | null;
  brandCharacterName?: string | null;
}

const ROLE_ICON: Record<ViduReferenceRole, typeof UserCircle2> = {
  character: UserCircle2,
  product: Package,
  location: MapPin,
  style: Palette,
  prop: Box,
};

export function MultiReferenceUploader({
  slots,
  onChange,
  maxReferences = 7,
  brandCharacterUrl,
  brandCharacterName,
}: Props) {
  const { user } = useAuth();
  const { language } = useTranslation();
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingRole, setPendingRole] = useState<ViduReferenceRole>('character');

  const isFull = slots.length >= maxReferences;

  const uploadFile = async (file: File, role: ViduReferenceRole) => {
    if (!user) {
      toast.error(language === 'de' ? 'Bitte einloggen.' : 'Please sign in.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error(language === 'de' ? 'Bild zu groß (max. 10 MB).' : 'Image too large (max 10 MB).');
      return;
    }
    setUploadingIndex(slots.length);
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${user.id}/vidu-ref-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from('ai-video-reference')
        .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage
        .from('ai-video-reference')
        .getPublicUrl(path);
      onChange([...slots, { url: publicUrl, role }]);
    } catch (err: any) {
      toast.error(err?.message ?? (language === 'de' ? 'Upload fehlgeschlagen.' : 'Upload failed.'));
    } finally {
      setUploadingIndex(null);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file, pendingRole);
    if (inputRef.current) inputRef.current.value = '';
  };

  const removeSlot = (idx: number) => {
    onChange(slots.filter((_, i) => i !== idx));
  };

  const updateRole = (idx: number, role: ViduReferenceRole) => {
    const next = [...slots];
    next[idx] = { ...next[idx], role };
    onChange(next);
  };

  const loadFromBrandCharacter = () => {
    if (!brandCharacterUrl) return;
    if (slots.some((s) => s.url === brandCharacterUrl)) {
      toast.info(language === 'de' ? 'Charakter ist bereits geladen.' : 'Character already loaded.');
      return;
    }
    onChange([...slots, { url: brandCharacterUrl, role: 'character' }]);
    toast.success(
      language === 'de'
        ? `${brandCharacterName ?? 'Brand Character'} hinzugefügt`
        : `${brandCharacterName ?? 'Brand Character'} added`,
    );
  };

  const roleLabels = VIDU_REFERENCE_ROLES.map((r) => ({
    id: r.id,
    label: language === 'de' ? r.labelDE : language === 'es' ? r.labelES : r.labelEN,
  }));

  return (
    <Card className="p-5 bg-card/60 backdrop-blur-xl border-border/60 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ImagePlus className="h-4 w-4 text-primary" />
          <Label className="text-sm font-medium">
            {language === 'de'
              ? 'Multi-Reference (1–7 Bilder)'
              : language === 'es'
              ? 'Multi-Referencia (1–7 imágenes)'
              : 'Multi-Reference (1–7 images)'}
          </Label>
          <Badge variant="outline" className="border-primary/30 text-primary text-[10px]">
            {slots.length}/{maxReferences}
          </Badge>
        </div>

        {brandCharacterUrl && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs h-7 border-primary/40"
            onClick={loadFromBrandCharacter}
          >
            <UserCircle2 className="h-3 w-3 mr-1" />
            {language === 'de'
              ? 'Brand Character laden'
              : language === 'es'
              ? 'Cargar Brand Character'
              : 'Load Brand Character'}
          </Button>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        {language === 'de'
          ? 'Lade dein Avatar, Produkt, Setting und Style — Vidu kombiniert sie in einer 5s-Szene.'
          : language === 'es'
          ? 'Sube tu avatar, producto, ubicación y estilo — Vidu los combina en una escena de 5s.'
          : 'Upload your character, product, location and style — Vidu blends them into one 5s scene.'}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {slots.map((slot, idx) => {
          const Icon = ROLE_ICON[slot.role];
          return (
            <motion.div
              key={`${slot.url}-${idx}`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="relative group rounded-lg overflow-hidden border border-primary/30 aspect-square bg-background/40"
            >
              <img src={slot.url} alt={`Ref ${idx + 1}`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeSlot(idx)}
                className="absolute top-1 right-1 h-5 w-5 rounded-full bg-background/90 hover:bg-destructive hover:text-destructive-foreground flex items-center justify-center transition-colors"
                aria-label="Remove"
              >
                <X className="h-3 w-3" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background/95 via-background/70 to-transparent p-1.5 space-y-1">
                <div className="flex items-center gap-1">
                  <Icon className="h-3 w-3 text-primary shrink-0" />
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                    #{idx + 1}
                  </span>
                </div>
                <Select value={slot.role} onValueChange={(v) => updateRole(idx, v as ViduReferenceRole)}>
                  <SelectTrigger className="h-6 text-[10px] bg-background/60 border-border/40 px-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roleLabels.map((r) => (
                      <SelectItem key={r.id} value={r.id} className="text-xs">
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </motion.div>
          );
        })}

        {!isFull && (
          <div className="aspect-square rounded-lg border-2 border-dashed border-border/50 hover:border-primary/40 transition-colors flex flex-col items-center justify-center gap-1.5 p-2 cursor-pointer bg-background/20">
            <Select value={pendingRole} onValueChange={(v) => setPendingRole(v as ViduReferenceRole)}>
              <SelectTrigger className="h-6 text-[10px] bg-background/60 border-border/40 px-1.5 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roleLabels.map((r) => (
                  <SelectItem key={r.id} value={r.id} className="text-xs">
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label
              htmlFor="vidu-multiref-input"
              className="flex flex-col items-center justify-center gap-1 cursor-pointer w-full"
            >
              {uploadingIndex !== null ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              ) : (
                <ImagePlus className="h-5 w-5 text-muted-foreground" />
              )}
              <span className="text-[9px] text-muted-foreground text-center">
                {language === 'de' ? 'Hinzufügen' : language === 'es' ? 'Añadir' : 'Add'}
              </span>
            </label>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        id="vidu-multiref-input"
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileInput}
      />

      {slots.length === 0 && (
        <p className="text-[10px] text-amber-500/80">
          {language === 'de'
            ? '⚠️ Mindestens 1 Bild erforderlich für Reference2V.'
            : language === 'es'
            ? '⚠️ Se requiere al menos 1 imagen para Reference2V.'
            : '⚠️ At least 1 image required for Reference2V.'}
        </p>
      )}
    </Card>
  );
}
