import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import {
  Film,
  Users,
  MapPin,
  Mic,
  Sparkles,
  ArrowRight,
  Clapperboard,
  Wand2,
  Layers,
  Zap,
  PlayCircle,
  Plus,
  Camera,
  Wallet,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useMotionStudioLibrary } from '@/hooks/useMotionStudioLibrary';
import { useCustomVoices } from '@/hooks/useCustomVoices';
import { useAIVideoWallet } from '@/hooks/useAIVideoWallet';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { CostComparisonWidget } from '@/components/motion-studio/CostComparisonWidget';

interface RecentProject {
  id: string;
  title: string;
  status: string;
  updated_at: string;
  category: string | null;
}

const QUICK_ACTIONS = [
  {
    title: 'Video Composer',
    desc: 'Szenen-basierte KI-Video-Produktion mit Continuity & Director-Presets',
    icon: Clapperboard,
    href: '/video-composer',
    accent: 'from-primary/30 to-primary/5',
    badge: 'Hauptfeature',
  },
  {
    title: 'Character & Location Library',
    desc: 'Wiederkehrende Figuren und Schauplätze für visuelle Konsistenz',
    icon: Users,
    href: '/motion-studio/library',
    accent: 'from-secondary/30 to-secondary/5',
    badge: null,
  },
  {
    title: 'Voice Library',
    desc: 'Eigene Stimmen klonen und für Voiceovers nutzen',
    icon: Mic,
    href: '/audio-studio',
    accent: 'from-accent/30 to-accent/5',
    badge: null,
  },
  {
    title: 'AI Video Studios',
    desc: 'Sora, Kling, Luma, Wan, Hailuo & Seedance direkt ansprechen',
    icon: Sparkles,
    href: '/ai-video-studio',
    accent: 'from-primary/20 to-accent/10',
    badge: null,
  },
] as const;

const TOOLBOX_ITEMS = [
  {
    icon: Camera,
    title: 'Director Presets',
    desc: '25+ Camera-, Lens-, Lighting- und Film-Stock-Modifier in jeder Szene.',
  },
  {
    icon: Layers,
    title: 'Frame-to-Shot Continuity',
    desc: 'Letzten Frame als Start für die nächste Szene → nahtlose Cuts.',
  },
  {
    icon: Wand2,
    title: '@-Tag Mention Editor',
    desc: 'Tagge `@charakter` und `@location` direkt im Prompt – Library wird automatisch aufgelöst.',
  },
  {
    icon: Zap,
    title: 'Bulk-Generierung',
    desc: 'Mehrere Szenen parallel rendern – wie ein echtes Studio-Pipeline-Setup.',
  },
];

