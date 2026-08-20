import { tx } from "@/lib/i18nText";
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ShieldCheck, AlertTriangle, ChevronRight, Sparkles, Lock, Target } from 'lucide-react';
import { useUpsertAutopilotBrief, useToggleAutopilot, type UpsertBriefInput } from '@/hooks/useAutopilot';
import { AutopilotGoalBriefingStep, type GoalBriefingValue } from './AutopilotGoalBriefingStep';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCompleted?: () => void;
}

const PLATFORMS = ['instagram', 'tiktok', 'x', 'facebook', 'linkedin', 'youtube'] as const;
const LANGUAGES = ['de', 'en', 'es'] as const;
const TONALITIES = ['professional', 'playful', 'bold', 'minimal', 'editorial', 'inspirational'];

const aupText = () => tx({
  de: `KURZFASSUNG DER ACCEPTABLE USE POLICY

5. Alle KI-Inhalte werden automatisch als "Made with AI" gekennzeichnet (C2PA + Caption-Tag).
6. Strike-System: Soft (Hinweis) → Hard (7 Tage Sperre ab 2 aktiven) → Critical (sofortige Account-Löschung ohne Rückerstattung).
7. Missbrauchsversuche (Prompt-Injection, Bypass-Versuche, Bulk-Spam, Hate Speech, NSFW, illegale Inhalte) führen zur fristlosen Löschung deines Accounts ohne jede Rückerstattung.
8. Vollständiger AUP-Text unter /legal/autopilot-aup — durch Aktivierung bestätigst du, diesen vollständig gelesen und akzeptiert zu haben.`,
  en: `ACCEPTABLE USE POLICY — SHORT VERSION

5. All AI content is automatically labelled "Made with AI" (C2PA + caption tag).
6. Strike system: Soft (notice) → Hard (7-day suspension from 2 active strikes) → Critical (immediate account deletion without refund).
7. Abuse attempts (prompt injection, bypass attempts, bulk spam, hate speech, NSFW, illegal content) lead to immediate deletion of your account without any refund.
8. Full AUP text at /legal/autopilot-aup — by activating you confirm that you have read and accepted it in full.`,
  es: `RESUMEN DE LA POLÍTICA DE USO ACEPTABLE

5. Todo el contenido de IA se etiqueta automáticamente como "Made with AI" (C2PA + etiqueta de subtítulo).
6. Sistema de sanciones: leve (aviso) → grave (7 días de bloqueo a partir de 2 activas) → crítica (eliminación inmediata de la cuenta sin reembolso).
7. Los intentos de abuso (inyección de prompts, elusión, spam masivo, discurso de odio, NSFW, contenido ilegal) conllevan la eliminación inmediata de tu cuenta sin reembolso alguno.
8. Texto completo de la AUP en /legal/autopilot-aup: al activar confirmas que lo has leído y aceptado íntegramente.`,
});

