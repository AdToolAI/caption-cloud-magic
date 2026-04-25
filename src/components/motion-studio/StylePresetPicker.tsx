// Block K-4 — Style Preset Picker (Modal/Popover)
//
// Tabbed browser for Motion Studio Style Presets:
//   • Genres   → seeded system presets (Cinematic, Vlog, Commercial, Horror, Anime, Doc)
//   • Mine     → user's own private presets
//   • Community → presets other users marked as public
//
// Selecting a preset returns its full payload to the parent (slots +
// directorModifiers + applied_style_preset_id) so SceneCard can apply both
// in a single update.

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Trash2, Sparkles } from 'lucide-react';
import { useStylePresets, type StylePreset } from '@/hooks/useStylePresets';
import type { PromptSlots } from '@/lib/motion-studio/structuredPromptStitcher';
import type { DirectorModifiers } from '@/lib/motion-studio/directorPresets';
import { toast } from '@/hooks/use-toast';

interface StylePresetPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Currently active slots (for the Save flow). */
  currentSlots: PromptSlots;
  /** Currently active director modifiers (for the Save flow). */
  currentModifiers: DirectorModifiers;
  /** Called when a preset is applied. */
  onApply: (preset: StylePreset) => void;
  language: string;
}

const t = (lang: string, de: string, en: string, es: string) =>
  lang === 'de' ? de : lang === 'es' ? es : en;

export default function StylePresetPicker({
  open,
  onOpenChange,
  currentSlots,
  currentModifiers,
  onApply,
  language,
}: StylePresetPickerProps) {
  const { myPresets, publicPresets, systemPresets, loading, saveCurrent, incrementUsage, remove } =
    useStylePresets();

  const [saveName, setSaveName] = useState('');
  const [savePublic, setSavePublic] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasCurrent =
    Object.values(currentSlots).some((v) => (v ?? '').trim()) ||
    Object.values(currentModifiers).some(Boolean);

  const apply = async (preset: StylePreset) => {
    onApply(preset);
    incrementUsage(preset.id); // fire-and-forget
    onOpenChange(false);
    toast({
      title: t(language, '✨ Style angewendet', '✨ Style applied', '✨ Estilo aplicado'),
      description: preset.name,
    });
  };

  const handleSave = async () => {
    if (!saveName.trim()) return;
    setSaving(true);
    const result = await saveCurrent({
      name: saveName.trim(),
      slots: currentSlots,
      directorModifiers: currentModifiers,
      isPublic: savePublic,
    });
    setSaving(false);
    if (result) {
      toast({
        title: t(language, '✓ Style gespeichert', '✓ Style saved', '✓ Estilo guardado'),
      });
      setSaveName('');
      setSavePublic(false);
    } else {
      toast({
        title: t(language, 'Speichern fehlgeschlagen', 'Save failed', 'Fallo al guardar'),
        variant: 'destructive',
      });
    }
  };

  const renderGrid = (list: StylePreset[], allowDelete = false) => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          {t(language, 'Lade Presets…', 'Loading presets…', 'Cargando presets…')}
        </div>
      );
    }
    if (list.length === 0) {
      return (
        <div className="py-8 text-center text-muted-foreground text-xs">
          {t(language, 'Keine Presets verfügbar.', 'No presets available.', 'Sin presets disponibles.')}
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[55vh] overflow-y-auto">
        {list.map((p) => {
          const slotPreview = [
            p.slots.subject,
            p.slots.style,
            p.slots.timeWeather,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <div
              key={p.id}
              className="rounded-md border border-border hover:border-primary/50 transition-colors p-3 bg-background/50 group"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm font-medium truncate">{p.name}</span>
                  {p.user_id === null && (
                    <Badge variant="outline" className="h-4 px-1 text-[8px] shrink-0">
                      System
                    </Badge>
                  )}
                  {p.is_public && p.user_id !== null && (
                    <Badge variant="secondary" className="h-4 px-1 text-[8px] shrink-0">
                      Community
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {p.usage_count > 0 && (
                    <span className="text-[9px] text-muted-foreground">
                      {p.usage_count}×
                    </span>
                  )}
                  {allowDelete && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        remove(p.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
              {p.description && (
                <p className="text-[10px] text-muted-foreground mb-1.5 line-clamp-2">
                  {p.description}
                </p>
              )}
              {slotPreview && (
                <p className="text-[9px] font-mono text-foreground/60 line-clamp-2 mb-2">
                  {slotPreview}
                </p>
              )}
              <Button
                size="sm"
                variant="default"
                className="h-6 w-full text-[10px]"
                onClick={() => apply(p)}
              >
                <Sparkles className="h-3 w-3 mr-1" />
                {t(language, 'Anwenden', 'Apply', 'Aplicar')}
              </Button>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t(language, 'Style Presets', 'Style Presets', 'Presets de estilo')}
          </DialogTitle>
          <DialogDescription>
            {t(
              language,
              'Wende einen vorgefertigten Look an oder speichere deinen aktuellen Build als wiederverwendbares Preset.',
              'Apply a curated look or save your current build as a reusable preset.',
              'Aplica un look curado o guarda tu configuración actual como preset reutilizable.'
            )}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="genres">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="genres" className="text-xs">
              {t(language, 'Genres', 'Genres', 'Géneros')}
            </TabsTrigger>
            <TabsTrigger value="mine" className="text-xs">
              {t(language, 'Meine', 'Mine', 'Míos')}
              {myPresets.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-3 px-1 text-[8px]">
                  {myPresets.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="community" className="text-xs">
              {t(language, 'Community', 'Community', 'Comunidad')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="genres" className="mt-3">
            {renderGrid(systemPresets)}
          </TabsContent>
          <TabsContent value="mine" className="mt-3 space-y-3">
            {renderGrid(myPresets, true)}
            {hasCurrent && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
                <Label className="text-xs">
                  {t(language, 'Aktuelle Konfiguration speichern', 'Save current configuration', 'Guardar configuración actual')}
                </Label>
                <Input
                  placeholder={t(language, 'Name (z. B. „Mein Cinematic Vlog")', 'Name (e.g. "My Cinematic Vlog")', 'Nombre (p. ej. "Mi Cinematic Vlog")')}
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  className="h-8 text-xs"
                />
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Switch checked={savePublic} onCheckedChange={setSavePublic} id="public-toggle" />
                    <Label htmlFor="public-toggle" className="text-[10px] text-muted-foreground cursor-pointer">
                      {t(language, 'Öffentlich teilen', 'Share publicly', 'Compartir públicamente')}
                    </Label>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={!saveName.trim() || saving}
                    className="h-7 text-[10px]"
                  >
                    {saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                    {t(language, 'Speichern', 'Save', 'Guardar')}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
          <TabsContent value="community" className="mt-3">
            {renderGrid(publicPresets)}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
