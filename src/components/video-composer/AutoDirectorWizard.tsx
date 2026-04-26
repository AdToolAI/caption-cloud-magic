import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, Wand2, Loader2, Film, ArrowRight, RefreshCw, Check, ChevronLeft } from 'lucide-react';
import {
  useAutoDirector,
  type AutoDirectorMood,
  type AutoDirectorEnginePref,
  type PlannedScene,
} from '@/hooks/useAutoDirector';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface AutoDirectorWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultLanguage?: string;
  onProjectCreated?: (projectId: string) => void;
}

type Step = 'idea' | 'preview' | 'confirm';

const MOOD_OPTIONS: Array<{ id: AutoDirectorMood; label: string; emoji: string; desc: string }> = [
  { id: 'cinematic', label: 'Cinematic', emoji: '🎬', desc: 'Episch & filmisch' },
  { id: 'hype', label: 'Hype', emoji: '⚡', desc: 'Schnell & energetisch' },
  { id: 'calm', label: 'Calm', emoji: '🌊', desc: 'Ruhig & entspannt' },
  { id: 'corporate', label: 'Corporate', emoji: '💼', desc: 'Professionell & klar' },
  { id: 'playful', label: 'Playful', emoji: '🎨', desc: 'Verspielt & bunt' },
  { id: 'dramatic', label: 'Dramatic', emoji: '🔥', desc: 'Spannungsgeladen' },
];

const DURATION_OPTIONS: Array<{ value: 15 | 30 | 60; label: string }> = [
  { value: 15, label: '15s · Reels/Story' },
  { value: 30, label: '30s · Standard' },
  { value: 60, label: '60s · Long-Form' },
];

const ENGINE_OPTIONS: Array<{ id: AutoDirectorEnginePref; label: string; desc: string }> = [
  { id: 'auto', label: '🎯 Auto-Mix', desc: 'KI wählt optimale Engines pro Szene' },
  { id: 'premium', label: '💎 Premium', desc: 'Kling, Luma, Sora — höchste Qualität' },
  { id: 'budget', label: '💰 Budget', desc: 'Wan, Seedance — günstig & schnell' },
];

