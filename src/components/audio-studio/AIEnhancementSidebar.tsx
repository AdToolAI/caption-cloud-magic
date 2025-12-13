import { useState } from 'react';
import { motion } from 'framer-motion';
import { Wand2, Volume2, Mic, Radio, Sparkles, Loader2, Check, Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface AIEnhancementSidebarProps {
  audioUrl: string;
  onEnhanced: (url: string) => void;
  isFullWidth?: boolean;
}

interface Enhancement {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  enabled: boolean;
  intensity: number;
}

export function AIEnhancementSidebar({ audioUrl, onEnhanced, isFullWidth }: AIEnhancementSidebarProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [enhancements, setEnhancements] = useState<Enhancement[]>([
    {
      id: 'noise',
      label: 'Rauschentfernung',
      description: 'Entfernt Hintergrundgeräusche',
      icon: Volume2,
      enabled: true,
      intensity: 75
    },
    {
      id: 'echo',
      label: 'Hall-Entfernung',
      description: 'Reduziert Raumhall',
      icon: Radio,
      enabled: true,
      intensity: 60
    },
    {
      id: 'voice',
      label: 'Stimm-Optimierung',
      description: 'Klarheit und Wärme',
      icon: Mic,
      enabled: true,
      intensity: 50
    },
    {
      id: 'normalize',
      label: 'Lautstärke-Normalisierung',
      description: 'Konsistente Lautstärke',
      icon: Volume2,
      enabled: true,
      intensity: 100
    }
  ]);

  const toggleEnhancement = (id: string) => {
    setEnhancements(prev => prev.map(e => 
      e.id === id ? { ...e, enabled: !e.enabled } : e
    ));
  };

  const updateIntensity = (id: string, intensity: number) => {
    setEnhancements(prev => prev.map(e => 
      e.id === id ? { ...e, intensity } : e
    ));
  };

  const applyEnhancements = async () => {
    setIsProcessing(true);
    try {
      const enabledEnhancements = enhancements
        .filter(e => e.enabled)
        .map(e => ({ id: e.id, intensity: e.intensity }));

      const { data, error } = await supabase.functions.invoke('audio-studio-enhance', {
        body: { audioUrl, enhancements: enabledEnhancements }
      });

      if (error) throw error;

      const enhancedUrl = data?.enhancedUrl || audioUrl;
      setProcessedUrl(enhancedUrl);
      onEnhanced(enhancedUrl);
      toast.success('Audio erfolgreich optimiert!');
    } catch (error) {
      console.error('Enhancement error:', error);
      toast.error('Fehler bei der Optimierung');
    } finally {
      setIsProcessing(false);
    }
  };

  const presets = [
    { id: 'podcast', label: 'Podcast', desc: 'Optimiert für Sprache' },
    { id: 'interview', label: 'Interview', desc: 'Mehrere Sprecher' },
    { id: 'voiceover', label: 'Voiceover', desc: 'Professionelle Qualität' },
    { id: 'music', label: 'Music Mix', desc: 'Musik + Sprache' }
  ];

  const presetConfigs: Record<string, Record<string, number>> = {
    podcast: { noise: 80, echo: 70, voice: 60, normalize: 100 },
    interview: { noise: 75, echo: 80, voice: 50, normalize: 100 },
    voiceover: { noise: 90, echo: 60, voice: 80, normalize: 100 },
    music: { noise: 40, echo: 30, voice: 20, normalize: 100 }
  };

  const applyPreset = (presetId: string) => {
    const config = presetConfigs[presetId];
    if (!config) return;
    
    setSelectedPreset(presetId);
    setEnhancements(prev => prev.map(e => ({
      ...e,
      enabled: true,
      intensity: config[e.id] ?? e.intensity
    })));
    
    const presetLabel = presets.find(p => p.id === presetId)?.label;
    toast.success(`${presetLabel} Preset aktiviert`);
  };

  return (
    <Card className={`backdrop-blur-xl bg-card/60 border-border/50 ${isFullWidth ? 'p-6' : 'p-4'}`}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">KI-Optimierung</h3>
            <p className="text-xs text-muted-foreground">Studio-Qualität in Sekunden</p>
          </div>
        </div>

        {/* Presets */}
        <div>
          <Label className="text-xs text-muted-foreground mb-2 block">Schnell-Presets</Label>
          <div className={`grid gap-2 ${isFullWidth ? 'grid-cols-4' : 'grid-cols-2'}`}>
            {presets.map((preset) => (
              <motion.button
                key={preset.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => applyPreset(preset.id)}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  selectedPreset === preset.id
                    ? 'bg-primary/10 border-primary ring-2 ring-primary/20'
                    : 'bg-muted/30 border-border/50 hover:border-primary/40'
                }`}
              >
                <span className="text-sm font-medium block">{preset.label}</span>
                <span className="text-xs text-muted-foreground">{preset.desc}</span>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Individual Enhancements */}
        <div className="space-y-4">
          <Label className="text-xs text-muted-foreground">Einzelne Optimierungen</Label>
          
          {enhancements.map((enhancement) => (
            <motion.div
              key={enhancement.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-4 rounded-lg border transition-colors ${
                enhancement.enabled 
                  ? 'bg-primary/5 border-primary/30' 
                  : 'bg-muted/20 border-border/50'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    enhancement.enabled ? 'bg-primary/20' : 'bg-muted/30'
                  }`}>
                    <enhancement.icon className={`w-4 h-4 ${
                      enhancement.enabled ? 'text-primary' : 'text-muted-foreground'
                    }`} />
                  </div>
                  <div>
                    <span className="text-sm font-medium">{enhancement.label}</span>
                    <p className="text-xs text-muted-foreground">{enhancement.description}</p>
                  </div>
                </div>
                <Switch
                  checked={enhancement.enabled}
                  onCheckedChange={() => toggleEnhancement(enhancement.id)}
                />
              </div>
              
              {enhancement.enabled && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="pt-2"
                >
                  <div className="flex items-center gap-3">
                    <Slider
                      value={[enhancement.intensity]}
                      onValueChange={([value]) => updateIntensity(enhancement.id, value)}
                      max={100}
                      step={5}
                      className="flex-1"
                    />
                    <span className="text-xs text-muted-foreground w-8">
                      {enhancement.intensity}%
                    </span>
                  </div>
                </motion.div>
              )}
            </motion.div>
          ))}
        </div>

        {/* Apply Button */}
        <Button
          onClick={applyEnhancements}
          disabled={isProcessing || !enhancements.some(e => e.enabled)}
          className="w-full relative overflow-hidden bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/90 hover:to-cyan-500/90"
          size="lg"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Optimiere Audio...
            </>
          ) : processedUrl ? (
            <>
              <Check className="w-5 h-5 mr-2" />
              Erneut optimieren
            </>
          ) : (
            <>
              <Wand2 className="w-5 h-5 mr-2" />
              KI-Optimierung starten
            </>
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-shimmer" />
        </Button>

        {/* Info after optimization */}
        {processedUrl && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-lg bg-primary/10 border border-primary/30 text-center"
          >
            <p className="text-sm text-primary">
              ✓ Wechsle zum "Vergleich"-Tab für Vorher/Nachher
            </p>
          </motion.div>
        )}
      </div>
    </Card>
  );
}
