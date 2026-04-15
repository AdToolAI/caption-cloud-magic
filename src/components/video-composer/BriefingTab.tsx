import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ShoppingBag, Building2, BookOpen, Palette,
  Wand2, Hand, Plus, X, ArrowRight, Loader2, Sparkles,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from '@/hooks/useTranslation';
import type {
  ComposerBriefing,
  ComposerCategory,
  ComposerScene,
  ComposerMode,
  AspectRatio,
  EmotionalTone,
} from '@/types/video-composer';

const ASPECT_RATIOS: { value: AspectRatio; label: string; desc: string }[] = [
  { value: '16:9', label: '16:9', desc: 'YouTube / Landscape' },
  { value: '9:16', label: '9:16', desc: 'TikTok / Reels / Shorts' },
  { value: '1:1', label: '1:1', desc: 'Instagram Feed' },
  { value: '4:5', label: '4:5', desc: 'Instagram / Facebook' },
];

interface BriefingTabProps {
  briefing: ComposerBriefing;
  category: ComposerCategory;
  title: string;
  language: string;
  onUpdateBriefing: (b: Partial<ComposerBriefing>) => void;
  onUpdateProject: (p: Record<string, any>) => void;
  onGoToStoryboard: () => void;
  onScenesGenerated: (scenes: ComposerScene[]) => void;
}

