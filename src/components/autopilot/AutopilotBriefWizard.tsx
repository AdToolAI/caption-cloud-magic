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

const AUP_TEXT = `KURZFASSUNG DER ACCEPTABLE USE POLICY

1. Keine Deepfakes von realen Personen ohne nachweisbare schriftliche Einwilligung.
2. Keine Verwendung urheberrechtlich geschützter Marken, Logos, Songs, Charaktere oder Filmszenen.
3. Keine politischen, medizinischen, finanziellen oder juristischen Aussagen.
4. Keine Identitätstäuschung — die KI darf sich nie als reale Person, Behörde oder Marke ausgeben.
5. Alle KI-Inhalte werden automatisch als "Made with AI" gekennzeichnet (C2PA + Caption-Tag).
6. Strike-System: Soft (Hinweis) → Hard (7 Tage Sperre ab 2 aktiven) → Critical (sofortige Account-Löschung ohne Rückerstattung).
7. Missbrauchsversuche (Prompt-Injection, Bypass-Versuche, Bulk-Spam, Hate Speech, NSFW, illegale Inhalte) führen zur fristlosen Löschung deines Accounts ohne jede Rückerstattung.
8. Vollständiger AUP-Text unter /legal/autopilot-aup — durch Aktivierung bestätigst du, diesen vollständig gelesen und akzeptiert zu haben.`;

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
            {step === 1 && <><Sparkles className="h-5 w-5 text-primary" /> Brand Brief</>}
            {step === 2 && <><ShieldCheck className="h-5 w-5 text-emerald-400" /> Acceptable Use Policy</>}
            {step === 3 && <><Lock className="h-5 w-5 text-destructive" /> Aktivierung bestätigen</>}
          </DialogTitle>
          <DialogDescription>
            Schritt {step} von 3 — {step === 1 ? 'Definiere deine Strategie' : step === 2 ? 'Lies und akzeptiere die Regeln' : 'Letzte Sicherheits-Bestätigung'}
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

        {/* ============ STEP 1: BRIEF ============ */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="pillars">Themen-Pillars (kommagetrennt) *</Label>
              <Input id="pillars" value={pillarsText} onChange={(e) => setPillarsText(e.target.value)}
                placeholder="z.B. Productivity, AI Tools, Marketing Tipps" />
              <p className="text-[11px] text-muted-foreground mt-1">3-6 Hauptthemen, an denen sich die KI orientiert.</p>
            </div>
            <div>
              <Label htmlFor="forbidden">Verbots-Themen (optional)</Label>
              <Input id="forbidden" value={forbiddenText} onChange={(e) => setForbiddenText(e.target.value)}
                placeholder="z.B. Politik, Religion, Konkurrenten" />
            </div>
            <div>
              <Label>Tonalität</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {TONALITIES.map((t) => (
                  <Badge key={t} variant={tonality === t ? 'default' : 'outline'}
                    className="cursor-pointer capitalize" onClick={() => setTonality(t)}>{t}</Badge>
                ))}
              </div>
            </div>
            <div>
              <Label>Plattformen *</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {PLATFORMS.map((p) => (
                  <Badge key={p} variant={platforms.includes(p) ? 'default' : 'outline'}
                    className="cursor-pointer capitalize" onClick={() => togglePlatform(p)}>{p}</Badge>
                ))}
              </div>
            </div>
            <div>
              <Label>Sprachen *</Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {LANGUAGES.map((l) => (
                  <Badge key={l} variant={languages.includes(l) ? 'default' : 'outline'}
                    className="cursor-pointer uppercase" onClick={() => toggleLang(l)}>{l}</Badge>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ppw">Posts pro Woche/Plattform</Label>
                <Input id="ppw" type="number" min={1} max={21} value={postsPerWeek}
                  onChange={(e) => setPostsPerWeek(Math.max(1, Math.min(21, parseInt(e.target.value) || 1)))} />
              </div>
              <div>
                <Label htmlFor="budget">Wochen-Budget (Credits)</Label>
                <Input id="budget" type="number" min={100} step={100} value={budget}
                  onChange={(e) => setBudget(Math.max(100, parseInt(e.target.value) || 100))} />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">Auto-Publish</div>
                <div className="text-[11px] text-muted-foreground">
                  AN = vollautomatisch · AUS = Co-Pilot (du gibst jeden Slot frei)
                </div>
              </div>
              <Switch checked={autoPublish} onCheckedChange={setAutoPublish} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Abbrechen</Button>
              <Button disabled={!briefValid || upsert.isPending} onClick={handleSaveBrief} className="gap-1.5">
                Weiter <ChevronRight className="h-4 w-4" />
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
              <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed text-foreground/90">{AUP_TEXT}</pre>
            </ScrollArea>
            {!scrolled && (
              <p className="text-[11px] text-amber-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Bitte komplett bis zum Ende scrollen.
              </p>
            )}

            <div className="space-y-2.5">
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={aupAccepted} onCheckedChange={(v) => setAupAccepted(v === true)} disabled={!scrolled} />
                <span>Ich habe die <strong>vollständige AUP</strong> gelesen und akzeptiere sie als verbindlich.</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={noDeepfake} onCheckedChange={(v) => setNoDeepfake(v === true)} disabled={!scrolled} />
                <span>Ich werde <strong>keine Deepfakes</strong> realer Personen erstellen oder verbreiten.</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={noCopyright} onCheckedChange={(v) => setNoCopyright(v === true)} disabled={!scrolled} />
                <span>Ich werde keine <strong>urheberrechtlich geschützten</strong> Marken, Logos, Songs oder Charaktere verwenden.</span>
              </label>
              <label className="flex items-start gap-2 text-sm border-l-2 border-destructive pl-2">
                <Checkbox checked={acceptTermination} onCheckedChange={(v) => setAcceptTermination(v === true)} disabled={!scrolled} />
                <span className="text-destructive/90">
                  Ich verstehe: <strong>Critical-Strikes führen zur sofortigen, fristlosen Löschung meines Accounts ohne Rückerstattung.</strong>
                </span>
              </label>
            </div>

            <div className="flex justify-between gap-2 pt-2">
              <Button variant="ghost" onClick={() => setStep(1)}>Zurück</Button>
              <Button disabled={!aupValid} onClick={() => setStep(3)} className="gap-1.5">
                Weiter <ChevronRight className="h-4 w-4" />
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
                  <strong className="text-destructive">Letzte Bestätigung.</strong> Mit Aktivierung beauftragst du die KI,
                  in deinem Namen Inhalte zu erstellen und auf deinen verbundenen Accounts zu veröffentlichen.
                  Du kannst den Autopilot jederzeit pausieren oder deaktivieren.
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="confirm">Tippe <strong className="text-primary">{CONFIRM_PHRASE}</strong> zur Bestätigung *</Label>
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
              <Button variant="ghost" onClick={() => setStep(2)}>Zurück</Button>
              <Button
                disabled={!confirmValid || toggle.isPending}
                onClick={handleActivate}
                className="gap-1.5 bg-primary hover:bg-primary/90"
              >
                {toggle.isPending ? 'Aktiviere…' : 'Autopilot aktivieren'}
                <ShieldCheck className="h-4 w-4" />
              </Button>
            </div>

            <p className="text-[10px] text-muted-foreground text-center pt-1">
              Edge-Function-Backend (Plan-Generierung, QA-Gate, Auto-Publish) wird in Session B aktiviert.
              Bis dahin bleibt der Cockpit-State persistiert, ohne reale Posts zu publizieren.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