export default function MotionStudioHub() {
  const { user } = useAuth();
  const { characters, locations, loading: libLoading } = useMotionStudioLibrary();
  const { voices, loading: voicesLoading } = useCustomVoices();
  const { wallet, loading: walletLoading } = useAIVideoWallet();
  const [recent, setRecent] = useState<RecentProject[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadRecent() {
      if (!user) {
        setRecent([]);
        setRecentLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from('composer_projects')
        .select('id, title, status, updated_at, category')
        .order('updated_at', { ascending: false })
        .limit(5);
      if (!cancelled) {
        if (!error && data) setRecent(data as RecentProject[]);
        setRecentLoading(false);
      }
    }
    loadRecent();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const stats = [
    {
      label: 'Charaktere',
      value: characters.length,
      icon: Users,
      loading: libLoading,
    },
    {
      label: 'Locations',
      value: locations.length,
      icon: MapPin,
      loading: libLoading,
    },
    {
      label: 'Custom Voices',
      value: voices.length,
      icon: Mic,
      loading: voicesLoading,
    },
    {
      label: 'AI-Video Guthaben',
      value: walletLoading
        ? '—'
        : wallet
          ? `${wallet.currency === 'USD' ? '$' : '€'}${wallet.balance_euros.toFixed(2)}`
          : '—',
      icon: Wallet,
      loading: walletLoading,
    },
  ];

  return (
    <>
      <Helmet>
        <title>Motion Studio Hub | AdTool</title>
        <meta
          name="description"
          content="Zentrales Cockpit für KI-Videoproduktion: Composer, Character & Location Library, Voice Cloning und alle AI Video Studios."
        />
      </Helmet>

      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
        <div className="container max-w-7xl mx-auto px-4 py-10 space-y-10">
          {/* Hero */}
          <header className="space-y-4">
            <Badge variant="outline" className="gap-1.5">
              <Film className="h-3 w-3" />
              Motion Studio Pro
            </Badge>
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div>
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
                  Dein <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Director's Cockpit</span>
                </h1>
                <p className="text-muted-foreground mt-2 max-w-2xl">
                  Alles, was du für professionelle KI-Videoproduktion brauchst – Library, Voices, Composer
                  und alle Generierungs-Engines an einem Ort. Studio-Power mit transparenter Pay-per-Use-Preisgestaltung.
                </p>
              </div>
              <div className="flex gap-2">
                <Button asChild size="lg" className="gap-2">
                  <Link to="/video-composer">
                    <PlayCircle className="h-4 w-4" />
                    Neues Projekt
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="gap-2">
                  <Link to="/motion-studio/library">
                    <Plus className="h-4 w-4" />
                    Library
                  </Link>
                </Button>
              </div>
            </div>
          </header>

          {/* Stats */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((s) => (
              <Card
                key={s.label}
                className="p-5 backdrop-blur-xl bg-card/60 border-border/50"
              >
                <div className="flex items-center justify-between mb-3">
                  <s.icon className="h-5 w-5 text-muted-foreground" />
                </div>
                {s.loading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-3xl font-bold">{s.value}</div>
                )}
                <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
              </Card>
            ))}
          </section>

          {/* Cost Comparison + Quick actions */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <CostComparisonWidget />
            </div>
            <div className="lg:col-span-2 space-y-4">
              <h2 className="text-2xl font-semibold">Module</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {QUICK_ACTIONS.map((a) => (
                  <Link key={a.href} to={a.href} className="group">
                    <Card
                      className={`relative p-6 h-full overflow-hidden transition-all hover:scale-[1.01] hover:shadow-2xl border-border/50 backdrop-blur-xl bg-card/60`}
                    >
                      <div
                        className={`absolute inset-0 bg-gradient-to-br ${a.accent} opacity-50 group-hover:opacity-80 transition-opacity`}
                      />
                      <div className="relative space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="h-12 w-12 rounded-xl bg-background/80 backdrop-blur flex items-center justify-center">
                            <a.icon className="h-6 w-6 text-primary" />
                          </div>
                          {a.badge && (
                            <Badge className="bg-primary/20 text-primary border-primary/30">
                              {a.badge}
                            </Badge>
                          )}
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold">{a.title}</h3>
                          <p className="text-sm text-muted-foreground mt-1">{a.desc}</p>
                        </div>
                        <div className="flex items-center text-sm text-primary group-hover:gap-2 transition-all">
                          Öffnen
                          <ArrowRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          </section>

          {/* Two-column: Recent projects + Toolbox */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Recent projects */}
            <Card className="lg:col-span-2 p-6 backdrop-blur-xl bg-card/60 border-border/50">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Letzte Composer-Projekte</h3>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/video-composer">Alle anzeigen</Link>
                </Button>
              </div>
              {recentLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : recent.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Clapperboard className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Noch keine Projekte. Starte dein erstes Video.</p>
                  <Button asChild className="mt-4 gap-2">
                    <Link to="/video-composer">
                      <Plus className="h-4 w-4" />
                      Projekt erstellen
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {recent.map((p) => (
                    <Link
                      key={p.id}
                      to={`/video-composer?project=${p.id}`}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/60 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                          <Film className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium truncate">{p.title || 'Unbenannt'}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(p.updated_at).toLocaleString('de-DE', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                            {p.category ? ` · ${p.category}` : ''}
                          </div>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {p.status}
                      </Badge>
                    </Link>
                  ))}
                </div>
              )}
            </Card>

            {/* Director's Toolbox */}
            <Card className="p-6 backdrop-blur-xl bg-card/60 border-border/50">
              <div className="flex items-center gap-2 mb-4">
                <Wand2 className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Director's Toolbox</h3>
              </div>
              <div className="space-y-4">
                {TOOLBOX_ITEMS.map((t) => (
                  <div key={t.title} className="flex gap-3">
                    <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      <t.icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{t.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 leading-snug">
                        {t.desc}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </section>
        </div>
      </div>
    </>
  );
}
