import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Loader2, Send, Bug, Film, Share2, CreditCard, User as UserIcon, Sparkles, HelpCircle, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { AttachmentUploader, type UploadedAttachment } from "./AttachmentUploader";
import { collectBrowserInfo, detectAffectedModule, type BrowserInfo } from "@/lib/support/contextCollector";
import { useTranslation } from "@/hooks/useTranslation";

type Severity = "low" | "normal" | "high" | "blocking";

const CATEGORIES = [
  { id: "bug", icon: Bug, color: "text-red-400" },
  { id: "rendering", icon: Film, color: "text-amber-400" },
  { id: "publishing", icon: Share2, color: "text-blue-400" },
  { id: "billing", icon: CreditCard, color: "text-emerald-400" },
  { id: "account", icon: UserIcon, color: "text-cyan-400" },
  { id: "feature", icon: Sparkles, color: "text-primary" },
  { id: "technical", icon: Wrench, color: "text-purple-400" },
  { id: "other", icon: HelpCircle, color: "text-muted-foreground" },
] as const;

const SEVERITY_OPTIONS: Severity[] = ["low", "normal", "high", "blocking"];

const MODULE_OPTIONS = [
  "dashboard", "video-composer", "ai-video-toolkit", "directors-cut",
  "picture-studio", "music-studio", "talking-head", "autopilot",
  "publishing", "billing", "account", "marketplace", "other",
];

