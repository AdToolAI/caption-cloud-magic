import { tx } from '@/lib/i18nText';
import { Check, Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface ProgressStage {
  name: string;
  label: string;
  percentage: number;
}

interface DetailedProgressBarProps {
  currentStage: string;
  progress: number;
  className?: string;
}

const stages: ProgressStage[] = [
  { name: 'queued', label: tx({ de: 'In Warteschlange', en: 'In queue', es: 'En cola' }), percentage: 0 },
  { name: 'initializing', label: tx({ de: 'Initialisierung', en: 'Initialization', es: 'Inicialización' }), percentage: 10 },
  { name: 'rendering', label: tx({ de: 'Rendering', en: 'Rendering', es: 'Representación' }), percentage: 50 },
  { name: 'compressing', label: tx({ de: 'Komprimierung', en: 'Compression', es: 'Compresión' }), percentage: 75 },
  { name: 'uploading', label: tx({ de: 'Upload', en: 'Upload', es: 'Subir' }), percentage: 90 },
  { name: 'completed', label: tx({ de: 'Abgeschlossen', en: 'Completed', es: 'Completado' }), percentage: 100 },
];

export const DetailedProgressBar = ({
  currentStage,
  progress,
  className,
}: DetailedProgressBarProps) => {
  const currentStageIndex = stages.findIndex((s) => s.name === currentStage);

  return (
    <div className={cn('space-y-4', className)}>
      {/* Progress bar */}
      <Progress value={progress} className="h-2" />

      {/* Stage indicators */}
      <div className="flex items-center justify-between">
        {stages.map((stage, index) => {
          const isCompleted = index < currentStageIndex;
          const isCurrent = index === currentStageIndex;
          const isPending = index > currentStageIndex;

          return (
            <div key={stage.name} className="flex flex-col items-center flex-1">
              {/* Stage circle */}
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center mb-2 border-2 transition-all',
                  {
                    'bg-primary border-primary text-primary-foreground': isCompleted,
                    'bg-primary/10 border-primary animate-pulse': isCurrent,
                    'bg-muted border-muted-foreground/20 text-muted-foreground': isPending,
                  }
                )}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4" />
                ) : isCurrent ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span className="text-xs">{index + 1}</span>
                )}
              </div>

              {/* Stage label */}
              <span
                className={cn('text-xs text-center', {
                  'text-foreground font-medium': isCurrent,
                  'text-muted-foreground': !isCurrent,
                })}
              >
                {stage.label}
              </span>

              {/* Connecting line */}
              {index < stages.length - 1 && (
                <div
                  className={cn(
                    'h-0.5 w-full absolute translate-y-[-20px] translate-x-[50%]',
                    {
                      'bg-primary': isCompleted,
                      'bg-muted': !isCompleted,
                    }
                  )}
                  style={{ width: 'calc(100% - 2rem)' }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Current progress text */}
      <div className="text-center">
        <p className="text-sm text-muted-foreground">
          {progress}% {tx({ de: 'abgeschlossen', en: 'completed', es: 'completado' })}
        </p>
      </div>
    </div>
  );
};
