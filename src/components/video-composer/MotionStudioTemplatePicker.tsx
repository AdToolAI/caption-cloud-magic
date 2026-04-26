import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, FileX, Play, Sparkles, Clock, LayoutGrid } from 'lucide-react';
import { useMotionStudioTemplates } from '@/hooks/useMotionStudioTemplates';
import {
  USE_CASE_LABELS,
  STYLE_LABELS,
  type MotionStudioTemplate,
  type TemplateStyle,
} from '@/types/motion-studio-templates';
import { cn } from '@/lib/utils';

interface MotionStudioTemplatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTemplate: (template: MotionStudioTemplate) => void;
  onStartBlank: () => void;
}

const ALL_STYLE_FILTER = 'all';

export default function MotionStudioTemplatePicker({
  open,
  onOpenChange,
  onSelectTemplate,
  onStartBlank,
}: MotionStudioTemplatePickerProps) {
  const [styleFilter, setStyleFilter] = useState<string>(ALL_STYLE_FILTER);
  const { data: templates = [], isLoading } = useMotionStudioTemplates(
    styleFilter === ALL_STYLE_FILTER ? {} : { style: styleFilter }
  );

  const styleOptions: { value: string; label: string }[] = [
    { value: ALL_STYLE_FILTER, label: 'Alle Stile' },
    ...(Object.entries(STYLE_LABELS) as [TemplateStyle, string][]).map(([value, label]) => ({
      value,
      label,
    })),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[88vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border/40">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <DialogTitle className="text-xl">Template wählen</DialogTitle>
          </div>
          <DialogDescription>
            Starte mit einer kuratierten Vorlage oder mit einem leeren Projekt.
          </DialogDescription>
        </DialogHeader>

        {/* Style filter */}
        <div className="px-6 py-3 border-b border-border/40 flex flex-wrap gap-2">
          {styleOptions.map((opt) => (
            <Button
              key={opt.value}
              variant={styleFilter === opt.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStyleFilter(opt.value)}
              className="h-8"
            >
              {opt.label}
            </Button>
          ))}
        </div>

        <ScrollArea className="max-h-[60vh]">
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Blank project card – always first */}
            <Card
              className="group relative aspect-[4/5] overflow-hidden cursor-pointer border-dashed border-2 hover:border-primary/60 transition-colors flex flex-col items-center justify-center gap-3 bg-muted/20"
              onClick={onStartBlank}
            >
              <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <FileX className="h-7 w-7 text-primary" />
              </div>
              <div className="text-center px-4">
                <h3 className="font-semibold text-foreground">Leeres Projekt</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Ohne Vorlage von Grund auf starten
                </p>
              </div>
            </Card>

            {isLoading && (
              <div className="col-span-full flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}

            {!isLoading && templates.map((tpl) => (
              <TemplateCard
                key={tpl.id}
                template={tpl}
                onSelect={() => onSelectTemplate(tpl)}
              />
            ))}

            {!isLoading && templates.length === 0 && (
              <div className="col-span-full text-center py-12 text-muted-foreground text-sm">
                Keine Templates gefunden.
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

interface TemplateCardProps {
  template: MotionStudioTemplate;
  onSelect: () => void;
}

function TemplateCard({ template, onSelect }: TemplateCardProps) {
  const sceneCount = Array.isArray(template.scene_suggestions)
    ? template.scene_suggestions.length
    : 0;

  return (
    <Card
      onClick={onSelect}
      className={cn(
        'group relative aspect-[4/5] overflow-hidden cursor-pointer',
        'hover:shadow-lg hover:border-primary/40 transition-all',
        'flex flex-col'
      )}
    >
      {/* Preview area */}
      <div className="relative flex-1 bg-gradient-to-br from-primary/10 via-background to-accent/10 overflow-hidden">
        {template.preview_video_url ? (
          <video
            src={template.preview_video_url}
            poster={template.thumbnail_url ?? undefined}
            muted
            loop
            playsInline
            onMouseEnter={(e) => e.currentTarget.play().catch(() => undefined)}
            onMouseLeave={(e) => {
              e.currentTarget.pause();
              e.currentTarget.currentTime = 0;
            }}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : template.thumbnail_url ? (
          <img
            src={template.thumbnail_url}
            alt={template.name}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Play className="h-10 w-10 text-primary/40" />
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/40 to-transparent opacity-90 group-hover:opacity-100 transition-opacity" />

        {/* Featured badge */}
        {template.is_featured && (
          <Badge className="absolute top-2 left-2 bg-primary/90 text-primary-foreground border-0 text-[10px]">
            Featured
          </Badge>
        )}

        {/* Aspect ratio badge */}
        <Badge
          variant="secondary"
          className="absolute top-2 right-2 text-[10px] backdrop-blur-sm bg-background/70"
        >
          {template.aspect_ratio}
        </Badge>
      </div>

      {/* Info */}
      <div className="p-3 space-y-2 bg-card border-t border-border/40">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm leading-tight truncate">{template.name}</h3>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">
          {template.description}
        </p>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-1">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {template.duration_seconds}s
          </span>
          <span className="flex items-center gap-1">
            <LayoutGrid className="h-3 w-3" />
            {sceneCount} Szenen
          </span>
          <span className="ml-auto text-primary/80 capitalize truncate">
            {USE_CASE_LABELS[template.use_case] ?? template.use_case}
          </span>
        </div>
      </div>
    </Card>
  );
}
