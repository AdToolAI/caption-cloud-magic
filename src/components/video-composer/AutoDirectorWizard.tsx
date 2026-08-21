import { tx } from "@/lib/i18nText";
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
  { id: 'cinematic', label: 'Cinematic', emoji: '🎬', desc: tx({ de: 'Episch & filmisch', en: 'Epic & cinematic', es: 'Épico y cinematográfico' }) },
  { id: 'hype', label: 'Hype', emoji: '⚡', desc: tx({ de: 'Schnell & energetisch', en: 'Fast & energetic', es: 'Rápido y enérgico' }) },
  { id: 'calm', label: 'Calm', emoji: '🌊', desc: tx({ de: 'Ruhig & entspannt', en: 'Calm & relaxed', es: 'Tranquilo y relajado' }) },
  { id: 'corporate', label: 'Corporate', emoji: '💼', desc: tx({ de: 'Professionell & klar', en: 'Professional & clear', es: 'Profesional y claro' }) },
  { id: 'playful', label: 'Playful', emoji: '🎨', desc: tx({ de: 'Verspielt & bunt', en: 'Playful & colorful', es: 'Divertido y colorido' }) },
  { id: 'dramatic', label: 'Dramatic', emoji: '🔥', desc: tx({ de: 'Spannungsgeladen', en: 'Tension-filled', es: 'Cargado de tensión' }) },
];

const DURATION_OPTIONS: Array<{ value: 15 | 30 | 60; label: string }> = [
  { value: 15, label: '15s · Reels/Story' },
  { value: 30, label: '30s · Standard' },
  { value: 60, label: '60s · Long-Form' },
];

