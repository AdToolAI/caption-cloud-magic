import { useCallback, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { MessageSquare, RotateCcw, Sparkles, BookTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageWrapper } from "@/components/layout/PageWrapper";
import {
  ContentStudioProvider, STUDIO_STEPS, useContentStudio, type StudioStep,
} from "@/contexts/ContentStudioContext";
import { StepRail } from "@/components/content-studio/StepRail";
import { LivePreview } from "@/components/content-studio/LivePreview";
import { CoachPanel } from "@/components/content-studio/CoachPanel";
import { TemplateDrawer } from "@/components/content-studio/TemplateDrawer";
import { BriefStep } from "@/components/content-studio/steps/BriefStep";
import { CopyStep } from "@/components/content-studio/steps/CopyStep";
import { MotifStep } from "@/components/content-studio/steps/MotifStep";
import { LayoutStep } from "@/components/content-studio/steps/LayoutStep";
import { DeliverStep } from "@/components/content-studio/steps/DeliverStep";

function StudioBody({
  coachOpen,
  setCoachOpen,
  templatesOpen,
  setTemplatesOpen,
}: {
  coachOpen: boolean;
  setCoachOpen: (o: boolean) => void;
  templatesOpen: boolean;
  setTemplatesOpen: (o: boolean) => void;
}) {
  const s = useContentStudio();
  const wide = s.step === "layout" && s.hasDesign;

  return (
    <>
      <header className="mb-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h1 className="font-display text-2xl tracking-tight">Content Studio</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setTemplatesOpen(true)}>
              <BookTemplate className="mr-1.5 h-4 w-4" /> Vorlagen
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCoachOpen(true)}>
              <MessageSquare className="mr-1.5 h-4 w-4" /> Coach
            </Button>
            <Button variant="ghost" size="sm" onClick={s.reset}>
              <RotateCcw className="mr-1.5 h-4 w-4" /> Neu
            </Button>
          </div>
        </div>
        <StepRail step={s.step} reached={s.reached} onSelect={s.goTo} />
      </header>

      <motion.div
        key={s.step}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className={wide ? "" : "grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]"}
      >
        <div className="min-w-0">
          {s.step === "brief" && <BriefStep onOpenTemplates={() => setTemplatesOpen(true)} />}
          {s.step === "copy" && <CopyStep />}
          {s.step === "motif" && <MotifStep />}
          {s.step === "layout" && <LayoutStep />}
          {s.step === "deliver" && <DeliverStep />}
        </div>
        {!wide && (
          <aside className="hidden lg:block">
            <LivePreview />
          </aside>
        )}
      </motion.div>

      <CoachPanel open={coachOpen} onOpenChange={setCoachOpen} />
      <TemplateDrawer open={templatesOpen} onOpenChange={setTemplatesOpen} />
    </>
  );
}

export default function ContentStudio() {
  const [searchParams, setSearchParams] = useSearchParams();

  const raw = searchParams.get("step") as StudioStep | null;
  const step: StudioStep = raw && STUDIO_STEPS.includes(raw) ? raw : "brief";
  const coachOpen = searchParams.get("coach") === "1";
  const templatesOpen = searchParams.get("templates") === "1";

  const setParam = useCallback(
    (key: string, value: string | null, replace = false) => {
      const params = new URLSearchParams(searchParams);
      if (value === null) params.delete(key);
      else params.set(key, value);
      setSearchParams(params, { replace });
    },
    [searchParams, setSearchParams],
  );

  const goTo = useCallback((next: StudioStep) => setParam("step", next), [setParam]);

  const helmet = useMemo(
    () => (
      <Helmet>
        <title>Content Studio — vom Briefing zum fertigen Beitrag</title>
        <meta
          name="description"
          content="Briefing, Copy, KI-Motiv, Layout und Veröffentlichung in einem Ablauf. Einzelpost oder ganze Serie — inklusive Coach-Feedback und Vorlagen."
        />
      </Helmet>
    ),
    [],
  );

  return (
    <PageWrapper>
      {helmet}
      <div className="mx-auto max-w-[1500px] px-1 py-2">
        <ContentStudioProvider step={step} goTo={goTo}>
          <StudioBody
            coachOpen={coachOpen}
            setCoachOpen={(o) => setParam("coach", o ? "1" : null, !o)}
            templatesOpen={templatesOpen}
            setTemplatesOpen={(o) => setParam("templates", o ? "1" : null, !o)}
          />
        </ContentStudioProvider>
      </div>
    </PageWrapper>
  );
}
