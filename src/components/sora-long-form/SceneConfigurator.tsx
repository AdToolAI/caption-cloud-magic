import { useState, useRef, useMemo } from 'react';
import { Upload, X, Image as ImageIcon, ArrowLeft, ArrowRight, Loader2, Link2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/useTranslation';
import { formatPriceForLanguage } from '@/lib/currency';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { calculateSceneCost } from '@/types/sora-long-form';
import type { Sora2LongFormProject, Sora2Scene, SceneDuration, TransitionType } from '@/types/sora-long-form';
import SceneShotDirectorPanel from '@/components/video-composer/SceneShotDirectorPanel';
import CinematicStylePresets from '@/components/ai-video/CinematicStylePresets';
import { buildShotPromptSuffix } from '@/lib/shotDirector/buildShotPromptSuffix';
import type { ShotSelection } from '@/config/shotDirector';

interface SceneConfiguratorProps {
  project: Sora2LongFormProject;
  scenes: Sora2Scene[];
  onUpdateScenes: (scenes: Sora2Scene[]) => Promise<void>;
  onNext: () => void;
  onBack: () => void;
}

export function SceneConfigurator({
  project,
  scenes,
  onUpdateScenes,
  onNext,
  onBack,
}: SceneConfiguratorProps) {
  const { toast } = useToast();
  const { t, language } = useTranslation();
  const [selectedScene, setSelectedScene] = useState(0);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const TRANSITION_OPTIONS = useMemo(() => [
    { value: 'none', label: t('soraLf.transitionNone') },
    { value: 'fade', label: t('soraLf.transitionFade') },
    { value: 'crossfade', label: t('soraLf.transitionCrossfade') },
    { value: 'slide', label: t('soraLf.transitionSlide') },
    { value: 'zoom', label: t('soraLf.transitionZoom') },
    { value: 'wipe', label: t('soraLf.transitionWipe') },
  ], [t]);

  const updateScene = (index: number, updates: Partial<Sora2Scene>) => {
    const newScenes = [...scenes];
    newScenes[index] = { ...newScenes[index], ...updates };
    if (updates.duration) {
      newScenes[index].cost_euros = calculateSceneCost(updates.duration, project.model);
    }
    onUpdateScenes(newScenes);
  };

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: t('soraLf.onlyImagesAllowed'), variant: 'destructive' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: t('soraLf.imageTooLargeUpload'), variant: 'destructive' });
      return;
    }

    setUploadingImage(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: t('soraLf.notLoggedInShort'), variant: 'destructive' });
        return;
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${project.id}/scene-1-reference-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('ai-video-reference')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('ai-video-reference')
        .getPublicUrl(fileName);

      updateScene(0, { reference_image_url: publicUrl });
      toast({ title: t('soraLf.scene1ImageUploaded') });
    } catch (error) {
      console.error('Upload error:', error);
      toast({ title: t('soraLf.uploadFailed'), variant: 'destructive' });
    } finally {
      setUploadingImage(false);
    }
  };

  const removeImage = () => {
    updateScene(0, { reference_image_url: undefined });
  };

  const currentScene = scenes[selectedScene];
  const totalCost = scenes.reduce((sum, s) => sum + s.cost_euros, 0);
  const hasReferenceImage = !!scenes[0]?.reference_image_url;

  return (
    <div className="space-y-6">
      <Alert className="bg-primary/5 border-primary/20">
        <Link2 className="h-4 w-4 text-primary" />
        <AlertDescription className="text-sm">
          <span className="font-semibold">{t('soraLf.frameChainTech')}</span> {t('soraLf.frameChainDesc')}
        </AlertDescription>
      </Alert>

      <div>
        <h3 className="text-lg font-semibold mb-4">{t('soraLf.configureScenes')}</h3>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {scenes.map((scene, index) => (
            <button
              key={scene.id}
              onClick={() => setSelectedScene(index)}
              className={cn(
                'flex-shrink-0 w-24 h-16 rounded-lg border-2 transition-all overflow-hidden relative',
                selectedScene === index
                  ? 'border-primary ring-2 ring-primary/50'
                  : 'border-border hover:border-primary/50'
              )}
            >
              {index === 0 && scene.reference_image_url ? (
                <img src={scene.reference_image_url} alt={`${t('soraLf.sceneLabel').replace('{index}', String(index + 1))}`} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center">
                  <span className="text-sm font-medium">{index + 1}</span>
                </div>
              )}
              {index > 0 && (
                <div className="absolute bottom-0 left-0 right-0 bg-primary/80 text-[8px] text-center text-primary-foreground py-0.5">
                  Frame-Chain
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {currentScene && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold flex items-center gap-2">
              {t('soraLf.sceneOf').replace('{current}', String(selectedScene + 1)).replace('{total}', String(scenes.length))}
              <Badge variant="outline">{currentScene.duration} {t('soraLf.secShort')}</Badge>
              {selectedScene > 0 && (
                <Badge variant="secondary" className="text-xs">
                  <Link2 className="h-3 w-3 mr-1" />
                  Frame-Chain
                </Badge>
              )}
            </h4>
            <span className="text-sm text-muted-foreground">
              {t('soraLf.cost')} {formatPriceForLanguage(currentScene.cost_euros, language)}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <Label>{t('soraLf.visualPrompt')}</Label>
                <Textarea
                  value={currentScene.prompt}
                  onChange={(e) => updateScene(selectedScene, { prompt: e.target.value })}
                  placeholder={t('soraLf.promptPlaceholder')}
                  className="mt-1 min-h-[150px]"
                />
                <p className="text-xs text-muted-foreground mt-1">{t('soraLf.describeInEnglish')}</p>
              </div>

              {/* Cinematic Looks (presets) — one-click director styles */}
              <CinematicStylePresets
                value={(currentScene.shot_director ?? {}) as ShotSelection}
                onApply={(selection) => updateScene(selectedScene, { shot_director: selection })}
                compact
              />

              {/* Per-scene Shot Director — framing/angle/movement/lighting */}
              <SceneShotDirectorPanel
                value={(currentScene.shot_director ?? {}) as ShotSelection}
                onChange={(next) => updateScene(selectedScene, { shot_director: next })}
                language={language}
              />

              {/* Final prompt preview */}
              {(() => {
                const suffix = buildShotPromptSuffix((currentScene.shot_director ?? {}) as ShotSelection);
                if (!suffix) return null;
                return (
                  <div className="rounded-md border border-primary/20 bg-primary/5 p-2 text-[11px]">
                    <div className="font-medium text-primary mb-1">
                      {language === 'de' ? 'Finaler Prompt' : language === 'es' ? 'Prompt final' : 'Final prompt'}
                    </div>
                    <div className="text-foreground/80 leading-snug">
                      {currentScene.prompt}{' '}
                      <span className="text-primary/80">{suffix}</span>
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('soraLf.durationLabel')}</Label>
                  <Select
                    value={currentScene.duration.toString()}
                    onValueChange={(v) => updateScene(selectedScene, { duration: parseInt(v) as SceneDuration })}
                  >
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="4">{t('soraLf.fourSeconds')}</SelectItem>
                      <SelectItem value="8">{t('soraLf.eightSeconds')}</SelectItem>
                      <SelectItem value="12">{t('soraLf.twelveSeconds')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('soraLf.transitionLabel')}</Label>
                  <Select
                    value={currentScene.transition_type}
                    onValueChange={(v) => updateScene(selectedScene, { transition_type: v as TransitionType })}
                  >
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TRANSITION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div>
              {selectedScene === 0 ? (
                <>
                  <Label>{t('soraLf.referenceImageI2V')}</Label>
                  <div className="mt-1">
                    {currentScene.reference_image_url ? (
                      <div className="relative aspect-video rounded-lg overflow-hidden border border-border">
                        <img src={currentScene.reference_image_url} alt="Reference" className="w-full h-full object-cover" />
                        <button
                          onClick={removeImage}
                          className="absolute top-2 right-2 p-1.5 bg-background/80 rounded-full hover:bg-destructive hover:text-destructive-foreground transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                        <Badge className="absolute bottom-2 left-2 bg-green-500">
                          <ImageIcon className="h-3 w-3 mr-1" />
                          {t('soraLf.i2vActive')}
                        </Badge>
                      </div>
                    ) : (
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className={cn(
                          'aspect-video rounded-lg border-2 border-dashed border-border cursor-pointer transition-colors',
                          'flex flex-col items-center justify-center gap-2 hover:border-primary/50 hover:bg-primary/5'
                        )}
                      >
                        {uploadingImage ? (
                          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        ) : (
                          <>
                            <Upload className="h-8 w-8 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">{t('soraLf.uploadForI2V')}</p>
                            <p className="text-xs text-muted-foreground">{t('soraLf.maxFileSize')}</p>
                          </>
                        )}
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file);
                        e.target.value = '';
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">{t('soraLf.startImageInfo')}</p>
                </>
              ) : (
                <div className="space-y-3">
                  <Label>{t('soraLf.referenceForScene')}</Label>
                  <div className="aspect-video rounded-lg border border-primary/30 bg-primary/5 flex flex-col items-center justify-center gap-3 p-4">
                    <div className="p-3 bg-primary/10 rounded-full">
                      <Link2 className="h-8 w-8 text-primary" />
                    </div>
                    <div className="text-center">
                      <p className="font-medium text-sm">{t('soraLf.frameChainActive')}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('soraLf.frameChainSceneInfo').replace('{prev}', String(selectedScene))}
                      </p>
                    </div>
                    <Badge variant="outline" className="mt-2">{t('soraLf.seamlessTransition')}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{t('soraLf.visualContinuity')}</p>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      <Card className="p-4 bg-muted/50">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              {hasReferenceImage ? t('soraLf.oneRefImage') : t('soraLf.noRefImage')}
              {' • '}
              {t('soraLf.scenesWithFrameChain').replace('{count}', String(scenes.length - 1))}
              {' • '}
              {t('soraLf.estimatedCost')}: <span className="font-semibold text-primary">{formatPriceForLanguage(totalCost, language)}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('soraLf.back')}
            </Button>
            <Button onClick={onNext} disabled={scenes.some(s => !s.prompt.trim())}>
              {t('soraLf.startGeneration')}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
