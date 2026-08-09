import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useSearchParams } from 'react-router-dom';
import { Bot, Clapperboard, ShieldCheck, Calendar, Activity, Settings, Lock, AlertTriangle, Sparkles, Pause, Power, Inbox, BarChart3, FileText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import {
  useAutopilotBrief,
  useAutopilotQueue,
  useAutopilotStrikes,
  useAutopilotActivity,
  usePauseAutopilot,
  useToggleAutopilot,
} from '@/hooks/useAutopilot';
import { AutopilotBriefWizard } from '@/components/autopilot/AutopilotBriefWizard';
import { AutopilotCalendarGrid } from '@/components/autopilot/AutopilotCalendarGrid';
import { AutopilotSlotDrawer } from '@/components/autopilot/AutopilotSlotDrawer';
import { AutopilotStrategyEditor } from '@/components/autopilot/AutopilotStrategyEditor';
import { AutopilotApprovalInbox } from '@/components/autopilot/AutopilotApprovalInbox';
import { AutopilotInsightsPanel } from '@/components/autopilot/AutopilotInsightsPanel';
import { AutopilotWeeklyReviewPanel } from '@/components/autopilot/AutopilotWeeklyReviewPanel';
import { useAutopilotNotifications } from '@/hooks/useAutopilotNotifications';
import type { AutopilotSlot } from '@/hooks/useAutopilot';
import { cn } from '@/lib/utils';

import { ComingSoonScreen } from '@/components/common/ComingSoonScreen';
import { AutopilotStudio } from '@/components/autopilot/AutopilotStudio';

import { useTrackPageFeature } from "@/hooks/useTrackPageFeature";
import { tx } from "@/lib/i18nText";

export default function Autopilot() {
  useTrackPageFeature("autopilot");
  return (
    <ComingSoonScreen
      eyebrow={tx({ de: "KI Autopilot", en: "AI Autopilot", es: "Piloto automático de IA" })}
      title={tx({ de: "Deine KI führt den Account", en: "Your AI runs the account", es: "Tu IA gestiona la cuenta" })}
      subtitle={tx({ de: "Vollautonome Content-Pipeline mit Wochenplan, Compliance-Score und Legal-Shield gegen Deepfakes und Copyright-Verstöße. Du briefst, die KI generiert, prüft, plant und veröffentlicht.", en: "Fully autonomous content pipeline with weekly plan, compliance score and legal shield against deepfakes and copyright violations. You brief, the AI generates, checks, schedules and publishes.", es: "Pipeline de contenido totalmente autónoma con plan semanal, puntuación de cumplimiento y escudo legal contra deepfakes e infracciones de copyright. Tú das el briefing; la IA genera, revisa, planifica y publica." })}
      reason={tx({ de: "Wir härten gerade das Compliance-Gate und die Approval-Inbox für Production-Workloads.", en: "We are currently hardening the compliance gate and approval inbox for production workloads.", es: "Estamos reforzando la puerta de cumplimiento y la bandeja de aprobación para cargas de producción." })}
      backHref="/home"
      adminPreview={<AutopilotReal />}
      features={[
        {
          icon: <Bot className="h-5 w-5" />,
          title: 'Auto-Briefing & Strategie',
          description: tx({ de: 'Einmal die Strategie definieren — die KI plant 14 Tage Content im Voraus, abgestimmt auf Brand, Sprache und Plattform.', en: 'Define your strategy once — the AI plans 14 days of content ahead, matched to brand, language and platform.', es: 'Define la estrategia una vez: la IA planifica 14 días de contenido por adelantado, ajustado a marca, idioma y plataforma.' }),
        },
        {
          icon: <ShieldCheck className="h-5 w-5" />,
          title: 'Legal Shield',
          description: tx({ de: 'KI-QA prüft jeden Post auf Copyright, Deepfakes und Brand-CI. Strike-System verhindert Account-Risiko.', en: 'AI QA checks every post for copyright, deepfakes and brand CI. A strike system prevents account risk.', es: 'El control de calidad con IA revisa cada publicación por copyright, deepfakes e identidad de marca. El sistema de avisos evita riesgos para la cuenta.' }),
        },
        {
          icon: <Calendar className="h-5 w-5" />,
          title: 'Wochenplan & Approval-Inbox',
          description: tx({ de: 'Co-Pilot-Modus: Du genehmigst per Klick. Auto-Publish: Die KI veröffentlicht zu optimalen Zeiten.', en: 'Co-pilot mode: You approve with one click. Auto-Publish: The AI ​​publishes at optimal times.', es: 'Modo copiloto: Apruebas con un clic. Publicación automática: la IA publica en momentos óptimos.' }),
        },
      ]}
    />
  );
}

function AutopilotReal() {
  const { data: brief } = useAutopilotBrief();
  const { data: queue = [] } = useAutopilotQueue(14);
  const { data: strikes = [] } = useAutopilotStrikes();
  const { data: activity = [] } = useAutopilotActivity(30);
  const pause = usePauseAutopilot();
  const toggle = useToggleAutopilot();
  const { unreadCount: inboxUnread } = useAutopilotNotifications(30);
  const reviewCount = queue.filter((s) => s.status === 'qa_review').length;
  const inboxBadge = inboxUnread + reviewCount;
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<AutopilotSlot | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchParams] = useSearchParams();

  // First Production: kommt der Nutzer direkt aus dem Studio-Setup,
  // öffnet sich der Brief-Wizard sofort — kein leeres Cockpit.
  useEffect(() => {
    if (searchParams.get('firstProduction') === '1') {
      setWizardOpen(true);
    }
  }, [searchParams]);

  const isActive = !!brief?.is_active;
  const isLocked = !!(brief?.locked_until && new Date(brief.locked_until) > new Date());
  const isPaused = !!(brief?.paused_until && new Date(brief.paused_until) > new Date());
  const activeStrikes = strikes.filter((s) => s.is_active);


  return (
    <>
      <Helmet>
        <title>Autopilot Cockpit — KI-gesteuerter Account | useadtool</title>
        <meta name="description" content={tx({ de: "Cockpit für deinen KI-Autopilot: Wochenplan, Compliance-Score, Strike-Status und Live-Activity. Mit hartem Legal-Shield gegen Deepfakes und Copyright-Verstöße.", en: "Cockpit for your AI autopilot: weekly plan, compliance score, strike status and live activity. With a hard legal shield against deepfakes and copyright violations.", es: "Cockpit para tu autopiloto de IA: plan semanal, puntuación de cumplimiento, estado de avisos y actividad en vivo. Con escudo legal frente a deepfakes e infracciones de copyright." })} />
      </Helmet>

      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 text-primary text-sm mb-2">
                <Bot className="h-4 w-4" />
                <span className="tracking-widest uppercase">Autopilot Cockpit</span>
              </div>
              <h1 className="font-serif text-4xl md:text-5xl">{tx({ de: "Deine KI führt den Account", en: "Your AI runs the account", es: "Tu IA gestiona la cuenta" })}</h1>
              <p className="text-muted-foreground mt-2 max-w-2xl">
                {tx({ de: "Volle Transparenz darüber, was die KI plant, wie sie es prüft und wann sie postet — mit hartem Legal-Shield gegen Deepfakes, Copyright-Verstöße und Missbrauch.", en: "Full transparency about what the AI ​​plans, how it checks it and when it posts — with a hard legal shield against deepfakes, copyright violations and abuse.", es: "Transparencia total sobre lo que planea la IA, cómo lo revisa y cuándo publica, con un sólido escudo legal contra deepfakes, infracciones de copyright y abusos." })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/legal/autopilot-aup">
                <Button variant="outline" size="sm" className="gap-2">
                  <ShieldCheck className="h-4 w-4" /> Acceptable Use Policy
                </Button>
              </Link>
            </div>
          </div>

          {/* Sticky Control Bar */}
          <Card className={cn(
            'sticky top-4 z-30 backdrop-blur-md mb-6 p-4',
            isLocked ? 'border-destructive/50 bg-destructive/5'
              : isActive ? 'border-primary/40 bg-primary/5' : 'border-border/60 bg-card/60',
          )}>
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              <div className="flex items-center gap-3 flex-1">
                <span className={cn(
                  'h-3 w-3 rounded-full',
                  isLocked ? 'bg-destructive shadow-[0_0_10px_hsl(var(--destructive))]'
                    : isPaused ? 'bg-amber-500'
                    : isActive ? 'bg-primary shadow-[0_0_12px_hsl(var(--primary))]' : 'bg-muted-foreground/40',
                )} />
                <div>
                  <div className="font-semibold text-sm">
                    {isLocked ? 'GESPERRT' : isPaused ? `PAUSIERT bis ${new Date(brief!.paused_until!).toLocaleString()}` : isActive ? 'AUTOPILOT AKTIV' : 'AUTOPILOT INAKTIV'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {brief
                      ? `Compliance ${brief.compliance_score}/100 · Budget ${brief.weekly_credits_spent}/${brief.weekly_credit_budget} cr · Auto-Publish ${brief.auto_publish_enabled ? 'ON' : 'OFF'}`
                      : tx({ de: 'Noch kein Brief — beim ersten Aktivieren öffnet sich der Onboarding-Wizard.', en: 'No brief yet — the onboarding wizard opens the first time you activate.', es: 'Aún no hay briefing: el asistente de incorporación se abre al activarlo por primera vez.' })}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isActive && !isLocked && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pause.isPending}
                      onClick={() => pause.mutate({ hours: isPaused ? null : 24 })}
                      className="gap-1.5"
                    >
                      <Pause className="h-3.5 w-3.5" /> {isPaused ? tx({ de: "Pause aufheben", en: "Resume", es: "Reanudar" }) : tx({ de: "Pause 24h", en: "Pause 24h", es: "Pausar 24h" })}
                    </Button>
                  </>
                )}
                <ActivationToggle
                  isActive={isActive}
                  isLocked={isLocked}
                  hasBrief={!!brief}
                  onOpenWizard={() => setWizardOpen(true)}
                  onDeactivate={() => toggle.mutate({ activate: false })}
                  isPending={toggle.isPending}
                />
              </div>
            </div>
          </Card>

          {/* Strike Banner */}
          {activeStrikes.length > 0 && (
            <Card className="border-destructive/40 bg-destructive/10 p-4 mb-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold text-destructive">
                    {activeStrikes.length} aktive{activeStrikes.length === 1 ? 'r' : ''} Strike{activeStrikes.length === 1 ? '' : 's'}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Beim 2. Strike wird der Autopilot 7 Tage gesperrt. Beim 3. Strike dauerhaft. Critical-Strikes können zur fristlosen Account-Löschung führen.
                  </p>
                </div>
                <Link to="/legal/autopilot-aup" className="text-xs text-primary underline shrink-0">{tx({ de: "Regeln lesen", en: "Read rules", es: "Leer reglas" })}</Link>
              </div>
            </Card>
          )}

          {/* Tabs */}
          <Tabs defaultValue={inboxBadge > 0 ? 'inbox' : 'director'}>
            <TabsList className="mb-4">
              <TabsTrigger value="director" className="gap-1.5"><Clapperboard className="h-3.5 w-3.5" /> Regietisch</TabsTrigger>
              <TabsTrigger value="calendar" className="gap-1.5"><Calendar className="h-3.5 w-3.5" /> Wochenplan</TabsTrigger>
              <TabsTrigger value="inbox" className="gap-1.5 relative">
                <Inbox className="h-3.5 w-3.5" /> Inbox
                {inboxBadge > 0 && (
                  <Badge className="ml-1 bg-primary text-primary-foreground h-4 min-w-4 px-1 text-[10px] flex items-center justify-center rounded-full">
                    {inboxBadge > 99 ? '99+' : inboxBadge}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="strategy" className="gap-1.5"><Settings className="h-3.5 w-3.5" /> Strategie</TabsTrigger>
              <TabsTrigger value="tools" className="gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Tools</TabsTrigger>
              <TabsTrigger value="insights" className="gap-1.5"><BarChart3 className="h-3.5 w-3.5" /> Insights</TabsTrigger>
              <TabsTrigger value="review" className="gap-1.5 relative">
                <FileText className="h-3.5 w-3.5" /> Wochen-Review
                {brief?.briefing_required_until && new Date(brief.briefing_required_until) > new Date() && (
                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                )}
              </TabsTrigger>
              <TabsTrigger value="compliance" className="gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Compliance</TabsTrigger>
              <TabsTrigger value="activity" className="gap-1.5"><Activity className="h-3.5 w-3.5" /> Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="director">
              <AutopilotStudio />
            </TabsContent>


            <TabsContent value="calendar">
              <AutopilotCalendarGrid
                queue={queue}
                hasBrief={!!brief}
                onSelectSlot={(s) => { setSelectedSlot(s); setDrawerOpen(true); }}
              />
            </TabsContent>

            <TabsContent value="inbox">
              <AutopilotApprovalInbox
                onOpenSlot={(s) => { setSelectedSlot(s); setDrawerOpen(true); }}
              />
            </TabsContent>

            <TabsContent value="strategy">
              <AutopilotStrategyEditor brief={brief} />
            </TabsContent>

            <TabsContent value="tools">
              <ToolsPanel />
            </TabsContent>

            <TabsContent value="insights">
              <AutopilotInsightsPanel />
            </TabsContent>

            <TabsContent value="review">
              <AutopilotWeeklyReviewPanel />
            </TabsContent>

            <TabsContent value="compliance">
              <CompliancePanel brief={brief} strikes={strikes} />
            </TabsContent>

            <TabsContent value="activity">
              <ActivityPanel entries={activity} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <AutopilotBriefWizard open={wizardOpen} onOpenChange={setWizardOpen} />
      <AutopilotSlotDrawer slot={selectedSlot} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </>
  );
}

/* ====================== Subcomponents ====================== */

function ActivationToggle({
  isActive,
  isLocked,
  hasBrief,
  onOpenWizard,
  onDeactivate,
  isPending,
}: {
  isActive: boolean;
  isLocked: boolean;
  hasBrief: boolean;
  onOpenWizard: () => void;
  onDeactivate: () => void;
  isPending: boolean;
}) {
  if (isLocked) {
    return (
      <Button variant="outline" size="sm" disabled className="gap-1.5 border-destructive/50 text-destructive">
        <Lock className="h-3.5 w-3.5" /> Gesperrt
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground hidden md:inline">{isActive ? 'AKTIV' : 'INAKTIV'}</span>
      <Switch
        checked={isActive}
        disabled={isPending}
        onCheckedChange={() => {
          if (!hasBrief || !isActive) {
            onOpenWizard();
            return;
          }
          onDeactivate();
        }}
        aria-label="Autopilot aktivieren"
      />
      <Power className={cn('h-4 w-4', isActive ? 'text-primary' : 'text-muted-foreground')} />
    </div>
  );
}


function ToolsPanel() {
  const tools = [
    { name: 'Video Composer', desc: tx({ de: 'Mehrszenige AI-Videos mit konsistenten Charakteren', en: 'Multi-scene AI videos with consistent characters', es: 'Vídeos de IA de múltiples escenas con personajes consistentes' }), statusKey: 'available', status: tx({ de: 'verfügbar', en: 'available', es: 'disponible' }) },
    { name: 'Picture Studio', desc: tx({ de: 'AI-Bilder, Magic Edit, Style-Reference, Brand-Kit', en: 'AI images, magic edit, style reference, brand kit', es: 'Imágenes AI, edición mágica, referencia de estilo, kit de marca' }), statusKey: 'available', status: tx({ de: 'verfügbar', en: 'available', es: 'disponible' }) },
    { name: 'Music Studio', desc: tx({ de: "Hintergrundmusik via Stable Audio + MiniMax", en: "Background music via Stable Audio + MiniMax", es: "Música de fondo a través de Stable Audio + MiniMax" }), statusKey: 'available', status: tx({ de: 'verfügbar', en: 'available', es: 'disponible' }) },
    { name: 'Talking Head Avatare', desc: tx({ de: 'Lippensynchrone Avatar-Videos mit Stimme', en: 'Lip-sync avatar videos with voice', es: 'Vídeos de avatares con sincronización labial y voz' }), statusKey: 'available', status: tx({ de: 'verfügbar', en: 'available', es: 'disponible' }) },
    { name: 'Trend Radar', desc: tx({ de: 'Lokalisierte Trends, alle 5 Stunden aktualisiert', en: 'Localized trends, updated every 5 hours', es: 'Tendencias localizadas, actualizadas cada 5 horas.' }), statusKey: 'live', status: tx({ de: 'live', en: 'live', es: 'en vivo' }) },
    { name: 'Posting Berater', desc: tx({ de: "Optimale Veröffentlichungszeiten pro Plattform/Sprache", en: "Optimal posting times per platform/language", es: "Tiempos de publicación óptimos por plataforma/idioma" }), statusKey: 'available', status: tx({ de: 'verfügbar', en: 'available', es: 'disponible' }) },
    { name: 'KI-QA-Gate', desc: tx({ de: 'Vision-Check auf Brand-CI, Copyright, Deepfakes', en: 'Vision check for brand CI, copyright, deepfakes', es: 'Verificación de visión para CI de marca, derechos de autor y deepfakes' }), statusKey: 'active', status: tx({ de: 'aktiv', en: 'active', es: 'activo' }) },
    { name: 'Performance-Loop', desc: tx({ de: "Lernende Optimierung — kommt in Stufe 2", en: "Learning optimization — coming in Stage 2", es: "Optimización del aprendizaje: llegará en la Etapa 2" }), statusKey: 'planned', status: tx({ de: 'geplant', en: 'planned', es: 'planificado' }) },
  ];
  return (
    <div className="grid md:grid-cols-2 gap-3">
      {tools.map((t) => (
        <Card key={t.name} className="p-3 flex items-start gap-3">
          <span className={cn(
            'h-2 w-2 rounded-full mt-1.5 shrink-0',
            t.statusKey === 'active' || t.statusKey === 'live' ? 'bg-emerald-500 shadow-[0_0_6px_rgb(16,185,129)]'
            : t.statusKey === 'available' ? 'bg-primary'
            : 'bg-muted-foreground/40',
          )} />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">{t.name}</div>
            <div className="text-xs text-muted-foreground">{t.desc}</div>
          </div>
          <Badge variant="outline" className="text-[10px]">{t.status}</Badge>
        </Card>
      ))}
    </div>
  );
}

function CompliancePanel({
  brief,
  strikes,
}: {
  brief: ReturnType<typeof useAutopilotBrief>['data'];
  strikes: ReturnType<typeof useAutopilotStrikes>['data'];
}) {
  const score = brief?.compliance_score ?? 100;
  const counts = {
    soft: (strikes ?? []).filter((s) => s.severity === 'soft').length,
    hard: (strikes ?? []).filter((s) => s.severity === 'hard' && s.is_active).length,
    critical: (strikes ?? []).filter((s) => s.severity === 'critical' && s.is_active).length,
  };
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Compliance Score</div>
        <div className={cn(
          'text-5xl font-serif',
          score >= 90 ? 'text-emerald-400' : score >= 70 ? 'text-amber-400' : 'text-destructive',
        )}>{score}<span className="text-2xl text-muted-foreground">/100</span></div>
        <div className="h-2 bg-muted rounded-full mt-3 overflow-hidden">
          <div className={cn(
            'h-full transition-all',
            score >= 90 ? 'bg-emerald-500' : score >= 70 ? 'bg-amber-500' : 'bg-destructive',
          )} style={{ width: `${score}%` }} />
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label={tx({ de: "Soft-Strikes", en: "Soft strikes", es: "Infracciones leves" })} value={String(counts.soft)} sub={tx({ de: "Hinweise, kein Limit", en: "Notices, no limit", es: "Avisos, sin límite" })} />
        <StatCard label={tx({ de: "Hard-Strikes (aktiv)", en: "Hard strikes (active)", es: "Infracciones graves (activas)" })} value={String(counts.hard)} sub={tx({ de: "Bei 2 → 7 Tage Sperre", en: "At 2 → 7-day lock", es: "Con 2 → bloqueo de 7 días" })} />
        <StatCard label={tx({ de: "Critical-Strikes (aktiv)", en: "Critical strikes (active)", es: "Infracciones críticas (activas)" })} value={String(counts.critical)} sub={tx({ de: "Kann zur Termination führen", en: "Can lead to termination", es: "Puede llevar a la terminación" })} highlight={counts.critical > 0} />
      </div>

      <Card className="p-5 bg-muted/30">
        <h4 className="font-serif text-lg mb-2">{tx({ de: "Aktive Verstöße", en: "Active violations", es: "Infracciones activas" })}</h4>
        {!strikes || strikes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tx({ de: "Keine Verstöße — sauberer Account.", en: "No violations — clean account.", es: "Sin infracciones: cuenta limpia." })}</p>
        ) : (
          <div className="space-y-2">
            {strikes.slice(0, 10).map((s) => (
              <div key={s.id} className="flex items-center gap-3 text-sm border-b border-border/40 pb-2 last:border-0">
                <Badge className={cn(
                  'text-[10px]',
                  s.severity === 'soft' && 'bg-muted text-foreground',
                  s.severity === 'hard' && 'bg-amber-500 text-white',
                  s.severity === 'critical' && 'bg-destructive',
                )}>{s.severity}</Badge>
                <span className="flex-1">{s.reason_description}</span>
                <span className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4 border-destructive/30 bg-destructive/5 text-xs text-foreground/90">
        <strong className="text-destructive">Wichtig:</strong> Critical-Strikes (Deepfake-Versuche, Copyright-Verletzungen,
        Identitätstäuschung, Manipulation) können zur sofortigen fristlosen Löschung des Accounts ohne Rückerstattung führen.
        Vollständige Regeln: <Link to="/legal/autopilot-aup" className="text-primary underline">Acceptable Use Policy</Link>.
      </Card>
    </div>
  );
}

function ActivityPanel({ entries }: { entries: ReturnType<typeof useAutopilotActivity>['data'] }) {
  if (!entries || entries.length === 0) {
    return (
      <Card className="p-8 text-center border-dashed">
        <Activity className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">{tx({ de: "Noch keine KI-Aktivität — wird sichtbar, sobald der Autopilot aktiv ist.", en: "No AI activity yet — it appears as soon as the autopilot is active.", es: "Aún no hay actividad de IA: aparecerá en cuanto el autopiloto esté activo." })}</p>
      </Card>
    );
  }
  return (
    <div className="space-y-1.5">
      {entries.map((e) => (
        <Card key={e.id} className="p-3 flex items-center gap-3 text-sm">
          <span className="text-xs text-muted-foreground w-32 shrink-0">{new Date(e.created_at).toLocaleString()}</span>
          <Badge variant="outline" className="text-[10px]">{e.actor}</Badge>
          <span className="flex-1 truncate">{e.event_type}</span>
        </Card>
      ))}
    </div>
  );
}

function StatCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <Card className={cn('p-4', highlight && 'border-destructive/40 bg-destructive/5')}>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</div>
      <div className={cn('text-lg font-medium truncate', highlight && 'text-destructive')}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </Card>
  );
}
