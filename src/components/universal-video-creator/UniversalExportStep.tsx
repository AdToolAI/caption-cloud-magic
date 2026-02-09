import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Download, 
  Loader2, 
  Check, 
  AlertCircle, 
  Play, 
  Monitor, 
  Smartphone, 
  Square,
  RefreshCw,
  ExternalLink,
  Crown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { VIDEO_CATEGORIES, type VideoCategory } from '@/types/universal-video-creator';

interface ExportFormat {
  id: string;
  aspectRatio: '16:9' | '9:16' | '1:1';
  label: string;
  description: string;
  icon: any;
  width: number;
  height: number;
}

const EXPORT_FORMATS: ExportFormat[] = [
  { 
    id: '16-9', 
    aspectRatio: '16:9', 
    label: 'YouTube / Website', 
    description: '1920×1080', 
    icon: Monitor,
    width: 1920,
    height: 1080
  },
  { 
    id: '9-16', 
    aspectRatio: '9:16', 
    label: 'TikTok / Reels', 
    description: '1080×1920', 
    icon: Smartphone,
    width: 1080,
    height: 1920
  },
  { 
    id: '1-1', 
    aspectRatio: '1:1', 
    label: 'Social Feed', 
    description: '1080×1080', 
    icon: Square,
    width: 1080,
    height: 1080
  },
];

interface UniversalExportStepProps {
  project: any;
  category: VideoCategory;
  userId: string;
  onBack?: () => void;
  onComplete?: (renders: any[]) => void;
}

interface RenderStatus {
  formatId: string;
  status: 'pending' | 'rendering' | 'completed' | 'failed';
  progress: number;
  outputUrl?: string;
  error?: string;
  renderId?: string;
}