export function AutopilotBriefWizard({ open, onOpenChange, onCompleted }: Props) {
  const [step, setStep] = useState(1);
  const upsert = useUpsertAutopilotBrief();
  const toggle = useToggleAutopilot();

  // Brief state
  const [pillarsText, setPillarsText] = useState('');
  const [forbiddenText, setForbiddenText] = useState('');
  const [tonality, setTonality] = useState('professional');
  const [platforms, setPlatforms] = useState<string[]>(['instagram']);
  const [languages, setLanguages] = useState<string[]>(['de']);
  const [postsPerWeek, setPostsPerWeek] = useState(5);
  const [budget, setBudget] = useState(2000);
  const [autoPublish, setAutoPublish] = useState(false);

  // Session H — Goal briefing state
  const [goal, setGoal] = useState<GoalBriefingValue>({
    channel_goal: 'engagement',
    weekly_budget_eur: 25,
    content_mix: { ai_video: 33, stock_reel: 33, static: 34 },
    target_audience: '',
    usp: '',
  });

  // AUP state
  const [scrolled, setScrolled] = useState(false);
  const [aupAccepted, setAupAccepted] = useState(false);
  const [noDeepfake, setNoDeepfake] = useState(false);
  const [noCopyright, setNoCopyright] = useState(false);
  const [acceptTermination, setAcceptTermination] = useState(false);

  // Hard confirmation
  const [confirmText, setConfirmText] = useState('');
  const CONFIRM_PHRASE = 'ICH AKTIVIERE';

  const briefValid =
    pillarsText.trim().split(',').filter(Boolean).length > 0 &&
    platforms.length > 0 &&
    languages.length > 0 &&
    budget >= 100;

  const aupValid = scrolled && aupAccepted && noDeepfake && noCopyright && acceptTermination;
  const confirmValid = confirmText.trim() === CONFIRM_PHRASE;

  const togglePlatform = (p: string) =>
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  const toggleLang = (l: string) =>
    setLanguages((prev) => (prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]));

  const goalValid = goal.target_audience.trim().length > 0 && goal.usp.trim().length > 0 && goal.weekly_budget_eur >= 5;

  const handleSaveBrief = async () => {
    const input: UpsertBriefInput = {
      topic_pillars: pillarsText.split(',').map((s) => s.trim()).filter(Boolean),
      forbidden_topics: forbiddenText.split(',').map((s) => s.trim()).filter(Boolean),
      tonality,
      platforms,
      posts_per_week: Object.fromEntries(platforms.map((p) => [p, postsPerWeek])),
      languages,
      avatar_ids: [],
      weekly_credit_budget: budget,
      auto_publish_enabled: autoPublish,
      // Session H — Goal briefing
      channel_goal: goal.channel_goal,
      content_mix: goal.content_mix,
      weekly_budget_eur: goal.weekly_budget_eur,
      target_audience: goal.target_audience,
      usp: goal.usp,
    };
    await upsert.mutateAsync(input);
    setStep(2);
  };

  const handleActivate = async () => {
    const res = await toggle.mutateAsync({
      activate: true,
      consentTextHash: 'aup-v1-summary-sha-placeholder',
      consentTextVersion: 'v1',
    });
    if (res?.ok !== false) {
      onCompleted?.();
      onOpenChange(false);
      reset();
    }
  };

  const reset = () => {
    setStep(1);
    setConfirmText('');
    setScrolled(false);
    setAupAccepted(false);
    setNoDeepfake(false);
    setNoCopyright(false);
    setAcceptTermination(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl flex items-center gap-2">
            {step === 1 && <><Sparkles className="h-5 w-5 text-primary" /> {tx({ de: "Brand Brief", en: "Brand brief", es: "Brief de marca" })}</>}
            {step === 2 && <><ShieldCheck className="h-5 w-5 text-emerald-400" /> {tx({ de: "Acceptable Use Policy", en: "Acceptable Use Policy", es: "Política de Uso Aceptable" })}</>}
            {step === 3 && <><Lock className="h-5 w-5 text-destructive" /> {tx({ de: 'Aktivierung bestätigen', en: 'Confirm activation', es: 'Confirmar activación' })}</>}
          </DialogTitle>
          <DialogDescription>
            {tx({ de: 'Schritt', en: 'Step', es: 'Paso' })} {step} {tx({ de: 'von', en: 'of', es: 'de' })} 3 — {step === 1 ? tx({ de: 'Definiere deine Strategie', en: 'Define your strategy', es: 'Define tu estrategia' }) : step === 2 ? tx({ de: 'Lies und akzeptiere die Regeln', en: 'Read and accept the rules', es: 'Lee y acepta las reglas' }) : tx({ de: 'Letzte Sicherheits-Bestätigung', en: 'Final safety confirmation', es: 'Confirmación de seguridad final' })}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className={cn(
              'h-1 flex-1 rounded-full transition',
              s <= step ? 'bg-primary' : 'bg-muted',
            )} />
          ))}
        </div>

        {/* ============ STEP 1: GOAL + BRIEF ============ */}
        {step === 1 && (
          <div className="space-y-6">
            {/* Session H — Channel Goal Briefing */}
            <div className="rounded-lg border bg-primary/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Target className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold tracking-wide uppercase text-primary">{tx({ de: 'Channel-Ziel & Budget', en: 'Channel goal & budget', es: 'Objetivo de canal y presupuesto' })}</span>
              </div>
              <AutopilotGoalBriefingStep value={goal} onChange={setGoal} />
            </div>

            <div className="border-t pt-4">
              <div className="text-sm font-semibold mb-3 uppercase tracking-wide text-muted-foreground">{tx({ de: "Inhaltliche Strategie", en: "Content strategy", es: "Estrategia de contenido" })}</div>
            <div>
              <Label htmlFor="pillars">{tx({ de: "Themen-Pillars (kommagetrennt) *", en: "Topic pillars (comma-separated) *", es: "Pilares temáticos (separados por comas) *" })}</Label>
              <Input id="pillars" value={pillarsText} onChange={(e) => setPillarsText(e.target.value)}
                placeholder={tx({ de: "z.B. Productivity, AI Tools, Marketing Tipps", en: "e.g. Productivity, AI Tools, Marketing Tips", es: "p.ej. Productividad, Herramientas IA, Consejos de marketing" })} />
              <p className="text-[11px] text-muted-foreground mt-1">{tx({ de: "3-6 Hauptthemen, an denen sich die KI orientiert.", en: "3-6 main topics the AI uses as guidance.", es: "3-6 temas principales que guían a la IA." })}</p>
            </div>
            <div>
              <Label htmlFor="forbidden">{tx({ de: "Verbots-Themen (optional)", en: "Forbidden topics (optional)", es: "Temas prohibidos (opcional)" })}</Label>
              <Input id="forbidden" value={forbiddenText} onChange={(e) => setForbiddenText(e.target.value)}
                placeholder={tx({ de: "z.B. Politik, Religion, Konkurrenten", en: "e.g. Politics, religion, competitors", es: "p.ej. Política, religión, competidores" })} />
            </div>
            <div>
              <Label>{tx({ de: "Tonalität", en: "Tonality", es: "Tonalidad" })}</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {TONALITIES.map((t) => (
                  <Badge key={t} variant={tonality === t ? 'default' : 'outline'}
                    className="cursor-pointer capitalize" onClick={() => setTonality(t)}>{t}</Badge>
                ))}
              </div>
            </div>
            <div>
              <Label>{tx({ de: "Plattformen *", en: "Platforms *", es: "Plataformas *" })}</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {PLATFORMS.map((p) => (
                  <Badge key={p} variant={platforms.includes(p) ? 'default' : 'outline'}
                    className="cursor-pointer capitalize" onClick={() => togglePlatform(p)}>{p}</Badge>
                ))}
              </div>
            </div>
            <div>
              <Label>{tx({ de: "Sprachen *", en: "Languages *", es: "Idiomas *" })}</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {LANGUAGES.map((l) => (
                  <Badge key={l} variant={languages.includes(l) ? 'default' : 'outline'}
                    className="cursor-pointer uppercase" onClick={() => toggleLang(l)}>{l}</Badge>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ppw">{tx({ de: "Posts pro Woche/Plattform", en: "Posts per week/platform", es: "Publicaciones por semana/plataforma" })}</Label>
                <Input id="ppw" type="number" min={1} max={21} value={postsPerWeek}
                  onChange={(e) => setPostsPerWeek(Math.max(1, Math.min(21, parseInt(e.target.value) || 1)))} />
              </div>
              <div>
                <Label htmlFor="budget">{tx({ de: "Wochen-Budget (Credits)", en: "Weekly budget (credits)", es: "Presupuesto semanal (créditos)" })}</Label>
                <Input id="budget" type="number" min={100} step={100} value={budget}
                  onChange={(e) => setBudget(Math.max(100, parseInt(e.target.value) || 100))} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">{tx({ de: "Auto-Publish", en: "Auto-publish", es: "Publicación automática" })}</div>
                <div className="text-[11px] text-muted-foreground">
                  {tx({ de: "AN = vollautomatisch · AUS = Co-Pilot (du gibst jeden Slot frei)", en: "ON = fully automatic · OFF = co-pilot (you approve every slot)", es: "ACTIVADO = totalmente automático · DESACTIVADO = copiloto (apruebas cada slot)" })}
                </div>
              </div>
              <Switch checked={autoPublish} onCheckedChange={setAutoPublish} />
            </div>
            </div>
            {!goalValid && (
              <p className="text-[11px] text-amber-500 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> {tx({ de: "Bitte Channel-Ziel, Budget, Zielgruppe und USP ausfüllen.", en: "Please fill in channel goal, budget, target audience and USP.", es: "Por favor, completa el objetivo del canal, presupuesto, público objetivo y USP." })}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>{tx({ de: "Abbrechen", en: "Cancel", es: "Cancelar" })}</Button>
              <Button disabled={!briefValid || !goalValid || upsert.isPending} onClick={handleSaveBrief} className="gap-1.5">
                {tx({ de: "Weiter", en: "Next", es: "Siguiente" })} <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ============ STEP 2: AUP ============ */}
        {step === 2 && (
          <div className="space-y-4">
            <ScrollArea
              className="h-64 rounded-lg border bg-muted/20 p-4"
              onScrollCapture={(e) => {
                const t = e.currentTarget.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
                if (t && t.scrollTop + t.clientHeight >= t.scrollHeight - 20) setScrolled(true);
              }}
            >
              <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed text-foreground/90">{aupText()}</pre>
            </ScrollArea>
            {!scrolled && (
              <p className="text-[11px] text-amber-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> {tx({ de: "Bitte komplett bis zum Ende scrollen.", en: "Please scroll all the way to the end.", es: "Por favor, desplázate hasta el final." })}
              </p>
            )}

            <div className="space-y-2.5">
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={aupAccepted} onCheckedChange={(v) => setAupAccepted(v === true)} disabled={!scrolled} />
                <span>{tx({ de: "Ich habe die ", en: "I have read the ", es: "He leído la " })}<strong>{tx({ de: "vollständige AUP", en: "full AUP", es: "AUP completa" })}</strong>{tx({ de: " gelesen und akzeptiere sie als verbindlich.", en: " and accept it as binding.", es: " y la acepto como vinculante." })}</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={noDeepfake} onCheckedChange={(v) => setNoDeepfake(v === true)} disabled={!scrolled} />
                <span>Ich werde <strong>{tx({ de: "keine Deepfakes", en: "I will <strong>not create or distribute deepfakes</strong> of real people.", es: "No <strong>crearé ni distribuiré deepfakes</strong> de personas reales." })}</strong> {tx({ de: "realer Personen erstellen oder verbreiten.", en: "create or distribute real people.", es: "crear o distribuir personas reales." })}</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={noCopyright} onCheckedChange={(v) => setNoCopyright(v === true)} disabled={!scrolled} />
                <span>{tx({ de: "Ich werde keine ", en: "I will not use any ", es: "No usaré " })}<strong>{tx({ de: "urheberrechtlich geschützten", en: "copyrighted", es: "protegidas por derechos de autor" })}</strong>{tx({ de: " Marken, Logos, Songs oder Charaktere verwenden.", en: " brands, logos, songs, or characters.", es: " marcas, logotipos, canciones o personajes." })}</span>
              </label>
              <label className="flex items-start gap-2 text-sm border-l-2 border-destructive pl-2">
                <Checkbox checked={acceptTermination} onCheckedChange={(v) => setAcceptTermination(v === true)} disabled={!scrolled} />
                <span className="text-destructive/90">
                  Ich verstehe: <strong>{tx({ de: "Critical-Strikes führen zur sofortigen, fristlosen Löschung meines Accounts ohne Rückerstattung.", en: "Critical strikes will result in immediate, summary deletion of my account without refund.", es: "Las infracciones graves resultarán en la eliminación inmediata y sin previo aviso de mi cuenta, sin reembolso." })}</strong>
                </span>
              </label>
            </div>

            <div className="flex justify-between gap-2 pt-2">
              <Button variant="ghost" onClick={() => setStep(1)}>{tx({ de: "Zurück", en: "Back", es: "Atrás" })}</Button>
              <Button disabled={!aupValid} onClick={() => setStep(3)} className="gap-1.5">
                {tx({ de: "Weiter", en: "Next", es: "Siguiente" })} <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ============ STEP 3: HARD CONFIRMATION ============ */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="text-sm">
                  {tx({
                    de: <><strong className="text-destructive">Letzte Bestätigung.</strong> Mit Aktivierung beauftragst du die KI, in deinem Namen Inhalte zu erstellen und auf deinen verbundenen Accounts zu veröffentlichen. Du kannst den Autopilot jederzeit pausieren oder deaktivieren.</>,
                    en: <><strong className="text-destructive">Final confirmation.</strong> By activating, you instruct the AI to create content on your behalf and publish it on your connected accounts. You can pause or deactivate the autopilot at any time.</>,
                    es: <><strong className="text-destructive">Confirmación final.</strong> Al activar, encargas a la IA que cree contenido en tu nombre y lo publique en tus cuentas conectadas. Puedes pausar o desactivar el autopiloto en cualquier momento.</>,
                  })}
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="confirm">{tx({ de: "Tippe ", en: "Type ", es: "Escribe " })}<strong className="text-primary">{CONFIRM_PHRASE}</strong>{tx({ de: " zur Bestätigung *", en: " to confirm *", es: " para confirmar *" })}</Label>
              <Input
                id="confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                placeholder={CONFIRM_PHRASE}
                className="font-mono tracking-wider"
                autoComplete="off"
              />
            </div>

            <div className="flex justify-between gap-2 pt-2">
              <Button variant="ghost" onClick={() => setStep(2)}>{tx({ de: "Zurück", en: "Back", es: "Atrás" })}</Button>
              <Button
                disabled={!confirmValid || toggle.isPending}
                onClick={handleActivate}
                className="gap-1.5 bg-primary hover:bg-primary/90"
              >
                {toggle.isPending ? tx({ de: "Aktiviere…", en: "Activating…", es: "Activando…" }) : tx({ de: "Autopilot aktivieren", en: "Activate autopilot", es: "Activar autopiloto" })}
                <ShieldCheck className="h-4 w-4" />
              </Button>
            </div>

            <p className="text-[10px] text-muted-foreground text-center pt-1">
              {tx({ de: "Edge-Function-Backend (Plan-Generierung, QA-Gate, Auto-Publish) wird in Session B aktiviert. Bis dahin bleibt der Cockpit-State persistiert, ohne reale Posts zu publizieren.", en: "The edge-function backend (plan generation, QA gate, auto-publish) will be activated in Session B. Until then, the cockpit state stays persisted without publishing real posts.", es: "El backend de edge functions (generación de planes, QA gate, auto-publicación) se activará en la Sesión B. Hasta entonces, el estado del cockpit se mantiene guardado sin publicar publicaciones reales." })}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
