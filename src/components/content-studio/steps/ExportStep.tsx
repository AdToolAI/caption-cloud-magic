import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Sparkles, Video, CheckCircle2, AlertCircle, ListOrdered } from 'lucide-react';
import { QualityPresetSelector } from '@/components/render/QualityPresetSelector';
import { CostEstimationCard } from '@/components/render/CostEstimationCard';
import { useRenderCostEstimation } from '@/hooks/useRenderCostEstimation';
import { useRenderQueue } from '@/hooks/useRenderQueue';
import { useRenderCache } from '@/hooks/useRenderCache';
import { useQualityPresets } from '@/hooks/useQualityPresets';
import type { ContentTemplate } from '@/types/content-studio';

interface ExportStepProps {
  selectedTemplate: ContentTemplate | null;
  customizations: Record<string, any>;
  projectId: string | null;
  onProjectIdChange: (id: string) => void;
}

export const ExportStep = ({ 
  selectedTemplate, 
  customizations, 
  projectId, 
  onProjectIdChange 
}: ExportStepProps) => {
  const [projectName, setProjectName] = useState(customizations.PROJECT_NAME || 'Mein Video');
  const [isRendering, setIsRendering] = useState(false);
  const [queueJobId, setQueueJobId] = useState<string | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [cacheResult, setCacheResult] = useState<any>(null);
  const [isCheckingCache, setIsCheckingCache] = useState(false);
  const { toast } = useToast();

  const { estimateCost, estimation, loading: estimationLoading } = useRenderCostEstimation();
  const { addToQueue, loading: queueLoading } = useRenderQueue();
  const { checkCache, loading: cacheLoading } = useRenderCache();
  const { presets, loading: presetsLoading } = useQualityPresets();

  // Initialize with first global preset
  useEffect(() => {
    if (presets.length > 0 && !selectedPresetId) {
      const defaultPreset = presets.find(p => p.is_global && p.is_default) || presets.find(p => p.is_global);
      if (defaultPreset) {
        setSelectedPresetId(defaultPreset.id);
      }
    }
  }, [presets, selectedPresetId]);

  // Estimate cost when preset or template changes
  useEffect(() => {
    if (selectedPresetId && selectedTemplate) {
      const preset = presets.find(p => p.id === selectedPresetId);
      if (preset) {
        const duration = selectedTemplate.duration_max || 30;
        estimateCost({
          durationSec: duration,
          resolution: preset.config.resolution as '720p' | '1080p' | '4k',
          complexity: 'medium',
          templateId: selectedTemplate.id
        });
      }
    }
  }, [selectedPresetId, selectedTemplate]);

  // Check cache when preset and estimation are ready
  useEffect(() => {
    const checkForCache = async () => {
      if (selectedTemplate && selectedPresetId && estimation) {
        setIsCheckingCache(true);
        const preset = presets.find(p => p.id === selectedPresetId);
        const result = await checkCache({
          templateId: selectedTemplate.id,
          config: { ...customizations, presetId: selectedPresetId, presetConfig: preset?.config },
          engine: estimation.recommended
        });
        setCacheResult(result);
        setIsCheckingCache(false);
      }
    };

    if (estimation) {
      checkForCache();
    }
  }, [selectedTemplate, selectedPresetId, estimation]);

  const handleStartRendering = async () => {
    if (!selectedTemplate || !projectName.trim() || !selectedPresetId) {
      toast({
        title: 'Fehlende Eingaben',
        description: 'Bitte Template, Quality Preset auswählen und Projektnamen eingeben',
        variant: 'destructive'
      });
      return;
    }

    setIsRendering(true);
    
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Nicht eingeloggt');

      // Check if cached version exists
      if (cacheResult?.cached) {
        toast({
          title: 'Cache-Hit!',
          description: `Video direkt verfügbar. ${cacheResult.savedCredits} Credits gespart.`
        });
        // Could redirect to cached video or update project with cached URL
        setIsRendering(false);
        return;
      }

      let currentProjectId = projectId;

      // Create project if not exists
      if (!currentProjectId) {
        const { data: project, error: projectError } = await supabase
          .from('content_projects')
          .insert({
            user_id: user.user.id,
            template_id: selectedTemplate.id,
            content_type: selectedTemplate.content_type,
            project_name: projectName,
            customizations,
            status: 'queued'
          })
          .select()
          .single();

        if (projectError) throw projectError;
        currentProjectId = project.id;
        onProjectIdChange(project.id);
      }

      const preset = presets.find(p => p.id === selectedPresetId);
      const duration = selectedTemplate.duration_max || 30;

      // Add to render queue instead of direct rendering
      const queueData = await addToQueue({
        projectId: currentProjectId,
        templateId: selectedTemplate.id,
        config: {
          ...customizations,
          PROJECT_NAME: projectName,
          qualityPreset: preset?.config
        },
        priority: 5,
        engine: estimation?.recommended || 'auto',
        estimatedDurationSec: duration
      });

      setQueueJobId(queueData.jobId);
      toast({
        title: 'Job zur Queue hinzugefügt',
        description: `Geschätzte Kosten: ${queueData.estimatedCost} Credits`
      });

    } catch (error: any) {
      console.error('Queue error:', error);
      toast({
        title: 'Fehler',
        description: error.message || 'Fehler beim Hinzufügen zur Queue',
        variant: 'destructive'
      });
      setIsRendering(false);
    }
  };

  // Show queue status if job is queued
  if (queueJobId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListOrdered className="w-5 h-5" />
            In Render Queue
          </CardTitle>
          <CardDescription>
            Job-ID: {queueJobId}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              Dein Video wurde zur Render Queue hinzugefügt und wird in Kürze verarbeitet.
              Du kannst den Status in der Render Queue verfolgen.
            </AlertDescription>
          </Alert>
          <Button 
            onClick={() => window.location.href = '/render'} 
            className="w-full mt-4"
            variant="outline"
          >
            Zur Render Queue
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!selectedTemplate) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Export & Rendering</CardTitle>
          <CardDescription>
            Bitte wähle zuerst ein Template aus
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const isLoading = estimationLoading || queueLoading || cacheLoading || presetsLoading || isCheckingCache;
  const canRender = projectName.trim() && selectedPresetId && !isLoading;

  return (
    <div className="space-y-6">
      {/* Project Name */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="w-5 h-5" />
            Export & Rendering
          </CardTitle>
          <CardDescription>
            Wähle Quality Preset und starte das Rendering
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="projectName">Projektname</Label>
            <Input
              id="projectName"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="z.B. Sommer-Sale Video"
              disabled={isRendering}
            />
          </div>

          <div className="p-4 rounded-lg bg-muted/50">
            <h3 className="font-medium mb-2">Zusammenfassung</h3>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>Template: {selectedTemplate.name}</p>
              <p>Format: {selectedTemplate.aspect_ratio}</p>
              <p>Dauer: {selectedTemplate.duration_min}-{selectedTemplate.duration_max}s</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quality Preset Selection */}
      <QualityPresetSelector
        value={selectedPresetId}
        onChange={setSelectedPresetId}
      />

      {/* Cache Status */}
      {isCheckingCache && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertDescription>
            Prüfe Cache...
          </AlertDescription>
        </Alert>
      )}

      {cacheResult?.cached && (
        <Alert className="border-green-500 bg-green-500/10">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <AlertDescription className="text-green-500">
            Cache-Hit! Dieses Video wurde bereits gerendert. 
            <Badge variant="outline" className="ml-2">
              {cacheResult.savedCredits} Credits gespart
            </Badge>
          </AlertDescription>
        </Alert>
      )}

      {/* Cost Estimation */}
      {estimation && !estimationLoading && (
        <CostEstimationCard estimation={estimation} />
      )}

      {estimationLoading && (
        <Card>
          <CardContent className="py-8">
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Berechne Kosten...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Render Button */}
      <Button
        onClick={handleStartRendering}
        disabled={!canRender || isRendering}
        className="w-full"
        size="lg"
      >
        {isRendering ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Wird zur Queue hinzugefügt...
          </>
        ) : cacheResult?.cached ? (
          <>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Aus Cache verwenden
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-4 w-4" />
            Zur Render Queue hinzufügen
            {estimation && (
              <Badge variant="secondary" className="ml-2">
                ~{estimation[estimation.recommended]} Credits
              </Badge>
            )}
          </>
        )}
      </Button>

      {!canRender && !isLoading && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Bitte fülle alle Felder aus: Projektname und Quality Preset
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};
