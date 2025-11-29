import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Sparkles, 
  Film, 
  Video, 
  Music2, 
  BookOpen,
  Zap,
  Check,
  Eye
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SmartTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  preview: {
    transitionType: string;
    avgSceneDuration: number;
    effects: {
      brightness: number;
      contrast: number;
      saturation: number;
      temperature: number;
    };
  };
  tags: string[];
}

const templates: SmartTemplate[] = [
  {
    id: 'tiktok-viral',
    name: 'TikTok Viral',
    description: 'Schnelle Cuts, dynamische Wipes, hoher Kontrast für maximales Engagement',
    icon: <Zap className="w-5 h-5" />,
    color: 'from-pink-500 to-rose-500',
    preview: {
      transitionType: 'wipe',
      avgSceneDuration: 2,
      effects: {
        brightness: 105,
        contrast: 120,
        saturation: 115,
        temperature: 5,
      },
    },
    tags: ['Schnell', 'Energetisch', 'Social'],
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    description: 'Lange Takes, sanfte Dissolves, filmische Farbgebung für professionellen Look',
    icon: <Film className="w-5 h-5" />,
    color: 'from-amber-500 to-orange-500',
    preview: {
      transitionType: 'dissolve',
      avgSceneDuration: 5,
      effects: {
        brightness: 95,
        contrast: 110,
        saturation: 90,
        temperature: -10,
      },
    },
    tags: ['Elegant', 'Professionell', 'Film'],
  },
  {
    id: 'vlog-style',
    name: 'Vlog Style',
    description: 'Natürliche Jump Cuts, authentische Farben, persönlicher Touch',
    icon: <Video className="w-5 h-5" />,
    color: 'from-green-500 to-emerald-500',
    preview: {
      transitionType: 'none',
      avgSceneDuration: 3,
      effects: {
        brightness: 102,
        contrast: 100,
        saturation: 105,
        temperature: 3,
      },
    },
    tags: ['Authentisch', 'Persönlich', 'Casual'],
  },
  {
    id: 'music-video',
    name: 'Music Video',
    description: 'Beat-Sync Schnitte, hohe Sättigung, dramatische Übergänge',
    icon: <Music2 className="w-5 h-5" />,
    color: 'from-purple-500 to-violet-500',
    preview: {
      transitionType: 'fade',
      avgSceneDuration: 2.5,
      effects: {
        brightness: 100,
        contrast: 125,
        saturation: 130,
        temperature: 0,
      },
    },
    tags: ['Rhythmisch', 'Intensiv', 'Kreativ'],
  },
  {
    id: 'documentary',
    name: 'Documentary',
    description: 'Ruhige Crossfades, dezente Effekte, fokussiert auf Inhalt',
    icon: <BookOpen className="w-5 h-5" />,
    color: 'from-blue-500 to-cyan-500',
    preview: {
      transitionType: 'crossfade',
      avgSceneDuration: 6,
      effects: {
        brightness: 98,
        contrast: 105,
        saturation: 95,
        temperature: -5,
      },
    },
    tags: ['Informativ', 'Ruhig', 'Fokussiert'],
  },
];

interface SmartTemplatesProps {
  onApply: (template: SmartTemplate) => void;
  currentTemplateId?: string;
}

export function SmartTemplates({ onApply, currentTemplateId }: SmartTemplatesProps) {
  const [hoveredTemplate, setHoveredTemplate] = useState<string | null>(null);
  const [previewingTemplate, setPreviewingTemplate] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Smart Templates</h3>
        </div>
        <Badge variant="secondary" className="text-xs">
          One-Click Styles
        </Badge>
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {templates.map((template) => {
          const isActive = currentTemplateId === template.id;
          const isHovered = hoveredTemplate === template.id;
          const isPreviewing = previewingTemplate === template.id;

          return (
            <motion.div
              key={template.id}
              onMouseEnter={() => setHoveredTemplate(template.id)}
              onMouseLeave={() => setHoveredTemplate(null)}
              whileHover={{ scale: 1.02, y: -4 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              <Card
                className={cn(
                  'relative cursor-pointer overflow-hidden transition-all duration-300',
                  'backdrop-blur-xl border-2',
                  isActive
                    ? 'border-primary bg-primary/10 shadow-lg shadow-primary/20'
                    : isHovered
                    ? 'border-border/80 bg-card/95 shadow-xl'
                    : 'border-border/40 bg-card/80'
                )}
                onClick={() => onApply(template)}
              >
                {/* Gradient Accent */}
                <div
                  className={cn(
                    'absolute inset-x-0 top-0 h-1 bg-gradient-to-r opacity-0 transition-opacity',
                    template.color,
                    (isHovered || isActive) && 'opacity-100'
                  )}
                />

                <CardContent className="p-4 space-y-3">
                  {/* Icon & Name */}
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'p-2 rounded-lg bg-gradient-to-br text-white',
                        template.color
                      )}
                    >
                      {template.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm truncate">{template.name}</h4>
                      {isActive && (
                        <Badge variant="default" className="text-[10px] px-1.5 py-0 mt-0.5">
                          <Check className="w-3 h-3 mr-0.5" />
                          Aktiv
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {template.description}
                  </p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1">
                    {template.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 bg-muted/50"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>

                  {/* Preview Stats - shown on hover */}
                  <AnimatePresence>
                    {isHovered && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="pt-2 border-t border-border/50 space-y-1.5"
                      >
                        <div className="flex justify-between text-[10px]">
                          <span className="text-muted-foreground">Übergang</span>
                          <span className="font-medium capitalize">{template.preview.transitionType}</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-muted-foreground">Ø Szene</span>
                          <span className="font-medium">{template.preview.avgSceneDuration}s</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-muted-foreground">Kontrast</span>
                          <span className="font-medium">{template.preview.effects.contrast}%</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                          <span className="text-muted-foreground">Sättigung</span>
                          <span className="font-medium">{template.preview.effects.saturation}%</span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </CardContent>

                {/* Hover Action Hint */}
                <AnimatePresence>
                  {isHovered && !isActive && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm"
                    >
                      <Button size="sm" className={cn('bg-gradient-to-r text-white shadow-lg', template.color)}>
                        <Eye className="w-4 h-4 mr-1.5" />
                        Anwenden
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Current Preview Info */}
      <AnimatePresence>
        {hoveredTemplate && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="p-3 rounded-xl bg-muted/50 border border-border/50"
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Eye className="w-4 h-4" />
              <span>
                Klicke auf ein Template, um es auf alle Szenen anzuwenden. 
                Die Einstellungen können danach noch angepasst werden.
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export { templates };