const TEXT = {
  en: {
    step: "Step",
    of: "of",
    next: "Next",
    back: "Back",
    submit: "Submit ticket",
    submitting: "Submitting…",
    s1Title: "What happened?",
    s1Sub: "Help us route your ticket to the right specialist.",
    category: "Category",
    severity: "Severity",
    module: "Affected module",
    subject: "Short subject",
    subjectPh: "e.g. Render fails after 3 minutes",
    s2Title: "Tell us the details",
    s2Sub: "The clearer you are, the faster we can fix it.",
    expected: "What were you trying to do?",
    expectedPh: "e.g. Render a 60s video in the Composer with the Hailuo model.",
    actual: "What happened instead?",
    actualPh: "e.g. The render hangs at 20% and never finishes.",
    repro: "Steps to reproduce (optional)",
    reproPh: "1. Open /video-composer\n2. Add 3 scenes\n3. Click Render All",
    extra: "Anything else?",
    extraPh: "Additional context, links, or notes.",
    s3Title: "Evidence & submit",
    s3Sub: "Drop a screenshot or screen recording — that often saves us hours.",
    autoCtx: "Diagnostic context (auto-collected)",
    autoCtxHint: "We attach this so we can reproduce the issue. No passwords are sent.",
    success: "Ticket submitted",
    successDesc: "We'll get back to you as soon as possible.",
    error: "Could not submit",
    severityLabels: {
      low: "Low",
      normal: "Normal",
      high: "High",
      blocking: "Blocking",
    },
    severityHints: {
      low: "Question or minor inconvenience",
      normal: "Bug, but workaround exists",
      high: "Important feature is broken",
      blocking: "I can't use the product",
    },
    categoryLabels: {
      bug: "Bug",
      rendering: "Rendering issue",
      publishing: "Publishing / Social",
      billing: "Billing & Invoices",
      account: "Account & Login",
      feature: "Feature request",
      technical: "Technical issue",
      other: "Other",
    },
    promptBanner: "The clearer you are, the faster we'll respond — usually under 2h for blocking issues.",
    requiredHint: "Please fill in subject and category.",
  },
  de: {
    step: "Schritt",
    of: "von",
    next: "Weiter",
    back: "Zurück",
    submit: "Ticket senden",
    submitting: "Wird gesendet…",
    s1Title: "Was ist passiert?",
    s1Sub: "Hilf uns dabei, dein Ticket sofort dem richtigen Experten zuzuordnen.",
    category: "Kategorie",
    severity: "Schweregrad",
    module: "Betroffenes Modul",
    subject: "Kurzer Betreff",
    subjectPh: "z. B. Render bricht nach 3 Minuten ab",
    s2Title: "Erzähl uns die Details",
    s2Sub: "Je präziser du bist, desto schneller können wir helfen.",
    expected: "Was wolltest du tun?",
    expectedPh: "z. B. Ein 60-Sek-Video im Composer mit Hailuo rendern.",
    actual: "Was ist stattdessen passiert?",
    actualPh: "z. B. Der Render bleibt bei 20% hängen.",
    repro: "Schritte zum Reproduzieren (optional)",
    reproPh: "1. /video-composer öffnen\n2. 3 Szenen hinzufügen\n3. „Alle rendern“ klicken",
    extra: "Sonstiges?",
    extraPh: "Zusätzlicher Kontext, Links oder Notizen.",
    s3Title: "Beweise & Absenden",
    s3Sub: "Lade einen Screenshot oder Screen-Recording hoch — das spart uns Stunden.",
    autoCtx: "Diagnose-Kontext (automatisch erfasst)",
    autoCtxHint: "Wir hängen das an, um den Fehler reproduzieren zu können. Es werden keine Passwörter gesendet.",
    success: "Ticket gesendet",
    successDesc: "Wir melden uns so schnell wie möglich.",
    error: "Konnte nicht gesendet werden",
    severityLabels: {
      low: "Niedrig",
      normal: "Normal",
      high: "Hoch",
      blocking: "Blockierend",
    },
    severityHints: {
      low: "Frage oder kleine Unannehmlichkeit",
      normal: "Bug, aber Workaround existiert",
      high: "Wichtiges Feature funktioniert nicht",
      blocking: "Ich kann das Produkt nicht nutzen",
    },
    categoryLabels: {
      bug: "Bug",
      rendering: "Render-Problem",
      publishing: "Veröffentlichung / Social",
      billing: "Abrechnung & Rechnungen",
      account: "Account & Login",
      feature: "Feature-Wunsch",
      technical: "Technisches Problem",
      other: "Sonstiges",
    },
    promptBanner: "Je präziser du bist, desto schneller antworten wir — bei blockierenden Fällen meist unter 2 Std.",
    requiredHint: "Bitte Betreff und Kategorie ausfüllen.",
  },
  es: {
    step: "Paso",
    of: "de",
    next: "Siguiente",
    back: "Atrás",
    submit: "Enviar ticket",
    submitting: "Enviando…",
    s1Title: "¿Qué pasó?",
    s1Sub: "Ayúdanos a enrutar tu ticket al especialista correcto.",
    category: "Categoría",
    severity: "Severidad",
    module: "Módulo afectado",
    subject: "Asunto breve",
    subjectPh: "ej. El render falla tras 3 minutos",
    s2Title: "Cuéntanos los detalles",
    s2Sub: "Cuanto más claro, más rápido podremos solucionarlo.",
    expected: "¿Qué intentabas hacer?",
    expectedPh: "ej. Renderizar un vídeo de 60s en el Composer con Hailuo.",
    actual: "¿Qué pasó en su lugar?",
    actualPh: "ej. El render se queda al 20% y nunca termina.",
    repro: "Pasos para reproducir (opcional)",
    reproPh: "1. Abrir /video-composer\n2. Añadir 3 escenas\n3. Pulsar Renderizar todo",
    extra: "¿Algo más?",
    extraPh: "Contexto adicional, enlaces o notas.",
    s3Title: "Pruebas y enviar",
    s3Sub: "Adjunta una captura o grabación — nos ahorra horas.",
    autoCtx: "Contexto de diagnóstico (auto-recopilado)",
    autoCtxHint: "Lo adjuntamos para reproducir el problema. No se envían contraseñas.",
    success: "Ticket enviado",
    successDesc: "Te responderemos lo antes posible.",
    error: "No se pudo enviar",
    severityLabels: {
      low: "Baja",
      normal: "Normal",
      high: "Alta",
      blocking: "Bloqueante",
    },
    severityHints: {
      low: "Pregunta o molestia menor",
      normal: "Bug, pero hay solución alternativa",
      high: "Función importante rota",
      blocking: "No puedo usar el producto",
    },
    categoryLabels: {
      bug: "Bug",
      rendering: "Problema de render",
      publishing: "Publicación / Social",
      billing: "Facturación",
      account: "Cuenta e inicio de sesión",
      feature: "Solicitud de función",
      technical: "Problema técnico",
      other: "Otro",
    },
    promptBanner: "Cuanto más claro seas, más rápido respondemos — en casos bloqueantes, normalmente <2h.",
    requiredHint: "Rellena el asunto y la categoría.",
  },
} as const;

