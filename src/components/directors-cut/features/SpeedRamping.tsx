import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { 
  Gauge, Plus, Trash2, Play, Pause, RotateCcw, 
  FastForward, Rewind, Zap, Clock
} from 'lucide-react';

export interface SpeedKeyframe {
  id: string;
  sceneId?: string; // undefined = global, string = scene-specific
  time: number;
  speed: number;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

const SPEED_PRESETS = [
  { id: 'slow-mo', name: 'Slow Motion', speed: 0.25, icon: Rewind },
  { id: 'half', name: 'Halbe Geschw.', speed: 0.5, icon: Clock },
  { id: 'normal', name: 'Normal', speed: 1, icon: Play },
  { id: 'fast', name: 'Schnell', speed: 1.5, icon: FastForward },
  { id: 'double', name: 'Doppelt', speed: 2, icon: Zap },
  { id: 'triple', name: 'Dreifach', speed: 3, icon: Gauge },
];

const EASING_OPTIONS = [
  { id: 'linear', name: 'Linear' },
  { id: 'ease-in', name: 'Ease In' },
  { id: 'ease-out', name: 'Ease Out' },
  { id: 'ease-in-out', name: 'Ease In/Out' },
];

interface SpeedRampingProps {
  videoDuration: number;
  keyframes: SpeedKeyframe[];
  onKeyframesChange: (keyframes: SpeedKeyframe[]) => void;
  currentTime: number;
  selectedSceneId?: string;
  sceneDuration?: number;
}

export function SpeedRamping({
  videoDuration,
  keyframes,
  onKeyframesChange,
  currentTime,
  selectedSceneId,
  sceneDuration,
}: SpeedRampingProps) {
  const [selectedKeyframe, setSelectedKeyframe] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Use scene duration if available, otherwise video duration
  const effectiveDuration = selectedSceneId && sceneDuration ? sceneDuration : videoDuration;

  // Filter keyframes for current context (scene-specific or global)
  const currentKeyframes = keyframes.filter(k => 
    selectedSceneId ? k.sceneId === selectedSceneId : !k.sceneId
  );

  const addKeyframe = (time: number = currentTime, speed: number = 1) => {
    const newKeyframe: SpeedKeyframe = {
      id: `kf-${Date.now()}`,
      sceneId: selectedSceneId, // Assign to current scene or global
      time,
      speed,
      easing: 'ease-in-out',
    };
    const updated = [...keyframes, newKeyframe].sort((a, b) => a.time - b.time);
    onKeyframesChange(updated);
    setSelectedKeyframe(newKeyframe.id);
  };

  const removeKeyframe = (id: string) => {
    onKeyframesChange(keyframes.filter(kf => kf.id !== id));
    if (selectedKeyframe === id) setSelectedKeyframe(null);
  };

  const updateKeyframe = (id: string, updates: Partial<SpeedKeyframe>) => {
    onKeyframesChange(
      keyframes.map(kf => kf.id === id ? { ...kf, ...updates } : kf)
    );
  };

  const applyPreset = (speed: number) => {
    if (selectedKeyframe) {
      updateKeyframe(selectedKeyframe, { speed });
    } else {
      addKeyframe(currentTime, speed);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return `${mins}:${secs.padStart(4, '0')}`;
  };

  const getSpeedColor = (speed: number) => {
    if (speed < 0.5) return 'text-blue-500';
    if (speed < 1) return 'text-cyan-500';
    if (speed === 1) return 'text-green-500';
    if (speed < 2) return 'text-yellow-500';
    return 'text-red-500';
  };

  const selectedKf = keyframes.find(kf => kf.id === selectedKeyframe);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Gauge className="h-4 w-4 text-cyan-500" />
          Speed Ramping
          {selectedSceneId ? (
            <Badge variant="default" className="ml-2 bg-primary/20 text-primary text-[10px]">
              Szene
            </Badge>
          ) : (
            <Badge variant="secondary" className="ml-2 text-[10px]">
              Global
            </Badge>
          )}
          <Badge variant="secondary" className="ml-auto">Premium</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Speed Presets */}
        <div className="space-y-2">
          <label className="text-xs font-medium">Geschwindigkeits-Presets</label>
          <div className="grid grid-cols-3 gap-2">
            {SPEED_PRESETS.map((preset) => {
              const Icon = preset.icon;
              return (
                <Button
                  key={preset.id}
                  variant="outline"
                  size="sm"
                  className="h-auto py-2 flex-col"
                  onClick={() => applyPreset(preset.speed)}
                >
                  <Icon className={`h-4 w-4 mb-1 ${getSpeedColor(preset.speed)}`} />
                  <span className="text-[10px]">{preset.name}</span>
                  <span className="text-[9px] text-muted-foreground">{preset.speed}x</span>
                </Button>
              );
            })}
          </div>
        </div>

        {/* Timeline Visualization */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="text-xs font-medium">Keyframes</label>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => addKeyframe()}
            >
              <Plus className="h-3 w-3 mr-1" />
              Keyframe
            </Button>
          </div>
          
          {/* Timeline Bar */}
          <div className="relative h-12 bg-muted rounded-lg overflow-hidden">
            {/* Speed Graph Line */}
            <svg className="absolute inset-0 w-full h-full">
              {currentKeyframes.length > 0 && (
                <path
                  d={`M 0,${24} ${currentKeyframes.map((kf, i) => {
                    const x = (kf.time / effectiveDuration) * 100;
                    const y = 48 - (kf.speed / 3) * 36; // Normalize to 0-3x range
                    return `L ${x}%,${y}`;
                  }).join(' ')} L 100%,${currentKeyframes.length > 0 ? 48 - (currentKeyframes[currentKeyframes.length - 1].speed / 3) * 36 : 24}`}
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              )}
            </svg>

            {/* Keyframe Markers */}
            {currentKeyframes.map((kf) => (
              <button
                key={kf.id}
                onClick={() => setSelectedKeyframe(kf.id === selectedKeyframe ? null : kf.id)}
                className={`
                  absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 transition-all
                  ${selectedKeyframe === kf.id 
                    ? 'bg-primary border-primary scale-125' 
                    : 'bg-background border-primary hover:scale-110'
                  }
                `}
                style={{ left: `${(kf.time / effectiveDuration) * 100}%` }}
              >
                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] whitespace-nowrap">
                  {kf.speed}x
                </span>
              </button>
            ))}