const ENGINE_OPTIONS: Array<{ id: AutoDirectorEnginePref; label: string; desc: string }> = [
  { id: 'auto', label: '🎯 Auto-Mix', desc: tx({ de: "KI wählt optimale Engines pro Szene", en: "AI selects optimal engines per scene", es: "La IA selecciona los motores óptimos por escena" }) },
  { id: 'premium', label: '💎 Premium', desc: tx({ de: 'Kling, Luma, Sora — höchste Qualität', en: 'Kling, Luma, Sora — highest quality', es: 'Kling, Luma, Sora — máxima calidad' }) },
  { id: 'budget', label: '💰 Budget', desc: tx({ de: 'Wan, Seedance — günstig & schnell', en: 'Wan, Seedance — cheap & fast', es: 'Wan, Seedance — barato y rápido' }) },
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
    // Keep aligned with `src/types/video-composer.ts` CLIP_SOURCE_COSTS (standard tier).
    const cost: Record<string, number> = {
      'ai-hailuo': 0.15, 'ai-kling': 0.18, 'ai-sora': 0.55,
      'ai-wan': 0.12, 'ai-seedance': 0.15, 'ai-luma': 0.20,
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
            {tx({ de: 'Auto-Director · 1-Klick Movie', en: 'Auto-Director · 1-Click Movie', es: 'Auto-Director · Película en 1 clic' })}
          </DialogTitle>
          <DialogDescription>
            {tx({ de: 'Beschreibe deine Idee — die KI baut Storyboard, generiert Szenen und liefert ein fertiges Video.', en: 'Describe your idea — the AI builds a storyboard, generates scenes and delivers a finished video.', es: 'Describe tu idea — la IA crea un guion gráfico, genera escenas y entrega un video terminado.' })}
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
              <Label htmlFor="idea" className="text-base font-semibold">{tx({ de: "Deine Video-Idee", en: "Your video idea", es: "Tu idea de video" })}</Label>
              <Textarea
                id="idea"
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder={tx({ de: "z.B. Ein Sneaker-Werbespot mit dynamischen City-Aufnahmen und einem coolen Athleten der durch die Straßen läuft.", en: "e.g. A sneaker commercial with dynamic city shots and a cool athlete running through the streets.", es: "p. ej. Un anuncio de zapatillas con tomas dinámicas de la ciudad y un atleta genial corriendo por las calles." })}
                rows={4}
                className="mt-2"
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground mt-1">{idea.length}/500 {tx({ de: "Zeichen · mind. 5", en: "characters · min. 5", es: "caracteres · mín. 5" })}</p>
            </div>

            <div>
              <Label className="text-base font-semibold mb-2 block">{tx({ de: "Stimmung", en: "Mood", es: "Estado de ánimo" })}</Label>
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
              <Label className="text-base font-semibold mb-2 block">{tx({ de: "Ziel-Dauer", en: "Target duration", es: "Duración objetivo" })}</Label>
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
              <Label className="text-base font-semibold mb-2 block">{tx({ de: "Engine-Strategie", en: "Engine strategy", es: "Estrategia de motor" })}</Label>
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
            {plan.brandContext?.brandName && (
              <Card className="bg-amber-500/5 border-amber-500/30">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="bg-amber-500 text-amber-950 hover:bg-amber-400">
                      ✨ {tx({ de: "Brand aktiv", en: "Brand active", es: "Marca activa" })}
                    </Badge>
                    <span className="text-sm font-medium">{plan.brandContext.brandName}</span>
                    {plan.brandContext.primaryColor && (
                      <span
                        className="inline-block h-4 w-4 rounded-full border border-border"
                        style={{ backgroundColor: plan.brandContext.primaryColor }}
                        title={plan.brandContext.primaryColor}
                      />
                    )}
                    {plan.brandContext.secondaryColor && (
                      <span
                        className="inline-block h-4 w-4 rounded-full border border-border"
                        style={{ backgroundColor: plan.brandContext.secondaryColor }}
                        title={plan.brandContext.secondaryColor}
                      />
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {tx({ de: "Wird automatisch auf alle Szenen angewendet", en: "Automatically applied to all scenes", es: "Se aplica automáticamente a todas las escenas" })}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

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
              <h3 className="font-semibold">{editedScenes.length} {tx({ de: "Szenen", en: "scenes", es: "escenas" })} · ~{totalEstimate.toFixed(2)}€</h3>
              <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={planning}>
                {planning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                {tx({ de: "Plan neu generieren", en: "Regenerate plan", es: "Regenerar plan" })}
              </Button>
            </div>

            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
              {editedScenes.map((scene, idx) => (
                <Card key={idx}>
                  <CardContent className="pt-4 pb-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{tx({ de: "Szene", en: "Scene", es: "Escena" })} {idx + 1}</Badge>
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
                        💬 {tx({ de: "Text-Overlay", en: "Text overlay", es: "Superposición de texto" })}: "{scene.textOverlay.text}" ({scene.textOverlay.position})
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
                  <h3 className="font-semibold">{tx({ de: "Bereit zur Generierung", en: "Ready to generate", es: "Listo para generar" })}</h3>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-muted-foreground">{tx({ de: "Idee:", en: "Idea:", es: "Idea:" })}</dt>
                  <dd className="font-medium truncate">{idea}</dd>
                  <dt className="text-muted-foreground">{tx({ de: "Stimmung:", en: "Mood:", es: "Estado de ánimo:" })}</dt>
                  <dd className="font-medium">{MOOD_OPTIONS.find((m) => m.id === mood)?.label}</dd>
                  <dt className="text-muted-foreground">{tx({ de: "Dauer:", en: "Duration:", es: "Duración:" })}</dt>
                  <dd className="font-medium">{duration}s ({editedScenes.length} {tx({ de: "Szenen", en: "scenes", es: "escenas" })})</dd>
                  <dt className="text-muted-foreground">{tx({ de: "Engine:", en: "Engine:", es: "Motor:" })}</dt>
                  <dd className="font-medium">{ENGINE_OPTIONS.find((e) => e.id === enginePref)?.label}</dd>
                  <dt className="text-muted-foreground">{tx({ de: "Geschätzte Kosten: ", en: "Estimated cost:", es: "Costo estimado:" })}</dt>
                  <dd className="font-bold text-primary">{totalEstimate.toFixed(2)} €</dd>
                </dl>
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground text-center">
              {tx({ de: "Nach Klick werden alle Szenen parallel generiert. Du wirst direkt zum Composer weitergeleitet, wo du den Fortschritt verfolgst.", en: "After clicking, all scenes are generated in parallel. You will be redirected directly to the composer where you can track progress.", es: "Al hacer clic, todas las escenas se generan en paralelo. Serás redirigido directamente al compositor donde podrás seguir el progreso." })}
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
              <ChevronLeft className="h-4 w-4 mr-1" /> {tx({ de: "Zurück", en: "Back", es: "Atrás" })}
            </Button>
          )}
          {step === 'idea' && (
            <Button onClick={handleGeneratePlan} disabled={!ideaValid || planning} className="ml-auto">
              {planning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
              {tx({ de: "Plan generieren", en: "Generate plan", es: "Generar plan" })}
            </Button>
          )}
          {step === 'preview' && (
            <Button onClick={() => setStep('confirm')} disabled={editedScenes.length === 0} className="ml-auto">
              {tx({ de: "Weiter", en: "Next", es: "Siguiente" })} <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          )}
          {step === 'confirm' && (
            <Button onClick={handleExecute} disabled={executing} className="ml-auto">
              {executing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {tx({ de: "Movie generieren", en: "Generate movie", es: "Generar película" })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AutoDirectorWizard;
