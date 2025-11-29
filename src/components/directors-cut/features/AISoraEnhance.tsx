import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Wand2, Film, Palette, Clock, Zap, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAIVideoWallet } from '@/hooks/useAIVideoWallet';
import type { SceneAnalysis } from '@/types/directors-cut';

interface AISoraEnhanceProps {
  scene: SceneAnalysis;
  videoUrl: string;
  aspectRatio: '16:9' | '9:16' | '1:1';
  projectId?: string;
  onEnhancementComplete: (newVideoUrl: string) => void;
}

interface EnhancementPreset {
  id: string;
  label: string;
  icon: React.ReactNode;
  prompt: string;
  description: string;
}

const PRESETS: EnhancementPreset[] = [
  {
    id: 'anime',
    label: 'Anime-Stil',
    icon: <Palette className="h-4 w-4" />,
    prompt: 'Transform into beautiful anime style with vibrant colors, cel-shaded lighting, and expressive animation. Studio Ghibli inspired aesthetic.',
    description: 'Verwandelt die Szene in einen Anime-Look',
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    icon: <Film className="h-4 w-4" />,
    prompt: 'Cinematic film look with dramatic lighting, shallow depth of field, anamorphic lens flares, and professional color grading. Hollywood blockbuster quality.',
    description: 'Professioneller Film-Look mit dramatischer Beleuchtung',
  },
  {
    id: 'slowmo',
    label: 'Slow Motion',
    icon: <Clock className="h-4 w-4" />,
    prompt: 'Elegant slow motion movement with smooth interpolated frames, graceful motion blur, and cinematic timing. Every detail visible.',
    description: 'Elegante Zeitlupe mit flüssiger Bewegung',
  },
  {
    id: 'dreamy',
    label: 'Dreamy',
    icon: <Sparkles className="h-4 w-4" />,
    prompt: 'Dreamy ethereal atmosphere with soft focus, gentle light leaks, pastel tones, and magical floating particles. Surreal and enchanting.',
    description: 'Traumhafte Atmosphäre mit weichem Licht',
  },
];

const COST_PER_SECOND = {
  'sora-2-standard': 0.25,
  'sora-2-pro': 0.53,
};

