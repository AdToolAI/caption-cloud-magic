import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Footer } from "@/components/Footer";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Sparkles, Layers, Wand2, Gem, Loader2 } from "lucide-react";
import { PictureStudioHeader } from "@/components/picture-studio/PictureStudioHeader";
import { ImageGenerator } from "@/components/picture-studio/ImageGenerator";
import { MagicEditPanel } from "@/components/picture-studio/MagicEditPanel";
import { BatchGeneratePanel } from "@/components/picture-studio/BatchGeneratePanel";
import { EnhancePanel } from "@/components/picture-studio/EnhancePanel";
import { ActiveAssetProvider } from "@/components/picture-studio/ActiveAssetContext";
import { useTranslation } from "@/hooks/useTranslation";
import { tx } from "@/lib/i18nText";
import { lazy, Suspense } from "react";
import { useTrackPageFeature } from "@/hooks/useTrackPageFeature";

const SmartBackgroundTab = lazy(() => import("./BackgroundReplacer"));

const VALID_TABS = ["generate", "edit", "enhance", "background"] as const;
type StudioTab = (typeof VALID_TABS)[number];
type GenerateMode = "single" | "batch";

/** Legacy deep links keep the user's original intent. */
function resolveTab(rawTab: string | null, rawMode: string | null): { tab: StudioTab; mode: GenerateMode } {
  if (rawTab === "magic-edit") return { tab: "edit", mode: "single" };
  if (rawTab === "batch") return { tab: "generate", mode: "batch" };
  const tab = (VALID_TABS as readonly string[]).includes(rawTab || "")
    ? (rawTab as StudioTab)
    : "generate";
  return { tab, mode: rawMode === "batch" ? "batch" : "single" };
}

export default function PictureStudio() {
  useTrackPageFeature("picture_studio");
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation();

  const initial = resolveTab(searchParams.get("tab"), searchParams.get("mode"));
  const [activeTab, setActiveTab] = useState<StudioTab>(initial.tab);
  const [generateMode, setGenerateMode] = useState<GenerateMode>(initial.mode);

  // Normalise legacy URLs (?tab=magic-edit, ?tab=batch) once on mount.
  useEffect(() => {
    const raw = searchParams.get("tab");
    if (raw === "magic-edit" || raw === "batch") {
      const next = resolveTab(raw, searchParams.get("mode"));
      const params: Record<string, string> = { tab: next.tab };
      if (next.tab === "generate" && next.mode === "batch") params.mode = "batch";
      setSearchParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const TAB_CONFIG = useMemo(
    () => [
      { value: "generate" as const, label: t("picStudio.tabGenerate"), icon: Sparkles },
      { value: "edit" as const, label: tx({ de: "Bearbeiten", en: "Edit", es: "Editar" }), icon: Wand2 },
      { value: "enhance" as const, label: tx({ de: "Enhance", en: "Enhance", es: "Mejorar" }), icon: Gem },
      { value: "background" as const, label: t("picStudio.tabBackground"), icon: Layers },
    ],
    [t],
  );

  const handleTabChange = (tab: string) => {
    const next = resolveTab(tab, generateMode);
    setActiveTab(next.tab);
    const params: Record<string, string> = { tab: next.tab };
    if (next.tab === "generate" && generateMode === "batch") params.mode = "batch";
    setSearchParams(params);
  };

  const handleModeChange = (mode: GenerateMode) => {
    setGenerateMode(mode);
    const params: Record<string, string> = { tab: "generate" };
    if (mode === "batch") params.mode = "batch";
    setSearchParams(params);
  };

  return (
    <ActiveAssetProvider>
      <div className="bg-background">
        <div className="container mx-auto px-4 py-6 max-w-7xl">
          <Breadcrumbs feature={t("picStudio.pageTitle")} category="create" />

          <PictureStudioHeader />

          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className="w-full justify-start bg-muted/30 border border-border/50 rounded-xl p-1 mb-6">
              {TAB_CONFIG.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="flex items-center gap-2 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-lg px-4 py-2"
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <AnimatePresence mode="wait">
              <motion.div
                key={`${activeTab}-${generateMode}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <TabsContent value="generate" className="mt-0 space-y-4">
                  <div className="flex justify-end">
                    <div className="inline-flex rounded-lg border border-border/50 bg-muted/30 p-1">
                      {(["single", "batch"] as GenerateMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => handleModeChange(mode)}
                          className={`rounded-md px-4 py-1.5 text-sm transition-colors duration-200 ${
                            generateMode === mode
                              ? "bg-background shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {mode === "single"
                            ? tx({ de: "Einzeln", en: "Single", es: "Individual" })
                            : tx({ de: "Batch", en: "Batch", es: "Lote" })}
                        </button>
                      ))}
                    </div>
                  </div>
                  {generateMode === "batch" ? <BatchGeneratePanel /> : <ImageGenerator />}
                </TabsContent>

                <TabsContent value="edit" className="mt-0">
                  <MagicEditPanel />
                </TabsContent>

                <TabsContent value="enhance" className="mt-0">
                  <EnhancePanel />
                </TabsContent>

                <TabsContent value="background" className="mt-0">
                  <Suspense
                    fallback={
                      <div className="flex items-center justify-center py-20">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    }
                  >
                    <SmartBackgroundTab />
                  </Suspense>
                </TabsContent>
              </motion.div>
            </AnimatePresence>
          </Tabs>
        </div>

        <Footer />
      </div>
    </ActiveAssetProvider>
  );
}
