import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Footer } from "@/components/Footer";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Sparkles, Layers, Wand2, ListChecks } from "lucide-react";
import { PictureStudioHeader } from "@/components/picture-studio/PictureStudioHeader";
import { ImageGenerator } from "@/components/picture-studio/ImageGenerator";
import { MagicEditPanel } from "@/components/picture-studio/MagicEditPanel";
import { BatchGeneratePanel } from "@/components/picture-studio/BatchGeneratePanel";
import { useTranslation } from "@/hooks/useTranslation";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

const SmartBackgroundTab = lazy(() => import("./BackgroundReplacer"));

export default function PictureStudio() {
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') || 'generate';
  const [activeTab, setActiveTab] = useState(defaultTab);
  const { t } = useTranslation();

  const TAB_CONFIG = useMemo(() => [
    { value: 'generate', label: t('picStudio.tabGenerate'), icon: Sparkles },
    { value: 'magic-edit', label: 'Magic Edit', icon: Wand2 },
    { value: 'batch', label: 'Batch', icon: ListChecks },
    { value: 'background', label: t('picStudio.tabBackground'), icon: Layers },
  ], [t]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  return (
    <div className="bg-background">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <Breadcrumbs feature={t('picStudio.pageTitle')} category={t('picStudio.breadcrumbCategory')} />

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
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <TabsContent value="generate" className="mt-0">
                <ImageGenerator />
              </TabsContent>

              <TabsContent value="magic-edit" className="mt-0">
                <MagicEditPanel />
              </TabsContent>

              <TabsContent value="background" className="mt-0">
                <Suspense fallback={
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                }>
                  <SmartBackgroundTab />
                </Suspense>
              </TabsContent>
            </motion.div>
          </AnimatePresence>
        </Tabs>
      </div>

      <Footer />
    </div>
  );
}