export function AISoraEnhance({ 
  scene, 
  videoUrl, 
  aspectRatio,
  projectId,
  onEnhancementComplete 
}: AISoraEnhanceProps) {
  const { wallet, refetch: refetchWallet } = useAIVideoWallet();
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [model, setModel] = useState<'sora-2-standard' | 'sora-2-pro'>('sora-2-standard');
  const [isProcessing, setIsProcessing] = useState(false);
  const [enhancementId, setEnhancementId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'processing' | 'completed' | 'failed'>('idle');

  // Calculate scene duration and snap to valid Sora 2 duration
  const rawDuration = scene.end_time - scene.start_time;
  const duration: 4 | 8 | 12 = rawDuration <= 4 ? 4 : rawDuration <= 8 ? 8 : 12;
  
  // Calculate cost
  const cost = duration * COST_PER_SECOND[model];
  const hasEnoughCredits = wallet && wallet.balance_euros >= cost;

  // Get the effective prompt
  const getEffectivePrompt = () => {
    if (customPrompt.trim()) return customPrompt;
    const preset = PRESETS.find(p => p.id === selectedPreset);
    return preset?.prompt || '';
  };

  // Extract first frame from video
  const extractFirstFrame = async (): Promise<string> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.src = videoUrl;
      video.currentTime = scene.start_time;

      video.onloadeddata = () => {
        video.onseeked = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 1280;
          canvas.height = aspectRatio === '16:9' ? 720 : aspectRatio === '9:16' ? 2276 : 1280;
          
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }
          
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
          resolve(dataUrl);
        };
      };

      video.onerror = () => reject(new Error('Failed to load video'));
    });
  };

  // Upload frame to storage
  const uploadFrameToStorage = async (base64Data: string): Promise<string> => {
    const blob = await fetch(base64Data).then(r => r.blob());
    const fileName = `enhancement-frames/${crypto.randomUUID()}.jpg`;
    
    const { data, error } = await supabase.storage
      .from('video-assets')
      .upload(fileName, blob, { contentType: 'image/jpeg' });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from('video-assets')
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  };

  // Start enhancement
  const handleEnhance = async () => {
    const prompt = getEffectivePrompt();
    if (!prompt) {
      toast.error('Bitte wähle einen Stil oder gib einen Prompt ein');
      return;
    }

    if (!hasEnoughCredits) {
      toast.error('Nicht genügend Credits');
      return;
    }

    setIsProcessing(true);
    setStatus('processing');
    setProgress(10);

    try {
      // Extract and upload first frame
      toast.info('Frame wird extrahiert...');
      const frameBase64 = await extractFirstFrame();
      setProgress(30);

      toast.info('Frame wird hochgeladen...');
      const frameUrl = await uploadFrameToStorage(frameBase64);
      setProgress(50);

      toast.info('KI-Überarbeitung wird gestartet...');
      
      const { data, error } = await supabase.functions.invoke('director-cut-sora-enhance', {
        body: {
          scene_id: scene.id,
          project_id: projectId,
          image_url: frameUrl,
          prompt,
          duration,
          model,
          aspect_ratio: aspectRatio,
        },
      });

      if (error) throw error;

      if (!data.ok) {
        throw new Error(data.message || data.error);
      }

      setEnhancementId(data.enhancement_id);
      setProgress(70);
      toast.success(`KI-Überarbeitung gestartet. Geschätzte Zeit: ${Math.ceil(data.estimated_time_seconds / 60)} Minuten`);
      refetchWallet();

    } catch (error) {
      console.error('Enhancement error:', error);
      toast.error(error instanceof Error ? error.message : 'Fehler bei der KI-Überarbeitung');
      setStatus('failed');
      setIsProcessing(false);
    }
  };

  // Subscribe to enhancement updates
  useEffect(() => {
    if (!enhancementId) return;

    const channel = supabase
      .channel(`enhancement-${enhancementId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'director_cut_enhancements',
          filter: `id=eq.${enhancementId}`,
        },
        (payload) => {
          const enhancement = payload.new as any;
          console.log('Enhancement update:', enhancement);

          if (enhancement.status === 'completed' && enhancement.generated_video_url) {
            setStatus('completed');
            setProgress(100);
            setIsProcessing(false);
            toast.success('KI-Überarbeitung abgeschlossen!');
            onEnhancementComplete(enhancement.generated_video_url);
          } else if (enhancement.status === 'failed') {
            setStatus('failed');
            setIsProcessing(false);
            toast.error('KI-Überarbeitung fehlgeschlagen. Credits wurden erstattet.');
            refetchWallet();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enhancementId, onEnhancementComplete, refetchWallet]);

  // Progress simulation
  useEffect(() => {
    if (status !== 'processing' || progress >= 90) return;

    const interval = setInterval(() => {
      setProgress(p => Math.min(p + 2, 90));
    }, 3000);

    return () => clearInterval(interval);
  }, [status, progress]);

  return (
    <Card className="backdrop-blur-xl bg-card/50 border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-5 w-5 text-primary" />
          KI-Überarbeitung mit Sora 2
          <Badge variant="secondary" className="ml-auto">
            {duration}s Szene
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Processing State */}
        <AnimatePresence mode="wait">
          {status === 'processing' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-sm">Sora 2 generiert das Video...</span>
              </div>
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground">
                Dies kann 5-10 Minuten dauern. Sie können diese Seite verlassen.
              </p>
            </motion.div>
          )}

          {status === 'completed' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20"
            >
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <span className="text-sm text-green-600">Überarbeitung abgeschlossen!</span>
            </motion.div>
          )}

          {status === 'failed' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20"
            >
              <AlertCircle className="h-5 w-5 text-destructive" />
              <span className="text-sm text-destructive">Fehler aufgetreten. Credits wurden erstattet.</span>
            </motion.div>
          )}
        </AnimatePresence>

        {status === 'idle' && (
          <>
            {/* Presets */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Stil-Presets</Label>
              <div className="grid grid-cols-2 gap-2">
                {PRESETS.map((preset) => (
                  <motion.button
                    key={preset.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setSelectedPreset(preset.id === selectedPreset ? null : preset.id);
                      setCustomPrompt('');
                    }}
                    className={`flex items-center gap-2 p-3 rounded-lg border transition-all text-left ${
                      selectedPreset === preset.id
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border/50 bg-background/50 hover:border-primary/50'
                    }`}
                  >
                    {preset.icon}
                    <div>
                      <div className="text-sm font-medium">{preset.label}</div>
                      <div className="text-xs text-muted-foreground">{preset.description}</div>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Custom Prompt */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Oder eigener Prompt</Label>
              <Textarea
                value={customPrompt}
                onChange={(e) => {
                  setCustomPrompt(e.target.value);
                  setSelectedPreset(null);
                }}
                placeholder="Beschreibe die gewünschte Transformation auf Englisch..."
                className="resize-none h-20 bg-background/50"
              />
            </div>

            {/* Model Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Modell</Label>
              <RadioGroup
                value={model}
                onValueChange={(v) => setModel(v as 'sora-2-standard' | 'sora-2-pro')}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="sora-2-standard" id="standard" />
                  <Label htmlFor="standard" className="cursor-pointer">
                    <span className="font-medium">Standard</span>
                    <span className="text-xs text-muted-foreground ml-1">
                      (€{COST_PER_SECOND['sora-2-standard'].toFixed(2)}/s)
                    </span>
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="sora-2-pro" id="pro" />
                  <Label htmlFor="pro" className="cursor-pointer">
                    <span className="font-medium">Pro</span>
                    <Badge variant="secondary" className="ml-1 text-xs">Beste Qualität</Badge>
                    <span className="text-xs text-muted-foreground ml-1">
                      (€{COST_PER_SECOND['sora-2-pro'].toFixed(2)}/s)
                    </span>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Cost & Action */}
            <div className="flex items-center justify-between pt-2 border-t border-border/50">
              <div className="space-y-1">
                <div className="text-sm">
                  <span className="text-muted-foreground">Kosten:</span>{' '}
                  <span className="font-semibold">€{cost.toFixed(2)}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Guthaben: €{wallet?.balance_euros.toFixed(2) || '0.00'}
                </div>
              </div>

              <Button
                onClick={handleEnhance}
                disabled={!getEffectivePrompt() || !hasEnoughCredits || isProcessing}
                className="gap-2"
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                Mit Sora 2 überarbeiten
              </Button>
            </div>

            {!hasEnoughCredits && (
              <p className="text-xs text-destructive">
                Nicht genügend Guthaben. Bitte laden Sie Credits auf.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
