import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Wrench, Clock, Zap, CheckCircle2 } from 'lucide-react';
import type { CreationMode, VideoCategory, CategoryConfig } from '@/types/universal-video-creator';
import { VIDEO_CATEGORIES } from '@/types/universal-video-creator';

interface ModeSelectorProps {
  selectedCategory: VideoCategory;
  selectedMode: CreationMode | null;
  onSelectMode: (mode: CreationMode) => void;
}

export function ModeSelector({ selectedCategory, selectedMode, onSelectMode }: ModeSelectorProps) {
  const categoryConfig = VIDEO_CATEGORIES.find(c => c.id === selectedCategory);

  const modes = [
    {
      id: 'full-service' as CreationMode,
      icon: Sparkles,
      title: 'Full-Service KI',
      subtitle: 'Alles automatisch',
      description: 'Beantworte Fragen im Interview und lass die KI dein komplettes Video erstellen.',
      features: [
        `${categoryConfig?.interviewPhases || 18}-Phasen Interview`,
        'Automatische Script-Generierung',
        'KI-generierte Visuals',
        'Voice-Over & Musik',
        'Multi-Format Export',
      ],
      time: '5-15 Minuten',
      gradient: 'from-primary to-amber-500',
      recommended: true,
    },
    {
      id: 'manual' as CreationMode,
      icon: Wrench,
      title: 'Manueller Modus',
      subtitle: 'Volle Kontrolle',
      description: 'Erstelle dein Video Schritt für Schritt mit voller Kontrolle über jeden Aspekt.',
      features: [
        'Format & Auflösung wählen',
        'Eigenes Script schreiben',
        'Szenen manuell erstellen',
        'Audio individuell anpassen',
        'Untertitel selbst stylen',
      ],
      time: '30-60 Minuten',
      gradient: 'from-cyan-500 to-blue-600',
      recommended: false,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Category badge */}
      <div className="text-center">
        <Badge variant="outline" className="mb-4 px-3 py-1.5 text-sm">
          {categoryConfig?.icon} {categoryConfig?.name}
        </Badge>
        <h2 className="text-2xl font-bold">
          Wie möchtest du dein Video erstellen?
        </h2>
        <p className="text-muted-foreground mt-2">
          Wähle zwischen automatischer KI-Generierung oder manueller Erstellung
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        {modes.map((mode, index) => {
          const Icon = mode.icon;
          const isSelected = selectedMode === mode.id;

          return (
            <motion.div
              key={mode.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card
                className={`
                  relative cursor-pointer p-6 transition-all duration-300 group h-full
                  ${isSelected 
                    ? 'ring-2 ring-primary shadow-lg shadow-primary/20' 
                    : 'hover:shadow-md hover:border-primary/50'
                  }
                `}
                onClick={() => onSelectMode(mode.id)}
              >
                {/* Recommended badge */}
                {mode.recommended && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-gradient-to-r from-primary to-amber-500 text-primary-foreground shadow-lg">
                      <Zap className="w-3 h-3 mr-1" />
                      Empfohlen
                    </Badge>
                  </div>
                )}

                {/* Selected indicator */}
                {isSelected && (
                  <div className="absolute top-4 right-4">
                    <CheckCircle2 className="w-6 h-6 text-primary" />
                  </div>
                )}

                <div className="space-y-4">
                  {/* Icon & Title */}
                  <div className="flex items-start gap-4">
                    <div className={`
                      p-3 rounded-xl bg-gradient-to-br ${mode.gradient}
                      text-white shadow-lg
                    `}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{mode.title}</h3>
                      <p className="text-sm text-muted-foreground">{mode.subtitle}</p>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-muted-foreground">
                    {mode.description}
                  </p>

                  {/* Features */}
                  <ul className="space-y-2">
                    {mode.features.map((feature, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <div className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${mode.gradient}`} />
                        {feature}
                      </li>
                    ))}
                  </ul>

                  {/* Time estimate */}
                  <div className="flex items-center gap-2 pt-2 border-t text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    <span>Geschätzte Zeit: {mode.time}</span>
                  </div>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Selected mode info */}
      {selectedMode && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <Badge className="bg-primary/10 text-primary border-primary/20 px-4 py-2">
            {selectedMode === 'full-service' ? '✨' : '🔧'}{' '}
            {modes.find(m => m.id === selectedMode)?.title} ausgewählt
          </Badge>
        </motion.div>
      )}
    </div>
  );
}