const AutoDirectorWizard = ({ open, onOpenChange, defaultLanguage = 'de', onProjectCreated }: AutoDirectorWizardProps) => {
  const [step, setStep] = useState<Step>('idea');
  const [idea, setIdea] = useState('');
  const [mood, setMood] = useState<AutoDirectorMood>('cinematic');
  const [duration, setDuration] = useState<15 | 30 | 60>(30);
  const [enginePref, setEnginePref] = useState<AutoDirectorEnginePref>('auto');
  const [editedScenes, setEditedScenes] = useState<PlannedScene[]>([]);

  const navigate = useNavigate();
  const { planning, executing, plan, generatePlan, execute, setPlan } = useAutoDirector();

  const reset = () => {
    setStep('idea');
    setIdea('');
    setMood('cinematic');
    setDuration(30);
    setEnginePref('auto');
    setEditedScenes([]);
    setPlan(null);
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleGeneratePlan = async () => {
    const result = await generatePlan({
      idea: idea.trim(),
      mood,
      targetDurationSec: duration,
      enginePreference: enginePref,
      language: defaultLanguage,
    });
    if (result) {
      setEditedScenes(result.scenes);
      setStep('preview');
    }
  };

  const handleRegenerate = async () => {
    const result = await generatePlan({
      idea: idea.trim(),
      mood,
      targetDurationSec: duration,
      enginePreference: enginePref,
      language: defaultLanguage,
    });
    if (result) setEditedScenes(result.scenes);
  };

  const handleExecute = async () => {
    const result = await execute({
      idea: idea.trim(),
      mood,
      targetDurationSec: duration,
      enginePreference: enginePref,
      language: defaultLanguage,
      approvedScenes: editedScenes,
      title: `Auto: ${idea.slice(0, 50)}`,
    });
    if (result?.projectId) {
      onProjectCreated?.(result.projectId);
      handleClose(false);
      navigate(`/video-composer?projectId=${result.projectId}&tab=clips`);
    }
  };

  const updateScenePrompt = (idx: number, newPrompt: string) => {
    setEditedScenes((prev) => prev.map((s, i) => (i === idx ? { ...s, aiPrompt: newPrompt } : s)));
  };

  const totalEstimate = editedScenes.reduce((sum, s) => {
    const cost: Record<string, number> = {
      'ai-hailuo': 0.15, 'ai-kling': 0.15, 'ai-sora': 0.25,
      'ai-wan': 0.10, 'ai-seedance': 0.12, 'ai-luma': 0.20,
    };
    return sum + (cost[s.recommendedEngine] ?? 0.15) * s.durationSeconds;
  }, 0);

  const ideaValid = idea.trim().length >= 5;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Sparkles className="h-6 w-6 text-primary" />
            Auto-Director · 1-Klick Movie
          </DialogTitle>
          <DialogDescription>
            Beschreibe deine Idee — die KI baut Storyboard, generiert Szenen und liefert ein fertiges Video.
          </DialogDescription>
        </DialogHeader>

        {/* Progress */}
        <div className="flex items-center gap-2 my-2">
          {(['idea', 'preview', 'confirm'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div
                className={cn(
                  'h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors',
                  step === s ? 'bg-primary text-primary-foreground border-primary' :
                  ['idea', 'preview', 'confirm'].indexOf(step) > i ? 'bg-primary/20 text-primary border-primary' :
                  'bg-muted text-muted-foreground border-border'
                )}
              >
                {['idea', 'preview', 'confirm'].indexOf(step) > i ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              {i < 2 && <div className="flex-1 h-0.5 bg-border" />}
            </div>
          ))}
        </div>

        {/* === STEP 1: IDEA === */}
        {step === 'idea' && (
          <div className="space-y-6 py-4">
            <div>
              <Label htmlFor="idea" className="text-base font-semibold">Deine Video-Idee</Label>
              <Textarea
                id="idea"
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="z.B. Ein Sneaker-Werbespot mit dynamischen City-Aufnahmen und einem coolen Athleten der durch die Straßen läuft."
                rows={4}
                className="mt-2"
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground mt-1">{idea.length}/500 Zeichen · mind. 5</p>
            </div>

            <div>
              <Label className="text-base font-semibold mb-2 block">Stimmung</Label>
              <div className="grid grid-cols-3 gap-2">
                {MOOD_OPTIONS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMood(m.id)}
                    className={cn(
                      'p-3 rounded-lg border-2 text-left transition-all hover:border-primary/50',
                      mood === m.id ? 'border-primary bg-primary/5' : 'border-border'
                    )}
                  >
                    <div className="text-2xl mb-1">{m.emoji}</div>
                    <div className="font-medium text-sm">{m.label}</div>
                    <div className="text-xs text-muted-foreground">{m.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-base font-semibold mb-2 block">Ziel-Dauer</Label>
              <div className="grid grid-cols-3 gap-2">
                {DURATION_OPTIONS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setDuration(d.value)}
                    className={cn(
                      'p-3 rounded-lg border-2 font-medium transition-all hover:border-primary/50',
                      duration === d.value ? 'border-primary bg-primary/5' : 'border-border'
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-base font-semibold mb-2 block">Engine-Strategie</Label>
              <div className="space-y-2">
                {ENGINE_OPTIONS.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setEnginePref(e.id)}
                    className={cn(
                      'w-full p-3 rounded-lg border-2 text-left transition-all hover:border-primary/50',
                      enginePref === e.id ? 'border-primary bg-primary/5' : 'border-border'
                    )}
                  >
                    <div className="font-medium">{e.label}</div>
                    <div className="text-xs text-muted-foreground">{e.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* === STEP 2: PREVIEW PLAN === */}
        {step === 'preview' && plan && (
          <div className="space-y-4 py-4">
            {plan.rationale && (
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-2">
                    <Wand2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <p className="text-sm text-muted-foreground italic">{plan.rationale}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{editedScenes.length} Szenen · ~{totalEstimate.toFixed(2)}€</h3>
              <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={planning}>
                {planning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Plan neu generieren
              </Button>
            </div>

            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
              {editedScenes.map((scene, idx) => (
                <Card key={idx}>
                  <CardContent className="pt-4 pb-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Szene {idx + 1}</Badge>
                        <Badge variant="secondary">{scene.sceneType}</Badge>
                        <Badge>{scene.recommendedEngine.replace('ai-', '')}</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">{scene.durationSeconds}s</span>
                    </div>
                    <Textarea
                      value={scene.aiPrompt}
                      onChange={(e) => updateScenePrompt(idx, e.target.value)}
                      rows={2}
                      className="text-sm"
                    />
                    {scene.textOverlay?.text && (
                      <div className="text-xs text-muted-foreground">
                        💬 Text-Overlay: "{scene.textOverlay.text}" ({scene.textOverlay.position})
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* === STEP 3: CONFIRM === */}
        {step === 'confirm' && (
          <div className="space-y-4 py-4">
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-center gap-2">
                  <Film className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Bereit zur Generierung</h3>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-muted-foreground">Idee:</dt>
                  <dd className="font-medium truncate">{idea}</dd>
                  <dt className="text-muted-foreground">Stimmung:</dt>
                  <dd className="font-medium">{MOOD_OPTIONS.find((m) => m.id === mood)?.label}</dd>
                  <dt className="text-muted-foreground">Dauer:</dt>
                  <dd className="font-medium">{duration}s ({editedScenes.length} Szenen)</dd>
                  <dt className="text-muted-foreground">Engine:</dt>
                  <dd className="font-medium">{ENGINE_OPTIONS.find((e) => e.id === enginePref)?.label}</dd>
                  <dt className="text-muted-foreground">Geschätzte Kosten:</dt>
                  <dd className="font-bold text-primary">{totalEstimate.toFixed(2)} €</dd>
                </dl>
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground text-center">
              Nach Klick werden alle Szenen parallel generiert. Du wirst direkt zum Composer weitergeleitet, wo du den Fortschritt verfolgst.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step !== 'idea' && (
            <Button
              variant="outline"
              onClick={() => setStep(step === 'confirm' ? 'preview' : 'idea')}
              disabled={planning || executing}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Zurück
            </Button>
          )}
          {step === 'idea' && (
            <Button onClick={handleGeneratePlan} disabled={!ideaValid || planning} className="ml-auto">
              {planning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
              Plan generieren
            </Button>
          )}
          {step === 'preview' && (
            <Button onClick={() => setStep('confirm')} disabled={editedScenes.length === 0} className="ml-auto">
              Weiter <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          )}
          {step === 'confirm' && (
            <Button onClick={handleExecute} disabled={executing} className="ml-auto">
              {executing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Movie generieren
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AutoDirectorWizard;
