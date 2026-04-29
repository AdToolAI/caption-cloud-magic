import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Bot, ShieldCheck, Calendar, Activity, Settings, Lock, AlertTriangle, Sparkles, Pause, Power } from 'lucide-react';
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
} from '@/hooks/useAutopilot';
import { cn } from '@/lib/utils';

export default function Autopilot() {
  const { data: brief } = useAutopilotBrief();
  const { data: queue = [] } = useAutopilotQueue(14);
  const { data: strikes = [] } = useAutopilotStrikes();
  const { data: activity = [] } = useAutopilotActivity(30);
  const pause = usePauseAutopilot();

  const isActive = !!brief?.is_active;
  const isLocked = !!(brief?.locked_until && new Date(brief.locked_until) > new Date());
  const isPaused = !!(brief?.paused_until && new Date(brief.paused_until) > new Date());
  const activeStrikes = strikes.filter((s) => s.is_active);

  return (
    <>
      <Helmet>
        <title>Autopilot Cockpit — KI-gesteuerter Account | useadtool</title>
        <meta name="description" content="Cockpit für deinen KI-Autopilot: Wochenplan, Compliance-Score, Strike-Status und Live-Activity. Mit hartem Legal-Shield gegen Deepfakes und Copyright-Verstöße." />
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
              <h1 className="font-serif text-4xl md:text-5xl">Deine KI führt den Account</h1>
              <p className="text-muted-foreground mt-2 max-w-2xl">
                Volle Transparenz darüber, was die KI plant, wie sie es prüft und wann sie postet — mit hartem Legal-Shield gegen Deepfakes, Copyright-Verstöße und Missbrauch.
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
                      : 'Noch kein Brief — beim ersten Aktivieren öffnet sich der Onboarding-Wizard.'}
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
                      <Pause className="h-3.5 w-3.5" /> {isPaused ? 'Pause aufheben' : 'Pause 24h'}
                    </Button>
                  </>
                )}
                <ActivationToggle
                  isActive={isActive}
                  isLocked={isLocked}
                  hasBrief={!!brief}
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
                <Link to="/legal/autopilot-aup" className="text-xs text-primary underline shrink-0">Regeln lesen</Link>
              </div>
            </Card>
          )}

          {/* Tabs */}
          <Tabs defaultValue="calendar">
            <TabsList className="mb-4">
              <TabsTrigger value="calendar" className="gap-1.5"><Calendar className="h-3.5 w-3.5" /> Wochenplan</TabsTrigger>
              <TabsTrigger value="strategy" className="gap-1.5"><Settings className="h-3.5 w-3.5" /> Strategie</TabsTrigger>
              <TabsTrigger value="tools" className="gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Tools</TabsTrigger>
              <TabsTrigger value="compliance" className="gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Compliance</TabsTrigger>
              <TabsTrigger value="activity" className="gap-1.5"><Activity className="h-3.5 w-3.5" /> Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="calendar">
              <CalendarPanel queue={queue} hasBrief={!!brief} />
            </TabsContent>

            <TabsContent value="strategy">
              <StrategyPanel brief={brief} />
            </TabsContent>

            <TabsContent value="tools">
              <ToolsPanel />
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
    </>
  );
}

/* ====================== Subcomponents ====================== */

function ActivationToggle({ isActive, isLocked, hasBrief }: { isActive: boolean; isLocked: boolean; hasBrief: boolean }) {
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
        onCheckedChange={() => {
          if (!hasBrief) {
            // TODO Session B: open Brief Wizard + AUP confirmation flow
            alert('Onboarding-Wizard kommt in Session B. Aktuell ist nur die Foundation live — der Toggle funktioniert nach Wizard-Build.');
            return;
          }
          alert('Toggle-Logik erfordert Edge Function (Session B). Cockpit-Anzeige ist bereits live.');
        }}
        aria-label="Autopilot aktivieren"
      />
      <Power className={cn('h-4 w-4', isActive ? 'text-primary' : 'text-muted-foreground')} />
    </div>
  );
}

