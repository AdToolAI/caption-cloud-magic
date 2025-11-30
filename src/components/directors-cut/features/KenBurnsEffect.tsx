import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { 
  Move, 
  ZoomIn, 
  ZoomOut, 
  ArrowUp, 
  ArrowDown, 
  ArrowLeft, 
  ArrowRight,
  Sparkles,
  RotateCcw,
  Play
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface KenBurnsKeyframe {
  id: string;
  sceneId?: string; // undefined = global
  startZoom: number; // 1.0 = 100%
  endZoom: number;
  startX: number; // -50 to 50 (percent offset from center)
  startY: number;
  endX: number;
  endY: number;
  easing: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
}

interface KenBurnsEffectProps {
  keyframes: KenBurnsKeyframe[];
  onKeyframesChange: (keyframes: KenBurnsKeyframe[]) => void;
  selectedSceneId?: string;
}

const PRESETS = [
  { 
    id: 'zoom-in-center', 
    name: 'Zoom In', 
    icon: ZoomIn,
    config: { startZoom: 1.0, endZoom: 1.3, startX: 0, startY: 0, endX: 0, endY: 0 }
  },
  { 
    id: 'zoom-out-center', 
    name: 'Zoom Out', 
    icon: ZoomOut,
    config: { startZoom: 1.3, endZoom: 1.0, startX: 0, startY: 0, endX: 0, endY: 0 }
  },
  { 
    id: 'pan-left', 
    name: 'Pan Links', 
    icon: ArrowLeft,
    config: { startZoom: 1.2, endZoom: 1.2, startX: 15, startY: 0, endX: -15, endY: 0 }
  },
  { 
    id: 'pan-right', 
    name: 'Pan Rechts', 
    icon: ArrowRight,
    config: { startZoom: 1.2, endZoom: 1.2, startX: -15, startY: 0, endX: 15, endY: 0 }
  },
  { 
    id: 'pan-up', 
    name: 'Tilt Hoch', 
    icon: ArrowUp,
    config: { startZoom: 1.2, endZoom: 1.2, startX: 0, startY: 15, endX: 0, endY: -15 }
  },
  { 
    id: 'pan-down', 
    name: 'Tilt Runter', 
    icon: ArrowDown,
    config: { startZoom: 1.2, endZoom: 1.2, startX: 0, startY: -15, endX: 0, endY: 15 }
  },
  { 
    id: 'zoom-pan-tl', 
    name: 'Zoom + Pan TL', 
    icon: Sparkles,
    config: { startZoom: 1.0, endZoom: 1.4, startX: -20, startY: -15, endX: 20, endY: 15 }
  },
  { 
    id: 'zoom-pan-br', 
    name: 'Zoom + Pan BR', 
    icon: Sparkles,
    config: { startZoom: 1.0, endZoom: 1.4, startX: 20, startY: 15, endX: -20, endY: -15 }
  },
];

const EASINGS = [
  { id: 'linear', name: 'Linear' },
  { id: 'easeIn', name: 'Ease In' },
  { id: 'easeOut', name: 'Ease Out' },
  { id: 'easeInOut', name: 'Ease In/Out' },
];

export function KenBurnsEffect({ 
  keyframes, 
  onKeyframesChange,
  selectedSceneId 
}: KenBurnsEffectProps) {
  const [isAdvancedMode, setIsAdvancedMode] = useState(false);
  const [previewActive, setPreviewActive] = useState(false);
  
  // Get current keyframe for selected scene (or global)
  const currentKeyframe = keyframes.find(k => 
    selectedSceneId ? k.sceneId === selectedSceneId : !k.sceneId
  );
  
  const hasEffect = !!currentKeyframe;
  
  const applyPreset = (preset: typeof PRESETS[0]) => {
    const newKeyframe: KenBurnsKeyframe = {
      id: `kb_${Date.now()}`,
      sceneId: selectedSceneId,
      ...preset.config,
      easing: 'easeInOut'
    };
    
    // Remove existing keyframe for this scene/global
    const filtered = keyframes.filter(k => 
      selectedSceneId ? k.sceneId !== selectedSceneId : k.sceneId !== undefined
    );
    
    onKeyframesChange([...filtered, newKeyframe]);
  };
  
  const updateKeyframe = (updates: Partial<KenBurnsKeyframe>) => {
    if (!currentKeyframe) return;
    
    const updated = keyframes.map(k => 
      k.id === currentKeyframe.id ? { ...k, ...updates } : k
    );
    onKeyframesChange(updated);
  };
  
  const removeEffect = () => {
    const filtered = keyframes.filter(k => 
      selectedSceneId ? k.sceneId !== selectedSceneId : k.sceneId !== undefined
    );
    onKeyframesChange(filtered);
  };
  
  const resetToDefaults = () => {
    if (currentKeyframe) {
      updateKeyframe({
        startZoom: 1.0,
        endZoom: 1.0,
        startX: 0,
        startY: 0,
        endX: 0,
        endY: 0,
        easing: 'easeInOut'
      });
    }
  };

  return (
    <Card className="bg-background/40 backdrop-blur-xl border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Move className="h-4 w-4 text-primary" />
            Ken Burns Effekt
          </CardTitle>
          <div className="flex items-center gap-2">
            {hasEffect && (
              <Badge variant="secondary" className="text-xs">
                Aktiv
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">
              {selectedSceneId ? `Szene` : 'Global'}
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Professionelle Kamerabewegungen mit Zoom und Pan
        </p>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Presets Grid */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Schnell-Presets</Label>
          <div className="grid grid-cols-4 gap-2">
            {PRESETS.map((preset) => {
              const Icon = preset.icon;
              const isActive = currentKeyframe && 
                currentKeyframe.startZoom === preset.config.startZoom &&
                currentKeyframe.endZoom === preset.config.endZoom &&
                currentKeyframe.startX === preset.config.startX &&
                currentKeyframe.endX === preset.config.endX;
              
              return (
                <motion.button
                  key={preset.id}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => applyPreset(preset)}
                  className={`
                    flex flex-col items-center gap-1 p-2 rounded-lg border transition-all
                    ${isActive 
                      ? 'bg-primary/20 border-primary text-primary' 
                      : 'bg-background/50 border-border/50 hover:border-primary/50 hover:bg-primary/5'
                    }
                  `}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-[10px] font-medium">{preset.name}</span>
                </motion.button>
              );
            })}
          </div>
        </div>
        
        {/* Advanced Mode Toggle */}
        <div className="flex items-center justify-between pt-2 border-t border-border/30">
          <Label className="text-xs">Erweiterte Einstellungen</Label>
          <Switch
            checked={isAdvancedMode}
            onCheckedChange={setIsAdvancedMode}
          />
        </div>
        
        <AnimatePresence>
          {isAdvancedMode && currentKeyframe && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4 overflow-hidden"
            >
              {/* Zoom Controls */}
              <div className="space-y-3 p-3 rounded-lg bg-background/30 border border-border/30">
                <Label className="text-xs font-medium flex items-center gap-2">
                  <ZoomIn className="h-3 w-3" />
                  Zoom
                </Label>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Start</span>
                      <span>{Math.round(currentKeyframe.startZoom * 100)}%</span>
                    </div>
                    <Slider
                      value={[currentKeyframe.startZoom]}
                      min={0.8}
                      max={2.0}
                      step={0.05}
                      onValueChange={([v]) => updateKeyframe({ startZoom: v })}
                      className="cursor-pointer"
                    />
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Ende</span>
                      <span>{Math.round(currentKeyframe.endZoom * 100)}%</span>
                    </div>
                    <Slider
                      value={[currentKeyframe.endZoom]}
                      min={0.8}
                      max={2.0}
                      step={0.05}
                      onValueChange={([v]) => updateKeyframe({ endZoom: v })}
                      className="cursor-pointer"
                    />
                  </div>
                </div>
              </div>
              
              {/* Pan Controls */}
              <div className="space-y-3 p-3 rounded-lg bg-background/30 border border-border/30">
                <Label className="text-xs font-medium flex items-center gap-2">
                  <Move className="h-3 w-3" />
                  Position (Pan)
                </Label>
                
                <div className="grid grid-cols-2 gap-4">
                  {/* Start Position */}
                  <div className="space-y-2">
                    <span className="text-xs text-muted-foreground">Start-Position</span>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>X</span>
                        <span>{currentKeyframe.startX > 0 ? '+' : ''}{currentKeyframe.startX}%</span>
                      </div>
                      <Slider
                        value={[currentKeyframe.startX]}
                        min={-30}
                        max={30}
                        step={1}
                        onValueChange={([v]) => updateKeyframe({ startX: v })}
                        className="cursor-pointer"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Y</span>
                        <span>{currentKeyframe.startY > 0 ? '+' : ''}{currentKeyframe.startY}%</span>
                      </div>
                      <Slider
                        value={[currentKeyframe.startY]}
                        min={-30}
                        max={30}
                        step={1}
                        onValueChange={([v]) => updateKeyframe({ startY: v })}
                        className="cursor-pointer"
                      />
                    </div>
                  </div>
                  
                  {/* End Position */}
                  <div className="space-y-2">
                    <span className="text-xs text-muted-foreground">End-Position</span>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>X</span>
                        <span>{currentKeyframe.endX > 0 ? '+' : ''}{currentKeyframe.endX}%</span>
                      </div>
                      <Slider
                        value={[currentKeyframe.endX]}
                        min={-30}
                        max={30}
                        step={1}
                        onValueChange={([v]) => updateKeyframe({ endX: v })}
                        className="cursor-pointer"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Y</span>
                        <span>{currentKeyframe.endY > 0 ? '+' : ''}{currentKeyframe.endY}%</span>
                      </div>
                      <Slider
                        value={[currentKeyframe.endY]}
                        min={-30}
                        max={30}
                        step={1}
                        onValueChange={([v]) => updateKeyframe({ endY: v })}
                        className="cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Easing */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Bewegungskurve</Label>
                <div className="flex gap-2">
                  {EASINGS.map((easing) => (
                    <Button
                      key={easing.id}
                      size="sm"
                      variant={currentKeyframe.easing === easing.id ? 'default' : 'outline'}
                      onClick={() => updateKeyframe({ easing: easing.id as KenBurnsKeyframe['easing'] })}
                      className="flex-1 text-xs h-8"
                    >
                      {easing.name}
                    </Button>
                  ))}
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={resetToDefaults}
                  className="flex-1 text-xs"
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Zurücksetzen
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={removeEffect}
                  className="text-xs"
                >
                  Entfernen
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* No Effect Info */}
        {!hasEffect && (
          <div className="text-center py-4 text-muted-foreground">
            <Move className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">Wähle ein Preset um den Ken Burns Effekt zu aktivieren</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
