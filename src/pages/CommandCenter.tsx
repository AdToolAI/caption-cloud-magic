import { lazy, Suspense, useCallback, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Calendar as CalendarIcon, FileText, Package, Clock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

const CalendarPage = lazy(() => import("./Calendar"));
const PlannerV2Lazy = lazy(() =>
  import("@/components/planner/PlannerV2").then((m) => ({ default: m.PlannerV2 })),
);
const PostingTimes = lazy(() => import("./PostingTimes"));
const Composer = lazy(() => import("./Composer"));

export type CommandCenterView = "calendar" | "posts" | "campaigns" | "times";

const VIEWS: CommandCenterView[] = ["calendar", "posts", "campaigns", "times"];

const COPY = {
  de: {
    title: "Content Command Center",
    subtitle: "Erstelle, plane und veröffentliche deinen Content über alle Plattformen.",
    newPost: "Neuer Post",
    calendar: "Kalender",
    posts: "Beiträge",
    campaigns: "Kampagnen",
    times: "Beste Zeiten",
    close: "Schließen",
  },
  en: {
    title: "Content Command Center",
    subtitle: "Create, schedule and publish your content across every platform.",
    newPost: "New post",
    calendar: "Calendar",
    posts: "Posts",
    campaigns: "Campaigns",
    times: "Best times",
    close: "Close",
  },
  es: {
    title: "Content Command Center",
    subtitle: "Crea, planifica y publica tu contenido en todas las plataformas.",
    newPost: "Nuevo post",
    calendar: "Calendario",
    posts: "Publicaciones",
    campaigns: "Campañas",
    times: "Mejores horas",
    close: "Cerrar",
  },
} as const;

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

export default function CommandCenter() {
  const { language } = useTranslation();
  const copy = COPY[(language as keyof typeof COPY)] ?? COPY.de;
  const [searchParams, setSearchParams] = useSearchParams();

  const raw = searchParams.get("view") as CommandCenterView | null;
  const view: CommandCenterView = raw && VIEWS.includes(raw) ? raw : "calendar";
  const composerOpen = searchParams.get("compose") === "1";

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
        label: copy[id],
        Icon: ICONS[id],
      })),
    [copy],
  );

  return (
    <PageWrapper>
      <Helmet>
        <title>Content Command Center | AdTool AI</title>
        <meta name="description" content={copy.subtitle} />
      </Helmet>

      <div className="container mx-auto px-4 py-6 space-y-5">
        {/* Kopfzeile */}
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative overflow-hidden rounded-2xl border border-primary/20 bg-card/60 backdrop-blur-md p-6"
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background:
                "radial-gradient(120% 140% at 0% 0%, hsla(43,90%,68%,0.16), transparent 55%), radial-gradient(100% 120% at 100% 0%, hsla(187,84%,55%,0.10), transparent 60%)",
            }}
          />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1
                className="font-heading text-3xl md:text-4xl font-bold tracking-tight"
                style={{
                  background: "linear-gradient(135deg, hsl(43 90% 68%), hsl(187 84% 55%))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                {copy.title}
              </h1>
              <p className="mt-1 text-sm md:text-base text-muted-foreground">{copy.subtitle}</p>
            </div>
            <Button onClick={() => setComposer(true)} className="gap-2 shadow-[0_0_24px_hsla(43,90%,68%,0.25)]">
              <Plus className="h-4 w-4" />
              {copy.newPost}
            </Button>
          </div>

          {/* Ansichts-Umschalter */}
          <div className="relative mt-5 inline-flex flex-wrap gap-1 rounded-xl border border-white/10 bg-background/40 p-1 backdrop-blur-md">
            {tabs.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setView(id)}
                aria-current={view === id}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm transition-all",
                  view === id
                    ? "bg-primary/15 text-primary shadow-[0_0_18px_hsla(43,90%,68%,0.18)]"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </motion.header>

        {/* Ansichten */}
        <Suspense fallback={<ViewFallback />}>
          {view === "calendar" && <CalendarPage embedded />}
          {view === "posts" && <PlannerV2Lazy key="posts" embedded forcedTab="posts" />}
          {view === "campaigns" && <PlannerV2Lazy key="campaigns" embedded forcedTab="campaigns" />}
          {view === "times" && <PostingTimes embedded />}
        </Suspense>
      </div>

      {/* Composer-Ebene */}
      <Dialog open={composerOpen} onOpenChange={(open) => setComposer(open)}>
        <DialogContent
          className="max-w-[min(1400px,96vw)] h-[92vh] overflow-y-auto p-0 gap-0"
        >
          <div className="sticky top-0 z-20 flex items-center justify-between border-b border-white/10 bg-background/85 px-5 py-3 backdrop-blur-xl">
            <span className="font-heading text-lg">{copy.newPost}</span>
          </div>
          <div className="px-1 pb-6">
            <Suspense fallback={<ViewFallback />}>
              {composerOpen && <Composer embedded />}
            </Suspense>
          </div>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