export function UniversalExportStep({
  project,
  category,
  userId,
  onBack,
  onComplete,
}: UniversalExportStepProps) {
  const categoryInfo = VIDEO_CATEGORIES.find(c => c.category === category);
  const [selectedFormats, setSelectedFormats] = useState<string[]>(['16-9']);
  const [renderStatuses, setRenderStatuses] = useState<RenderStatus[]>([]);
  const [isRendering, setIsRendering] = useState(false);
  const [allCompleted, setAllCompleted] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const toggleFormat = (formatId: string) => {
    setSelectedFormats(prev => {
      if (prev.includes(formatId)) {
        if (prev.length === 1) return prev; // Keep at least one
        return prev.filter(f => f !== formatId);
      }
      return [...prev, formatId];
    });
  };

  const startRendering = async () => {
    if (selectedFormats.length === 0) {
      toast.error('Bitte wähle mindestens ein Format');
      return;
    }

    setIsRendering(true);
    setAllCompleted(false);

    // Initialize render statuses
    const initialStatuses: RenderStatus[] = selectedFormats.map(formatId => ({
      formatId,
      status: 'pending',
      progress: 0,
    }));
    setRenderStatuses(initialStatuses);

    // Start rendering each format
    for (const formatId of selectedFormats) {
      const format = EXPORT_FORMATS.find(f => f.id === formatId);
      if (!format) continue;

      try {
        // Update status to rendering
        setRenderStatuses(prev => prev.map(s => 
          s.formatId === formatId ? { ...s, status: 'rendering', progress: 10 } : s
        ));

        console.log(`[UniversalExport] Starting render for ${formatId}...`);

        const response = await supabase.functions.invoke('render-universal-video', {
          body: {
            project,
            aspectRatio: format.aspectRatio,
            width: format.width,
            height: format.height,
            userId,
            category,
          }
        });

        if (response.error) {
          throw new Error(response.error.message);
        }

        const { renderId } = response.data;
        
        // Update with render ID and start polling
        setRenderStatuses(prev => prev.map(s => 
          s.formatId === formatId ? { ...s, renderId, progress: 20 } : s
        ));

        // Poll for completion
        pollRenderStatus(formatId, renderId);

      } catch (err) {
        console.error(`[UniversalExport] Error rendering ${formatId}:`, err);
        setRenderStatuses(prev => prev.map(s => 
          s.formatId === formatId ? { 
            ...s, 
            status: 'failed', 
            error: err instanceof Error ? err.message : 'Rendering failed'
          } : s
        ));
      }
    }
  };

  const pollRenderStatus = async (formatId: string, renderId: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await supabase.functions.invoke('check-remotion-progress', {
          body: { renderId }
        });

        if (response.error) {
          throw new Error(response.error.message);
        }

        // Parse nested progress object from check-remotion-progress
        const progressData = response.data?.progress || {};
        const { done, outputFile, overallProgress, fatalErrorEncountered, errors } = progressData;

        if (fatalErrorEncountered) {
          clearInterval(pollInterval);
          const errorMsg = Array.isArray(errors) 
            ? errors.map((e: any) => typeof e === 'string' ? e : e.message || JSON.stringify(e)).join(', ')
            : 'Rendering failed';
          setRenderStatuses(prev => prev.map(s => 
            s.formatId === formatId ? { ...s, status: 'failed', error: errorMsg } : s
          ));
          return;
        }

        // Update progress using overallProgress (0-1 range)
        const progressPercent = typeof overallProgress === 'number' ? overallProgress : 0;
        setRenderStatuses(prev => prev.map(s => 
          s.formatId === formatId ? { ...s, progress: 20 + (progressPercent * 80) } : s
        ));

        if (done && outputFile) {
          clearInterval(pollInterval);
          setRenderStatuses(prev => {
            const updated = prev.map(s => 
              s.formatId === formatId ? { 
                ...s, 
                status: 'completed' as const, 
                progress: 100,
                outputUrl: outputFile 
              } : s
            );
            
            // Check if all are completed
            const allDone = updated.every(s => s.status === 'completed' || s.status === 'failed');
            if (allDone) {
              setIsRendering(false);
              setAllCompleted(true);
              const completedRenders = updated.filter(s => s.status === 'completed');
              if (completedRenders.length > 0) {
                toast.success(`🎬 ${completedRenders.length} Video(s) erfolgreich gerendert!`);
                onComplete?.(completedRenders);
              }
            }
            
            return updated;
          });
        }
      } catch (err) {
        console.error(`[UniversalExport] Poll error for ${formatId}:`, err);
      }
    }, 3000);

    // Store interval ref for cleanup
    pollIntervalRef.current = pollInterval;
  };

  const downloadVideo = (url: string, formatId: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `${categoryInfo?.name || 'video'}-${formatId}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Download gestartet!');
  };

  const completedCount = renderStatuses.filter(s => s.status === 'completed').length;
  const totalProgress = renderStatuses.length > 0 
    ? renderStatuses.reduce((sum, s) => sum + s.progress, 0) / renderStatuses.length 
    : 0;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#F5C76A]/10 border border-[#F5C76A]/30 mb-4">
          <Crown className="h-4 w-4 text-[#F5C76A]" />
          <span className="text-sm font-medium text-[#F5C76A]">{categoryInfo?.name} Export</span>
        </div>
        
        <h2 className="text-3xl font-bold mb-2">
          <span className="bg-gradient-to-r from-[#F5C76A] via-amber-300 to-[#F5C76A] bg-clip-text text-transparent">
            Video exportieren
          </span>
        </h2>
        <p className="text-muted-foreground">
          Wähle die gewünschten Formate und starte das Rendering
        </p>
      </motion.div>

      {/* Format Selection */}
      {!isRendering && !allCompleted && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {EXPORT_FORMATS.map((format) => {
              const Icon = format.icon;
              const isSelected = selectedFormats.includes(format.id);
              
              return (
                <motion.button
                  key={format.id}
                  onClick={() => toggleFormat(format.id)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={cn(
                    "p-6 rounded-2xl border-2 transition-all duration-300 text-left",
                    isSelected 
                      ? "bg-[#F5C76A]/10 border-[#F5C76A] shadow-[0_0_20px_rgba(245,199,106,0.2)]"
                      : "bg-card/40 border-white/10 hover:border-white/20"
                  )}
                >
                  <div className="flex items-center gap-4 mb-3">
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center transition-all",
                      isSelected 
                        ? "bg-[#F5C76A] text-black"
                        : "bg-muted/20 text-muted-foreground"
                    )}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className={cn(
                      "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                      isSelected 
                        ? "bg-[#F5C76A] border-[#F5C76A]"
                        : "border-muted-foreground"
                    )}>
                      {isSelected && <Check className="h-4 w-4 text-black" />}
                    </div>
                  </div>
                  <h3 className={cn(
                    "font-semibold mb-1",
                    isSelected && "text-[#F5C76A]"
                  )}>
                    {format.label}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {format.description} • {format.aspectRatio}
                  </p>
                </motion.button>
              );
            })}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4">
            {onBack && (
              <Button variant="outline" onClick={onBack}>
                Zurück zur Vorschau
              </Button>
            )}
            <Button
              onClick={startRendering}
              disabled={selectedFormats.length === 0}
              className="bg-gradient-to-r from-[#F5C76A] to-amber-500 text-black font-semibold gap-2 ml-auto"
            >
              <Download className="h-5 w-5" />
              {selectedFormats.length} Format{selectedFormats.length !== 1 ? 'e' : ''} rendern
            </Button>
          </div>
        </motion.div>
      )}

      {/* Rendering Progress */}
      {isRendering && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Overall Progress */}
          <div className="bg-card/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-muted-foreground">Gesamtfortschritt</span>
              <span className="text-[#F5C76A] font-bold">{Math.round(totalProgress)}%</span>
            </div>
            <Progress value={totalProgress} className="h-3" />
          </div>

          {/* Individual Format Progress */}
          <div className="space-y-4">
            {renderStatuses.map((status) => {
              const format = EXPORT_FORMATS.find(f => f.id === status.formatId);
              if (!format) return null;
              
              const Icon = format.icon;
              
              return (
                <motion.div
                  key={status.formatId}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={cn(
                    "p-4 rounded-xl border transition-all",
                    status.status === 'completed' && "bg-green-500/10 border-green-500/30",
                    status.status === 'failed' && "bg-destructive/10 border-destructive/30",
                    status.status === 'rendering' && "bg-[#F5C76A]/10 border-[#F5C76A]/30",
                    status.status === 'pending' && "bg-muted/10 border-white/10"
                  )}
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      status.status === 'completed' && "bg-green-500/20 text-green-500",
                      status.status === 'failed' && "bg-destructive/20 text-destructive",
                      status.status === 'rendering' && "bg-[#F5C76A]/20 text-[#F5C76A]",
                      status.status === 'pending' && "bg-muted/20 text-muted-foreground"
                    )}>
                      {status.status === 'completed' ? (
                        <Check className="h-5 w-5" />
                      ) : status.status === 'failed' ? (
                        <AlertCircle className="h-5 w-5" />
                      ) : status.status === 'rendering' ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Icon className="h-5 w-5" />
                      )}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">{format.label}</span>
                        <span className="text-sm text-muted-foreground">
                          {status.status === 'completed' ? 'Fertig' :
                           status.status === 'failed' ? 'Fehlgeschlagen' :
                           status.status === 'rendering' ? `${Math.round(status.progress)}%` :
                           'Warten...'}
                        </span>
                      </div>
                      {status.status === 'rendering' && (
                        <Progress value={status.progress} className="h-1.5" />
                      )}
                      {status.status === 'failed' && status.error && (
                        <p className="text-xs text-destructive mt-1">{status.error}</p>
                      )}
                    </div>

                    {status.status === 'completed' && status.outputUrl && (
                      <Button
                        size="sm"
                        onClick={() => downloadVideo(status.outputUrl!, status.formatId)}
                        className="bg-[#F5C76A] text-black hover:bg-[#F5C76A]/90"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Completed State */}
      {allCompleted && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-8"
        >
          <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
            <Check className="h-10 w-10 text-green-500" />
          </div>
          <h3 className="text-2xl font-bold mb-2 text-green-500">
            Export abgeschlossen!
          </h3>
          <p className="text-muted-foreground mb-6">
            {completedCount} von {renderStatuses.length} Videos erfolgreich gerendert
          </p>

          {/* Download Buttons */}
          <div className="flex flex-wrap justify-center gap-4 mb-8">
            {renderStatuses
              .filter(s => s.status === 'completed' && s.outputUrl)
              .map((status) => {
                const format = EXPORT_FORMATS.find(f => f.id === status.formatId);
                return (
                  <Button
                    key={status.formatId}
                    onClick={() => downloadVideo(status.outputUrl!, status.formatId)}
                    className="bg-[#F5C76A] text-black hover:bg-[#F5C76A]/90 gap-2"
                  >
                    <Download className="h-4 w-4" />
                    {format?.label} herunterladen
                  </Button>
                );
              })}
          </div>

          {/* Actions */}
          <div className="flex justify-center gap-4">
            <Button variant="outline" onClick={onBack}>
              Neues Video erstellen
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setAllCompleted(false);
                setRenderStatuses([]);
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Weitere Formate exportieren
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