function CalendarPanel({ queue, hasBrief }: { queue: ReturnType<typeof useAutopilotQueue>['data']; hasBrief: boolean }) {
  if (!hasBrief) {
    return (
      <Card className="p-12 text-center border-dashed">
        <Calendar className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
        <h3 className="font-serif text-xl mb-1">Noch kein Plan</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Aktiviere den Autopilot oben — die KI erstellt automatisch einen 14-Tage-Plan basierend auf deinem Brief und den aktuellen Trends.
        </p>
      </Card>
    );
  }
  if (!queue || queue.length === 0) {
    return (
      <Card className="p-12 text-center border-dashed">
        <Sparkles className="h-10 w-10 text-primary/60 mx-auto mb-3 animate-pulse" />
        <h3 className="font-serif text-xl mb-1">KI plant gerade…</h3>
        <p className="text-sm text-muted-foreground">Erste Slots erscheinen innerhalb der nächsten Minuten.</p>
      </Card>
    );
  }
  return (
    <div className="grid gap-2">
      {queue.map((slot) => (
        <Card key={slot.id} className="p-3 flex items-center gap-3">
          <div className="text-xs text-muted-foreground w-32 shrink-0">
            {new Date(slot.scheduled_at).toLocaleString()}
          </div>
          <Badge variant="outline" className="text-[10px]">{slot.platform}</Badge>
          <Badge variant="outline" className="text-[10px] uppercase">{slot.language}</Badge>
          <div className="flex-1 text-sm truncate">{slot.topic_hint || slot.caption || 'Ohne Titel'}</div>
          <Badge className={cn(
            'text-[10px]',
            slot.status === 'posted' && 'bg-emerald-600',
            slot.status === 'scheduled' && 'bg-primary text-primary-foreground',
            slot.status === 'qa_review' && 'bg-amber-500 text-white',
            slot.status === 'blocked' && 'bg-destructive',
            slot.status === 'failed' && 'bg-destructive/70',
          )}>{slot.status}</Badge>
        </Card>
      ))}
    </div>
  );
}

function StrategyPanel({ brief }: { brief: ReturnType<typeof useAutopilotBrief>['data'] }) {
  if (!brief) {
    return (
      <Card className="p-8 text-center border-dashed">
        <Settings className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Noch kein Brief erstellt — wird beim ersten Aktivieren konfiguriert.</p>
      </Card>
    );
  }
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <StatCard label="Themen-Pillars" value={brief.topic_pillars.join(' · ') || '—'} />
      <StatCard label="Verbots-Themen" value={brief.forbidden_topics.join(' · ') || 'keine'} />
      <StatCard label="Tonalität" value={brief.tonality} />
      <StatCard label="Plattformen" value={brief.platforms.join(' · ') || '—'} />
      <StatCard label="Sprachen" value={brief.languages.join(' · ').toUpperCase()} />
      <StatCard label="Auto-Publish" value={brief.auto_publish_enabled ? 'AN' : 'AUS (Co-Pilot)'} />
    </div>
  );
}

function ToolsPanel() {
  const tools = [
    { name: 'Video Composer', desc: 'Mehrszenige AI-Videos mit konsistenten Charakteren', status: 'verfügbar' },
    { name: 'Picture Studio', desc: 'AI-Bilder, Magic Edit, Style-Reference, Brand-Kit', status: 'verfügbar' },
    { name: 'Music Studio', desc: 'Hintergrundmusik via Stable Audio + MiniMax', status: 'verfügbar' },
    { name: 'Talking Head Avatare', desc: 'Lippensynchrone Avatar-Videos mit Stimme', status: 'verfügbar' },
    { name: 'Trend Radar', desc: 'Lokalisierte Trends, alle 5 Stunden aktualisiert', status: 'live' },
    { name: 'Posting Berater', desc: 'Optimale Veröffentlichungszeiten pro Plattform/Sprache', status: 'verfügbar' },
    { name: 'KI-QA-Gate', desc: 'Vision-Check auf Brand-CI, Copyright, Deepfakes', status: 'aktiv' },
    { name: 'Performance-Loop', desc: 'Lernende Optimierung — kommt in Stufe 2', status: 'geplant' },
  ];
  return (
    <div className="grid md:grid-cols-2 gap-3">
      {tools.map((t) => (
        <Card key={t.name} className="p-3 flex items-start gap-3">
          <span className={cn(
            'h-2 w-2 rounded-full mt-1.5 shrink-0',
            t.status === 'aktiv' || t.status === 'live' ? 'bg-emerald-500 shadow-[0_0_6px_rgb(16,185,129)]'
            : t.status === 'verfügbar' ? 'bg-primary'
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
        <StatCard label="Soft-Strikes" value={String(counts.soft)} sub="Hinweise, kein Limit" />
        <StatCard label="Hard-Strikes (aktiv)" value={String(counts.hard)} sub="Bei 2 → 7 Tage Sperre" />
        <StatCard label="Critical-Strikes (aktiv)" value={String(counts.critical)} sub="Kann zur Termination führen" highlight={counts.critical > 0} />
      </div>

      <Card className="p-5 bg-muted/30">
        <h4 className="font-serif text-lg mb-2">Aktive Verstöße</h4>
        {!strikes || strikes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Keine Verstöße — sauberer Account.</p>
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
        <p className="text-sm text-muted-foreground">Noch keine KI-Aktivität — wird sichtbar, sobald der Autopilot aktiv ist.</p>
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
