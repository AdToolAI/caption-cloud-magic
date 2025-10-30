import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { TranslationContext, useTranslationState } from "@/hooks/useTranslation";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Header } from "@/components/Header";
import { AppHeader } from "@/components/layout/AppHeader";
import { Loader2 } from "lucide-react";
import { CommandPalette } from "@/components/CommandPalette";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CookieConsent } from "@/components/CookieConsent";
import { CommandBar } from "@/components/ui/CommandBar";
import { OnboardingStepper } from "@/features/onboarding/Stepper";

const Index = lazy(() => import("./pages/Index"));
const Home = lazy(() => import("./pages/Home"));
const Generator = lazy(() => import("./pages/Generator"));
const PromptWizard = lazy(() => import("./pages/PromptWizard"));
const PostTimeAdvisor = lazy(() => import("./pages/PostTimeAdvisor"));
const HookGenerator = lazy(() => import("./pages/HookGenerator"));
const Rewriter = lazy(() => import("./pages/Rewriter"));
const GoalsDashboard = lazy(() => import("./pages/GoalsDashboard"));
const PerformanceTracker = lazy(() => import("./pages/PerformanceTracker"));
const CalendarPage = lazy(() => import("./pages/Calendar"));
const TemplateManager = lazy(() => import("./pages/TemplateManager"));
const ReviewLink = lazy(() => import("./pages/ReviewLink"));
const BioOptimizer = lazy(() => import("./pages/BioOptimizer"));
const ImageCaptionPairing = lazy(() => import("./pages/ImageCaptionPairing"));
const BrandKit = lazy(() => import("./pages/BrandKit"));
const Carousel = lazy(() => import("./pages/Carousel"));
const Coach = lazy(() => import("./pages/Coach"));
const Campaigns = lazy(() => import("./pages/Campaigns"));
const Audit = lazy(() => import("./pages/Audit"));
const AIPostGenerator = lazy(() => import("./pages/AIPostGenerator"));
const BackgroundReplacer = lazy(() => import("./pages/BackgroundReplacer"));
const TrendRadar = lazy(() => import("./pages/TrendRadar"));
const ReelScriptGenerator = lazy(() => import("./pages/ReelScriptGenerator"));
const CommentManager = lazy(() => import("./pages/CommentManager"));
const AllComments = lazy(() => import("./pages/AllComments"));
const MediaLibrary = lazy(() => import("./pages/MediaLibrary"));
const TeamWorkspace = lazy(() => import("./pages/TeamWorkspace"));
const AdvancedAnalytics = lazy(() => import("./pages/AdvancedAnalytics"));
const SmartScheduler = lazy(() => import("./pages/SmartScheduler"));
const WhiteLabel = lazy(() => import("./pages/WhiteLabel"));
const InstagramPublishing = lazy(() => import("./pages/InstagramPublishing"));
const Composer = lazy(() => import("./pages/Composer"));
const Account = lazy(() => import("./pages/Account"));
const Auth = lazy(() => import("./pages/Auth"));
const Pricing = lazy(() => import("./pages/Pricing"));
const FAQ = lazy(() => import("./pages/FAQ"));
const Billing = lazy(() => import("./pages/Billing"));
const Support = lazy(() => import("./pages/Support"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Legal = lazy(() => import("./pages/Legal"));
const DeleteData = lazy(() => import("./pages/DeleteData"));
const ComingSoon = lazy(() => import("./pages/ComingSoon"));
const Credits = lazy(() => import("./pages/Credits"));
const UpgradeEnterprise = lazy(() => import("./pages/UpgradeEnterprise"));
const AIMonitoring = lazy(() => import("./pages/AIMonitoring"));
const Monitoring = lazy(() => import("./pages/admin/Monitoring"));
const Unauthorized = lazy(() => import("./pages/Unauthorized"));
const UnifiedAnalytics = lazy(() => import("./pages/UnifiedAnalytics"));

const queryClient = new QueryClient();

function AppLayout() {
  const location = useLocation();
  const { user } = useAuth();
  
  // Landing page routes
  const isLandingRoute = ['/', '/auth', '/pricing', '/faq', '/legal', '/privacy', '/terms', '/delete-data'].includes(location.pathname) || location.pathname.startsWith('/legal/');
  
  return (
    <div className="flex min-h-screen w-full">
      {user && !isLandingRoute && <AppSidebar />}
      <div className="flex-1 w-full flex flex-col">
        {isLandingRoute ? <Header /> : <AppHeader />}
        {user && !isLandingRoute && <OnboardingStepper />}
        <main className="flex-1">
          <ErrorBoundary>
            <Suspense fallback={
              <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            }>
              <Routes>
                    {/* Public Landing Page - SEO optimiert */}
                    <Route path="/" element={<Index />} />
                    
                    {/* Main pages */}
                    <Route path="/home" element={<Home />} />
                    <Route path="/auth" element={<Auth />} />
                    <Route path="/account" element={<Account />} />
                    <Route path="/pricing" element={<Pricing />} />
                    <Route path="/faq" element={<FAQ />} />
                    <Route path="/billing" element={<Billing />} />
                    <Route path="/credits" element={<Credits />} />
                    <Route path="/upgrade-enterprise" element={<UpgradeEnterprise />} />
                    <Route path="/support" element={<Support />} />
                    <Route path="/onboarding" element={<Onboarding />} />
                    <Route path="/legal/:page" element={<Legal />} />
                    {/* Direct public routes for TikTok OAuth compliance */}
                    <Route path="/privacy" element={<Legal />} />
                    <Route path="/terms" element={<Legal />} />
                    <Route path="/delete-data" element={<DeleteData />} />
                    
                    {/* Feature pages - enabled */}
                    <Route path="/generator" element={<Generator />} />
                    <Route path="/prompt-wizard" element={<PromptWizard />} />
                    <Route path="/hook-generator" element={<HookGenerator />} />
                    <Route path="/rewriter" element={<Rewriter />} />
                    <Route path="/post-time-advisor" element={<PostTimeAdvisor />} />
                    <Route path="/goals" element={<GoalsDashboard />} />
                    <Route path="/calendar" element={<CalendarPage />} />
                    <Route path="/template-manager" element={<TemplateManager />} />
                    <Route path="/review/:token" element={<ReviewLink />} />
                    <Route path="/bio" element={<BioOptimizer />} />
                    
                    {/* Placeholder features - disabled */}
                    <Route path="/image-generator" element={<ComingSoon />} />
                    <Route path="/carousel-builder" element={<ComingSoon />} />
                    <Route path="/hashtag-manager" element={<ComingSoon />} />
                    <Route path="/campaign-reports" element={<ComingSoon />} />
                    <Route path="/coach" element={<Coach />} />
                    <Route path="/campaigns" element={<Campaigns />} />
                    <Route path="/audit" element={<Audit />} />
                    
                    {/* Design & Visuals features */}
                    <Route path="/image-caption-pairing" element={<ImageCaptionPairing />} />
                    <Route path="/brand-kit" element={<BrandKit />} />
                    <Route path="/carousel" element={<Carousel />} />
                    <Route path="/ai-post-generator" element={<AIPostGenerator />} />
          <Route path="/background-replacer" element={<BackgroundReplacer />} />
          <Route path="/trend-radar" element={<TrendRadar />} />
          <Route path="/reel-script-generator" element={<ReelScriptGenerator />} />
                    <Route path="/comment-manager" element={<CommentManager />} />
          <Route path="/all-comments" element={<AllComments />} />
          <Route path="/comment-manager" element={<CommentManager />} />
          <Route path="/media-library" element={<MediaLibrary />} />
          <Route path="/team-workspace" element={<TeamWorkspace />} />
          <Route path="/smart-scheduler" element={<SmartScheduler />} />
          <Route path="/white-label" element={<WhiteLabel />} />
          <Route path="/instagram-publishing" element={<InstagramPublishing />} />
          <Route path="/composer" element={<Composer />} />
          <Route path="/templates" element={<ComingSoon />} />
          <Route path="/brand-visualizer" element={<ComingSoon />} />
          <Route path="/design-assistant" element={<ComingSoon />} />
          <Route path="/ai-monitoring" element={<AIMonitoring />} />
          <Route path="/admin/monitoring" element={<Monitoring />} />
          <Route path="/analytics" element={<UnifiedAnalytics />} />
          <Route path="/unauthorized" element={<Unauthorized />} />
                    
                    {/* 404 catch-all - redirect to home */}
                    <Route path="*" element={<Navigate to="/home" replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

const AppContent = () => {
  const translationState = useTranslationState();

  return (
    <TranslationContext.Provider value={translationState}>
      <AuthProvider>
        <TooltipProvider>
          <SidebarProvider>
            <Toaster />
            <Sonner />
            <CookieConsent />
            <CommandBar />
            <CommandPalette />
            <AppLayout />
          </SidebarProvider>
        </TooltipProvider>
      </AuthProvider>
    </TranslationContext.Provider>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;