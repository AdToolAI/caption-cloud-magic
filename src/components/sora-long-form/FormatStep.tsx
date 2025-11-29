import { Clock, Monitor, Smartphone, Square, Zap, Crown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { calculateProjectCost, getRequiredSceneCount, COST_PER_SECOND } from '@/types/sora-long-form';
import type { Sora2LongFormProject, TargetDuration, AspectRatio, ModelType } from '@/types/sora-long-form';

interface FormatStepProps {
  project: Sora2LongFormProject;
  onUpdate: (updates: Partial<Sora2LongFormProject>) => Promise<void>;
  onNext: () => void;
}

const DURATION_OPTIONS: { value: TargetDuration; label: string; scenes: number }[] = [
  { value: 30, label: '30 Sek.', scenes: 3 },
  { value: 60, label: '60 Sek.', scenes: 5 },
  { value: 120, label: '120 Sek.', scenes: 10 },
];

const ASPECT_OPTIONS: { value: AspectRatio; label: string; icon: React.ComponentType<any>; desc: string }[] = [
  { value: '16:9', label: '16:9', icon: Monitor, desc: 'YouTube, TV' },
  { value: '9:16', label: '9:16', icon: Smartphone, desc: 'TikTok, Reels' },
  { value: '1:1', label: '1:1', icon: Square, desc: 'Instagram' },
];

const MODEL_OPTIONS: { value: ModelType; label: string; icon: React.ComponentType<any>; desc: string; costPerSec: number }[] = [
  { value: 'sora-2-standard', label: 'Standard', icon: Zap, desc: 'Schnell & kostengünstig', costPerSec: 0.25 },
  { value: 'sora-2-pro', label: 'Pro', icon: Crown, desc: 'Höchste Qualität', costPerSec: 0.53 },
];

export function FormatStep({ project, onUpdate, onNext }: FormatStepProps) {
  const sceneCount = getRequiredSceneCount(project.target_duration);
  const estimatedCost = calculateProjectCost(
    Array(sceneCount).fill({ duration: 12 }),
    project.model
  );

  return (
    <div className="space-y-8">
      {/* Video Duration */}
      <div>
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          Videolänge wählen
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {DURATION_OPTIONS.map((option) => {
            const isSelected = project.target_duration === option.value;
            const cost = calculateProjectCost(
              Array(option.scenes).fill({ duration: 12 }),
              project.model
            );

            return (
              <Card
                key={option.value}
                className={cn(
                  'p-6 cursor-pointer transition-all hover:scale-[1.02]',
                  isSelected
                    ? 'border-primary bg-primary/5 ring-2 ring-primary'
                    : 'border-border hover:border-primary/50'
                )}
                onClick={() => onUpdate({ target_duration: option.value })}
              >
                <div className="text-center">
                  <h4 className="text-2xl font-bold">{option.label}</h4>
                  <p className="text-muted-foreground mt-1">{option.scenes} Szenen</p>
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-sm text-muted-foreground">Geschätzte Kosten</p>
                    <p className="text-lg font-semibold text-primary">
                      ~{cost.toFixed(2)}€
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Aspect Ratio */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Seitenverhältnis</h3>
        <div className="grid grid-cols-3 gap-4">
          {ASPECT_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = project.aspect_ratio === option.value;

            return (
              <Card
                key={option.value}
                className={cn(
                  'p-4 cursor-pointer transition-all hover:scale-[1.02]',
                  isSelected
                    ? 'border-primary bg-primary/5 ring-2 ring-primary'
                    : 'border-border hover:border-primary/50'
                )}
                onClick={() => onUpdate({ aspect_ratio: option.value })}
              >
                <div className="text-center">
                  <Icon className="h-8 w-8 mx-auto mb-2" />
                  <h4 className="font-semibold">{option.label}</h4>
                  <p className="text-xs text-muted-foreground">{option.desc}</p>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Model Selection */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Sora 2 Modell</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {MODEL_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = project.model === option.value;

            return (
              <Card
                key={option.value}
                className={cn(
                  'p-4 cursor-pointer transition-all hover:scale-[1.02]',
                  isSelected
                    ? 'border-primary bg-primary/5 ring-2 ring-primary'
                    : 'border-border hover:border-primary/50'
                )}
                onClick={() => onUpdate({ model: option.value })}
              >
                <div className="flex items-center gap-4">
                  <div className={cn(
                    'h-12 w-12 rounded-xl flex items-center justify-center',
                    option.value === 'sora-2-pro' 
                      ? 'bg-gradient-to-br from-amber-500 to-orange-600'
                      : 'bg-gradient-to-br from-blue-500 to-violet-600'
                  )}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">{option.label}</h4>
                      {option.value === 'sora-2-pro' && (
                        <Badge variant="secondary" className="bg-amber-500/20 text-amber-600">Premium</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{option.desc}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {option.costPerSec}€ pro Sekunde
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Summary & Next */}
      <Card className="p-6 bg-primary/5 border-primary/20">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold">Zusammenfassung</h4>
            <p className="text-sm text-muted-foreground mt-1">
              {project.target_duration} Sekunden • {sceneCount} Szenen • {project.aspect_ratio} • Sora 2 {project.model === 'sora-2-pro' ? 'Pro' : 'Standard'}
            </p>
            <p className="text-lg font-semibold text-primary mt-2">
              Geschätzte Kosten: ~{estimatedCost.toFixed(2)}€
            </p>
          </div>
          <Button size="lg" onClick={onNext}>
            Weiter zum Skript
          </Button>
        </div>
      </Card>
    </div>
  );
}