export default function BriefingTab({
  briefing,
  category,
  title,
  language,
  onUpdateBriefing,
  onUpdateProject,
  onGoToStoryboard,
  onScenesGenerated,
}: BriefingTabProps) {
  const { t } = useTranslation();
  const [uspInput, setUspInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const CATEGORIES: { id: ComposerCategory; label: string; icon: React.ElementType; desc: string }[] = [
    { id: 'product-ad', label: t('videoComposer.productVideo'), icon: ShoppingBag, desc: t('videoComposer.productVideoDesc') },
    { id: 'corporate-ad', label: t('videoComposer.corporate'), icon: Building2, desc: t('videoComposer.corporateDesc') },
    { id: 'storytelling', label: t('videoComposer.storytelling'), icon: BookOpen, desc: t('videoComposer.storytellingDesc') },
    { id: 'custom', label: t('videoComposer.editor'), icon: Palette, desc: t('videoComposer.editorDesc') },
  ];

  const TONES: { value: EmotionalTone; label: string }[] = [
    { value: 'professional', label: t('videoComposer.tones.professional') },
    { value: 'energetic', label: t('videoComposer.tones.energetic') },
    { value: 'emotional', label: t('videoComposer.tones.emotional') },
    { value: 'funny', label: t('videoComposer.tones.funny') },
    { value: 'luxury', label: t('videoComposer.tones.luxury') },
    { value: 'minimal', label: t('videoComposer.tones.minimal') },
    { value: 'dramatic', label: t('videoComposer.tones.dramatic') },
    { value: 'friendly', label: t('videoComposer.tones.friendly') },
  ];

  const addUsp = () => {
    if (uspInput.trim()) {
      onUpdateBriefing({ usps: [...briefing.usps, uspInput.trim()] });
      setUspInput('');
    }
  };

  const removeUsp = (index: number) => {
    onUpdateBriefing({ usps: briefing.usps.filter((_, i) => i !== index) });
  };

  const handleGenerateStoryboard = async () => {
    if (!briefing.productName.trim()) {
      toast({ title: t('videoComposer.enterProductName'), variant: 'destructive' });
      return;
    }

    if (briefing.mode === 'manual') {
      onUpdateProject({ status: 'storyboard' });
      onGoToStoryboard();
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('compose-video-storyboard', {
        body: { briefing, category, language },
      });

      if (error) throw error;
      if (data?.scenes) {
        onScenesGenerated(data.scenes);
        onUpdateProject({ status: 'storyboard' });
        toast({ title: t('videoComposer.storyboardGenerated'), description: `${data.scenes.length} ${t('videoComposer.scenesCreated')}` });
      }
    } catch (err: any) {
      console.error('Storyboard generation error:', err);
      toast({
        title: t('videoComposer.storyboardError'),
        description: err.message || t('videoComposer.tryAgain'),
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const canProceed = briefing.productName.trim().length > 0;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Mode Selection */}
      <Card className="border-border/40 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('videoComposer.mode')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {([
              { mode: 'ai' as ComposerMode, icon: Wand2, label: t('videoComposer.aiAssisted'), desc: t('videoComposer.aiAssistedDesc') },
              { mode: 'manual' as ComposerMode, icon: Hand, label: t('videoComposer.manual'), desc: t('videoComposer.manualDesc') },
            ]).map(({ mode, icon: Icon, label, desc }) => (
              <button
                key={mode}
                onClick={() => onUpdateBriefing({ mode })}
                className={`p-4 rounded-lg border text-left transition-all ${
                  briefing.mode === mode
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                    : 'border-border/40 hover:border-border'
                }`}
              >
                <Icon className={`h-5 w-5 mb-2 ${briefing.mode === mode ? 'text-primary' : 'text-muted-foreground'}`} />
                <p className="font-medium text-sm">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Category Selection */}
      <Card className="border-border/40 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('videoComposer.category')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {CATEGORIES.map(({ id, label, icon: Icon, desc }) => (
              <button
                key={id}
                onClick={() => onUpdateProject({ category: id })}
                className={`p-3 rounded-lg border text-left transition-all ${
                  category === id
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                    : 'border-border/40 hover:border-border'
                }`}
              >
                <Icon className={`h-4 w-4 mb-1.5 ${category === id ? 'text-primary' : 'text-muted-foreground'}`} />
                <p className="font-medium text-xs">{label}</p>
                <p className="text-[10px] text-muted-foreground">{desc}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Project Basics */}
      <Card className="border-border/40 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('videoComposer.productService')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('videoComposer.projectName')}</Label>
              <Input
                value={title}
                onChange={(e) => onUpdateProject({ title: e.target.value })}
                placeholder={t('videoComposer.projectNamePlaceholder')}
                className="bg-background/50"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('videoComposer.productNameLabel')}</Label>
              <Input
                value={briefing.productName}
                onChange={(e) => onUpdateBriefing({ productName: e.target.value })}
                placeholder={t('videoComposer.productNamePlaceholder')}
                className="bg-background/50"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{t('videoComposer.description')}</Label>
            <Textarea
              value={briefing.productDescription}
              onChange={(e) => onUpdateBriefing({ productDescription: e.target.value })}
              placeholder={t('videoComposer.descriptionPlaceholder')}
              rows={3}
              className="bg-background/50 resize-none"
            />
          </div>

          {/* USPs */}
          <div className="space-y-1.5">
            <Label className="text-xs">{t('videoComposer.usps')}</Label>
            <div className="flex gap-2">
              <Input
                value={uspInput}
                onChange={(e) => setUspInput(e.target.value)}
                placeholder={t('videoComposer.uspPlaceholder')}
                className="bg-background/50"
                onKeyDown={(e) => e.key === 'Enter' && addUsp()}
              />
              <Button size="sm" variant="outline" onClick={addUsp}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            {briefing.usps.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {briefing.usps.map((usp, i) => (
                  <Badge key={i} variant="secondary" className="text-xs gap-1">
                    {usp}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => removeUsp(i)} />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">{t('videoComposer.targetAudience')}</Label>
            <Input
              value={briefing.targetAudience}
              onChange={(e) => onUpdateBriefing({ targetAudience: e.target.value })}
              placeholder={t('videoComposer.targetAudiencePlaceholder')}
              className="bg-background/50"
            />
          </div>
        </CardContent>
      </Card>

      {/* Style & Format */}
      <Card className="border-border/40 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('videoComposer.styleFormat')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('videoComposer.emotionalTone')}</Label>
              <Select
                value={briefing.tone}
                onValueChange={(v) => onUpdateBriefing({ tone: v as EmotionalTone })}
              >
                <SelectTrigger className="bg-background/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONES.map((tone) => (
                    <SelectItem key={tone.value} value={tone.value}>{tone.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('videoComposer.language')}</Label>
              <Select
                value={language}
                onValueChange={(v) => onUpdateProject({ language: v })}
              >
                <SelectTrigger className="bg-background/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="de">Deutsch</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Duration Slider */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <Label className="text-xs">{t('videoComposer.videoDuration')}</Label>
              <span className="text-xs font-medium text-primary">{briefing.duration}s</span>
            </div>
            <Slider
              value={[briefing.duration]}
              onValueChange={([v]) => onUpdateBriefing({ duration: v })}
              min={15}
              max={90}
              step={5}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>15s</span>
              <span>90s</span>
            </div>
          </div>

          {/* Aspect Ratio */}
          <div className="space-y-1.5">
            <Label className="text-xs">{t('videoComposer.aspectRatio')}</Label>
            <div className="grid grid-cols-4 gap-2">
              {ASPECT_RATIOS.map(({ value, label, desc }) => (
                <button
                  key={value}
                  onClick={() => onUpdateBriefing({ aspectRatio: value })}
                  className={`p-2 rounded-lg border text-center transition-all ${
                    briefing.aspectRatio === value
                      ? 'border-primary bg-primary/5'
                      : 'border-border/40 hover:border-border'
                  }`}
                >
                  <p className="font-medium text-xs">{label}</p>
                  <p className="text-[10px] text-muted-foreground">{desc}</p>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action */}
      <div className="flex justify-end">
        <Button
          onClick={handleGenerateStoryboard}
          disabled={!canProceed || isGenerating}
          className="gap-2"
          size="lg"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('videoComposer.generatingStoryboard')}
            </>
          ) : briefing.mode === 'ai' ? (
            <>
              <Sparkles className="h-4 w-4" />
              {t('videoComposer.generateStoryboard')}
            </>
          ) : (
            <>
              <ArrowRight className="h-4 w-4" />
              {t('videoComposer.continueToStoryboard')}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
