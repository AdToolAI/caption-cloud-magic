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
import type {
  ComposerBriefing,
  ComposerCategory,
  ComposerScene,
  ComposerMode,
  AspectRatio,
  EmotionalTone,
} from '@/types/video-composer';

const CATEGORIES: { id: ComposerCategory; label: string; icon: React.ElementType; desc: string }[] = [
  { id: 'product-ad', label: 'Produktvideo', icon: ShoppingBag, desc: 'Produkte & Kurse bewerben' },
  { id: 'corporate-ad', label: 'Unternehmen', icon: Building2, desc: 'Firmenwerbung & Branding' },
  { id: 'storytelling', label: 'Storytelling', icon: BookOpen, desc: 'Emotionale Geschichten' },
  { id: 'custom', label: 'Editor', icon: Palette, desc: 'Freie Gestaltung' },
];

const TONES: { value: EmotionalTone; label: string }[] = [
  { value: 'professional', label: 'Professionell' },
  { value: 'energetic', label: 'Energisch' },
  { value: 'emotional', label: 'Emotional' },
  { value: 'funny', label: 'Humorvoll' },
  { value: 'luxury', label: 'Luxuriös' },
  { value: 'minimal', label: 'Minimalistisch' },
  { value: 'dramatic', label: 'Dramatisch' },
  { value: 'friendly', label: 'Freundlich' },
];

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
  const [uspInput, setUspInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

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
      toast({ title: 'Bitte gib einen Produkt-/Service-Namen ein', variant: 'destructive' });
      return;
    }

    if (briefing.mode === 'manual') {
      // For manual mode, create empty storyboard and go to next tab
      onUpdateProject({ status: 'storyboard' });
      onGoToStoryboard();
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('compose-video-storyboard', {
        body: {
          briefing,
          category,
          language,
        },
      });

      if (error) throw error;

      if (data?.scenes) {
        onScenesGenerated(data.scenes);
        onUpdateProject({ status: 'storyboard' });
        toast({ title: 'Storyboard generiert!', description: `${data.scenes.length} Szenen erstellt` });
      }
    } catch (err: any) {
      console.error('Storyboard generation error:', err);
      toast({
        title: 'Fehler bei der Storyboard-Generierung',
        description: err.message || 'Bitte versuche es erneut',
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
          <CardTitle className="text-base">Modus</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {([
              { mode: 'ai' as ComposerMode, icon: Wand2, label: 'KI-gestützt', desc: 'KI erstellt das Storyboard automatisch' },
              { mode: 'manual' as ComposerMode, icon: Hand, label: 'Manuell', desc: 'Du baust das Storyboard selbst' },
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
          <CardTitle className="text-base">Kategorie</CardTitle>
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
          <CardTitle className="text-base">Produkt / Service</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Projektname</Label>
              <Input
                value={title}
                onChange={(e) => onUpdateProject({ title: e.target.value })}
                placeholder="z.B. Sommer-Kampagne 2026"
                className="bg-background/50"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Produkt-/Servicename *</Label>
              <Input
                value={briefing.productName}
                onChange={(e) => onUpdateBriefing({ productName: e.target.value })}
                placeholder="z.B. FitPro App"
                className="bg-background/50"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Beschreibung</Label>
            <Textarea
              value={briefing.productDescription}
              onChange={(e) => onUpdateBriefing({ productDescription: e.target.value })}
              placeholder="Was ist dein Produkt / deine Dienstleistung? Was macht es besonders?"
              rows={3}
              className="bg-background/50 resize-none"
            />
          </div>

          {/* USPs */}
          <div className="space-y-1.5">
            <Label className="text-xs">USPs / Vorteile</Label>
            <div className="flex gap-2">
              <Input
                value={uspInput}
                onChange={(e) => setUspInput(e.target.value)}
                placeholder="z.B. 30% schneller als die Konkurrenz"
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
            <Label className="text-xs">Zielgruppe</Label>
            <Input
              value={briefing.targetAudience}
              onChange={(e) => onUpdateBriefing({ targetAudience: e.target.value })}
              placeholder="z.B. Fitness-begeisterte 25-35 Jährige"
              className="bg-background/50"
            />
          </div>
        </CardContent>
      </Card>

      {/* Style & Format */}
      <Card className="border-border/40 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Stil & Format</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Emotionaler Ton</Label>
              <Select
                value={briefing.tone}
                onValueChange={(v) => onUpdateBriefing({ tone: v as EmotionalTone })}
              >
                <SelectTrigger className="bg-background/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Sprache</Label>
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
              <Label className="text-xs">Videodauer</Label>
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
            <Label className="text-xs">Seitenverhältnis</Label>
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
              Storyboard wird generiert...
            </>
          ) : briefing.mode === 'ai' ? (
            <>
              <Sparkles className="h-4 w-4" />
              Storyboard generieren
            </>
          ) : (
            <>
              <ArrowRight className="h-4 w-4" />
              Weiter zum Storyboard
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
