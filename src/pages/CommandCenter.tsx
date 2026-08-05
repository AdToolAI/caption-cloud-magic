import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Calendar as CalendarIcon, FileText, Package, Clock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { CommandCenterView } from "@/components/routing/CommandCenterRedirect";

const CalendarPage = lazy(() => import("./Calendar"));
const PlannerV2Lazy = lazy(() =>
  import("@/components/planner/PlannerV2").then((m) => ({ default: m.PlannerV2 })),
);
const PostingTimes = lazy(() => import("./PostingTimes"));
const Composer = lazy(() => import("./Composer"));

export type { CommandCenterView };

const VIEWS: CommandCenterView[] = ["calendar", "posts", "campaigns", "times"];

const ICONS: Record<CommandCenterView, typeof CalendarIcon> = {
  calendar: CalendarIcon,
  posts: FileText,
  campaigns: Package,
  times: Clock,
};

function ViewFallback() {
  return (
    <div className="space-y-4 py-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/**
 * Hält eine Ansicht nach der ersten Aktivierung gemountet und blendet sie
 * lediglich aus — so bleiben Filter, Monatsauswahl und Scrollposition erhalten.
 */
function KeepAlive({
  active,
  visited,
  children,
}: {
  active: boolean;
  visited: boolean;
  children: React.ReactNode;
}) {
  if (!visited) return null;
  return (
    <div
      hidden={!active}
      aria-hidden={!active}
      /* Unsichtbare Ansichten pausieren Animationen und Layout-Arbeit. */
      style={active ? undefined : { display: "none", contentVisibility: "hidden" }}
    >
      {children}
    </div>
  );
}

export default function CommandCenter() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const raw = searchParams.get("view") as CommandCenterView | null;
  const view: CommandCenterView = raw && VIEWS.includes(raw) ? raw : "calendar";
  const composerOpen = searchParams.get("compose") === "1";

  // Merkt sich, welche Ansichten der Nutzer bereits geöffnet hat (Lazy + KeepAlive).
  const [visited, setVisited] = useState<CommandCenterView[]>([view]);
  useEffect(() => {
    setVisited((prev) => (prev.includes(view) ? prev : [...prev, view]));
  }, [view]);

  const setView = useCallback(
    (next: CommandCenterView) => {
      const params = new URLSearchParams(searchParams);
      params.set("view", next);
      setSearchParams(params, { replace: false });
    },
    [searchParams, setSearchParams],
  );

  const setComposer = useCallback(
    (open: boolean) => {
      const params = new URLSearchParams(searchParams);
      if (open) params.set("compose", "1");
      else params.delete("compose");
      setSearchParams(params, { replace: !open });
    },
    [searchParams, setSearchParams],
  );

  const tabs = useMemo(
    () =>
      VIEWS.map((id) => ({
        id,
        label: t(`cc.${id}`),
        Icon: ICONS[id],
      })),
    [t],
  );

  const onTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      const index = VIEWS.indexOf(view);
      let next: CommandCenterView | null = null;
      if (event.key === "ArrowRight") next = VIEWS[(index + 1) % VIEWS.length];
      if (event.key === "ArrowLeft") next = VIEWS[(index - 1 + VIEWS.length) % VIEWS.length];
      if (event.key === "Home") next = VIEWS[0];
      if (event.key === "End") next = VIEWS[VIEWS.length - 1];
      if (!next) return;
      event.preventDefault();
      setView(next);
      requestAnimationFrame(() => {
        document.getElementById(`cc-tab-${next}`)?.focus();
      });
    },
    [setView, view],
  );

  return (
    <PageWrapper>
      <Helmet>
        <title>{t("cc.title")} | AdTool AI</title>
        <meta name="description" content={t("cc.subtitle")} />
        <link rel="canonical" href={`${window.location.origin}/command-center`} />
      </Helmet>

      <div className="container mx-auto px-4 py-6 space-y-5">
        {/* Kopfzeile */}
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative overflow-hidden rounded-2xl border border-primary/20 bg-card/60 backdrop-blur-md p-6"
        >
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-accent/10" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="font-heading text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                {t("cc.title")}
              </h1>
              <p className="mt-1 text-sm md:text-base text-muted-foreground">{t("cc.subtitle")}</p>
            </div>
            <Button onClick={() => setComposer(true)} className="gap-2 shadow-glow-gold">
              <Plus className="h-4 w-4" />
              {t("cc.newPost")}
            </Button>
          </div>

          {/* Ansichts-Umschalter */}
          <div
            role="tablist"
            aria-label={t("cc.views")}
            className="relative mt-5 inline-flex flex-wrap gap-1 rounded-xl border border-border/60 bg-background/40 p-1 backdrop-blur-md"
          >
            {tabs.map(({ id, label, Icon }) => {
              const selected = view === id;
              return (
                <button
                  key={id}
                  id={`cc-tab-${id}`}
                  role="tab"
                  type="button"
                  aria-selected={selected}
                  aria-controls={`cc-panel-${id}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setView(id)}
                  onKeyDown={onTabKeyDown}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected
                      ? "bg-primary/15 text-primary shadow-glow-gold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              );
            })}
          </div>
        </motion.header>

        {/* Ansichten — einmal geladen, danach nur noch ein-/ausgeblendet */}
        <Suspense fallback={<ViewFallback />}>
          <div id="cc-panel-calendar" role="tabpanel" aria-labelledby="cc-tab-calendar">
            <KeepAlive active={view === "calendar"} visited={visited.includes("calendar")}>
              <CalendarPage embedded />
            </KeepAlive>
          </div>
          <div id="cc-panel-posts" role="tabpanel" aria-labelledby="cc-tab-posts">
            <KeepAlive active={view === "posts"} visited={visited.includes("posts")}>
              <PlannerV2Lazy embedded forcedTab="posts" />
            </KeepAlive>
          </div>
          <div id="cc-panel-campaigns" role="tabpanel" aria-labelledby="cc-tab-campaigns">
            <KeepAlive active={view === "campaigns"} visited={visited.includes("campaigns")}>
              <PlannerV2Lazy embedded forcedTab="campaigns" />
            </KeepAlive>
          </div>
          <div id="cc-panel-times" role="tabpanel" aria-labelledby="cc-tab-times">
            <KeepAlive active={view === "times"} visited={visited.includes("times")}>
              <PostingTimes embedded />
            </KeepAlive>
          </div>
        </Suspense>
      </div>

      {/* Composer-Ebene */}
      <Dialog open={composerOpen} onOpenChange={(open) => setComposer(open)}>
        <DialogContent className="max-w-[min(1400px,96vw)] h-[92vh] overflow-y-auto p-0 gap-0">
          <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border/60 bg-background/85 px-5 py-3 backdrop-blur-xl">
            <DialogTitle className="font-heading text-lg">{t("cc.newPost")}</DialogTitle>
            <DialogDescription className="sr-only">{t("cc.newPostDesc")}</DialogDescription>
          </div>
          <div className="px-1 pb-6">
            <Suspense fallback={<ViewFallback />}>
              {composerOpen && <Composer embedded onPublished={() => setComposer(false)} />}
            </Suspense>
          </div>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