interface SupportWizardProps {
  userId: string;
  userEmail: string;
  userName?: string;
  onSubmitted?: () => void;
}

export function SupportWizard({ userId, userEmail, userName, onSubmitted }: SupportWizardProps) {
  const { language } = useTranslation();
  const t = TEXT[(language as keyof typeof TEXT)] || TEXT.en;

  const draftId = useMemo(() => crypto.randomUUID(), []);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [category, setCategory] = useState<string>("bug");
  const [severity, setSeverity] = useState<Severity>("normal");
  const [affectedModule, setAffectedModule] = useState(detectAffectedModule());
  const [subject, setSubject] = useState("");
  const [expected, setExpected] = useState("");
  const [actual, setActual] = useState("");
  const [repro, setRepro] = useState("");
  const [extra, setExtra] = useState("");
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [browserInfo, setBrowserInfo] = useState<BrowserInfo | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    collectBrowserInfo().then(setBrowserInfo);
  }, []);

  const canAdvanceFrom1 = subject.trim().length >= 3 && !!category;

  const submit = async () => {
    if (!canAdvanceFrom1) {
      toast({ title: t.error, description: t.requiredHint, variant: "destructive" });
      setStep(1);
      return;
    }
    setSubmitting(true);

    try {
      // 1) Persist ticket row
      const description = [
        expected && `Expected: ${expected}`,
        actual && `Actual: ${actual}`,
        repro && `Repro:\n${repro}`,
        extra,
      ].filter(Boolean).join("\n\n");

      const { error: insertError } = await supabase.from("support_tickets").insert({
        user_id: userId,
        category,
        subject,
        description: description || "(no description)",
        priority: severity === "blocking" || severity === "high" ? "high" : "normal",
        // Extended fields (typed as any until db types regenerate)
        ...({
          severity,
          affected_module: affectedModule,
          attachments,
          browser_info: browserInfo,
          expected_result: expected || null,
          actual_result: actual || null,
          reproduction_steps: repro || null,
        } as Record<string, unknown>),
      } as never);

      if (insertError) throw insertError;

      // 2) Email notification
      const { error: invokeError } = await supabase.functions.invoke("send-support-ticket", {
        body: {
          name: userName || userEmail.split("@")[0],
          email: userEmail,
          category,
          subject,
          severity,
          affected_module: affectedModule,
          expected_result: expected,
          actual_result: actual,
          reproduction_steps: repro,
          message: extra,
          attachments,
          browser_info: browserInfo,
        },
      });
      if (invokeError) throw invokeError;

      toast({ title: t.success, description: t.successDesc });
      onSubmitted?.();
      // Reset form
      setStep(1);
      setSubject(""); setExpected(""); setActual(""); setRepro(""); setExtra("");
      setAttachments([]);
      setSeverity("normal");
      setCategory("bug");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast({ title: t.error, description: msg, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-mono tracking-wider uppercase">
          {t.step} {step} {t.of} 3
        </span>
        <div className="flex gap-1.5">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className={`h-1 w-8 rounded-full transition-all ${
                n <= step ? "bg-primary shadow-[0_0_8px_hsl(var(--primary))]" : "bg-white/10"
              }`}
            />
          ))}
        </div>
      </div>

      {step === 1 && (
        <div className="space-y-5">
          <div>
            <h2 className="text-xl font-serif text-foreground">{t.s1Title}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t.s1Sub}</p>
          </div>

          {/* Category cards */}
          <div className="space-y-2">
            <Label>{t.category}</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const active = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border text-center transition-all ${
                      active
                        ? "border-primary bg-primary/10 shadow-[0_0_16px_hsl(var(--primary)/0.3)]"
                        : "border-white/10 bg-white/[0.02] hover:border-white/20"
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${cat.color}`} />
                    <span className="text-xs text-foreground/90">
                      {t.categoryLabels[cat.id as keyof typeof t.categoryLabels]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Severity pills */}
          <div className="space-y-2">
            <Label>{t.severity}</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SEVERITY_OPTIONS.map((s) => {
                const active = severity === s;
                const colorClass =
                  s === "blocking" ? "border-red-500/60 bg-red-500/15" :
                  s === "high" ? "border-amber-500/60 bg-amber-500/15" :
                  s === "normal" ? "border-blue-500/60 bg-blue-500/15" :
                  "border-emerald-500/60 bg-emerald-500/15";
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSeverity(s)}
                    className={`p-3 rounded-lg border text-left transition-all ${
                      active ? `${colorClass} shadow-[0_0_12px_rgba(255,255,255,0.1)]` : "border-white/10 bg-white/[0.02] hover:border-white/20"
                    }`}
                  >
                    <div className="text-sm font-medium text-foreground">{t.severityLabels[s]}</div>
                    <div className="text-[11px] text-muted-foreground">{t.severityHints[s]}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Module + subject */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="module">{t.module}</Label>
              <Select value={affectedModule} onValueChange={setAffectedModule}>
                <SelectTrigger id="module"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODULE_OPTIONS.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject">{t.subject}</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={t.subjectPh}
                maxLength={200}
              />
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div>
            <h2 className="text-xl font-serif text-foreground">{t.s2Title}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t.s2Sub}</p>
          </div>

          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-foreground/80">
            {t.promptBanner}
          </div>

          <div className="space-y-2">
            <Label htmlFor="expected">{t.expected}</Label>
            <Textarea
              id="expected"
              rows={2}
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              placeholder={t.expectedPh}
              maxLength={500}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="actual">{t.actual}</Label>
            <Textarea
              id="actual"
              rows={2}
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              placeholder={t.actualPh}
              maxLength={500}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="repro">{t.repro}</Label>
            <Textarea
              id="repro"
              rows={3}
              value={repro}
              onChange={(e) => setRepro(e.target.value)}
              placeholder={t.reproPh}
              maxLength={1000}
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="extra">{t.extra}</Label>
            <Textarea
              id="extra"
              rows={3}
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder={t.extraPh}
              maxLength={1500}
            />
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5">
          <div>
            <h2 className="text-xl font-serif text-foreground">{t.s3Title}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t.s3Sub}</p>
          </div>

          <AttachmentUploader
            userId={userId}
            draftId={draftId}
            attachments={attachments}
            onChange={setAttachments}
          />

          <details className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <summary className="cursor-pointer text-sm text-foreground/80 font-medium">
              {t.autoCtx}
            </summary>
            <p className="text-xs text-muted-foreground mt-2 mb-3">{t.autoCtxHint}</p>
            <pre className="text-[10px] text-muted-foreground bg-black/40 p-3 rounded overflow-auto max-h-40">
              {JSON.stringify(browserInfo, null, 2)}
            </pre>
          </details>
        </div>
      )}

      {/* Footer nav */}
      <div className="flex items-center justify-between pt-4 border-t border-white/10">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2) : s))}
          disabled={step === 1 || submitting}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          {t.back}
        </Button>

        {step < 3 ? (
          <Button
            type="button"
            onClick={() => setStep((s) => (s + 1) as 2 | 3)}
            disabled={step === 1 && !canAdvanceFrom1}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {t.next}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button
            type="button"
            onClick={submit}
            disabled={submitting || !canAdvanceFrom1}
            className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground hover:opacity-90 shadow-[0_0_20px_hsl(var(--primary)/0.4)]"
          >
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            {submitting ? t.submitting : t.submit}
          </Button>
        )}
      </div>
    </div>
  );
}