            {/* Current Time Indicator */}
            <div 
              className="absolute top-0 bottom-0 w-0.5 bg-red-500"
              style={{ left: `${(currentTime / effectiveDuration) * 100}%` }}
            />
          </div>
        </div>

        {/* Selected Keyframe Editor */}
        {selectedKf && (
          <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium">Keyframe bearbeiten</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => removeKeyframe(selectedKf.id)}
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>

            {/* Time */}
            <div className="space-y-1">
              <div className="flex justify-between">
                <label className="text-[10px]">Zeit</label>
                <span className="text-[10px] text-muted-foreground">
                  {formatTime(selectedKf.time)}
                </span>
              </div>
              <Slider
                value={[selectedKf.time]}
                onValueChange={(v) => updateKeyframe(selectedKf.id, { time: v[0] })}
                min={0}
                max={effectiveDuration}
                step={0.1}
              />
            </div>

            {/* Speed */}
            <div className="space-y-1">
              <div className="flex justify-between">
                <label className="text-[10px]">Geschwindigkeit</label>
                <span className={`text-[10px] font-medium ${getSpeedColor(selectedKf.speed)}`}>
                  {selectedKf.speed.toFixed(2)}x
                </span>
              </div>
              <Slider
                value={[selectedKf.speed * 100]}
                onValueChange={(v) => updateKeyframe(selectedKf.id, { speed: v[0] / 100 })}
                min={10}
                max={300}
                step={5}
              />
            </div>

            {/* Easing */}
            <div className="space-y-1">
              <label className="text-[10px]">Easing</label>
              <div className="flex gap-1">
                {EASING_OPTIONS.map((option) => (
                  <Button
                    key={option.id}
                    variant={selectedKf.easing === option.id ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 h-6 text-[9px]"
                    onClick={() => updateKeyframe(selectedKf.id, { 
                      easing: option.id as SpeedKeyframe['easing'] 
                    })}
                  >
                    {option.name}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Reset Button */}
        {keyframes.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => { onKeyframesChange([]); setSelectedKeyframe(null); }}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Alle Keyframes entfernen
          </Button>
        )}

        {/* Info */}
        {currentKeyframes.length === 0 && (
          <div className="text-center py-4 text-muted-foreground">
            <Gauge className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs">
              {selectedSceneId 
                ? 'Füge Keyframes für diese Szene hinzu'
                : 'Füge globale Keyframes hinzu um Speed Ramping zu nutzen'
              }
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
