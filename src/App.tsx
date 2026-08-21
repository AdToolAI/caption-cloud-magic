import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { TranslationContext, useTranslationState } from "@/hooks/useTranslation";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useAnalyticsSync } from "@/hooks/useAnalyticsSync";
import { useSessionTracking } from "@/hooks/useSessionTracking";
import { useConsoleErrorBuffer } from "@/hooks/useConsoleErrorBuffer";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

import { Header } from "@/components/Header";
import { AppHeader } from "@/components/layout/AppHeader";
import { FounderExperience } from "@/components/founders/FounderExperience";
import { ScrollToTop } from "@/components/layout/ScrollToTop";
import { Loader2 } from "lucide-react";
import { CommandPalette } from "@/components/CommandPalette";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { CookieConsent } from "@/components/CookieConsent";
import { CommandBar } from "@/components/ui/CommandBar";
import { NewsTicker } from "@/components/dashboard/NewsTicker";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { EmailVerificationGate } from "@/components/auth/EmailVerificationGate";
import { AICompanionWidget } from "@/components/ai-companion/AICompanionWidget";
import { ConciergeTipHost } from "@/components/ai-companion/ConciergeTipHost";
import { ConciergeIntroScreen } from "@/components/ai-companion/ConciergeIntroScreen";

import { GettingStartedChecklist } from "@/components/onboarding/GettingStartedChecklist";
import { ProductTour } from "@/components/onboarding/ProductTour";
import { UpgradeTriggerProvider } from "@/hooks/useUpgradeTrigger";
import { UpgradeMount } from "@/components/upgrade/UpgradeMount";
import { TrialBanner } from "@/components/trial/TrialBanner";
import { AccountPausedGate } from "@/components/trial/AccountPausedGate";
import { PinnedChatProvider } from "@/contexts/PinnedChatContext";
import PinnedChatWindow from "@/components/text-studio/PinnedChatWindow";


const Index = lazy(() => import("./pages/Index"));
const Home = lazy(() => import("./pages/Home"));
const PromptWizard = lazy(() => import("./pages/PromptWizard"));

const Rewriter = lazy(() => import("./pages/Rewriter"));
const GoalsDashboard = lazy(() => import("./pages/GoalsDashboard"));
const PerformanceTracker = lazy(() => import("./pages/PerformanceTracker"));
const TikTokOAuthCallback = lazy(() => import("./pages/TikTokOAuthCallback"));
const ReviewLink = lazy(() => import("./pages/ReviewLink"));
const BioOptimizer = lazy(() => import("./pages/BioOptimizer"));
const BrandKit = lazy(() => import("./pages/BrandKit"));
const Carousel = lazy(() => import("./pages/Carousel"));

const ContentStudio = lazy(() => import("./pages/ContentStudio"));
const CommandCenter = lazy(() => import("./pages/CommandCenter"));
import { CommandCenterRedirect } from "./components/routing/CommandCenterRedirect";
import { ContentStudioRedirect } from "./components/routing/ContentStudioRedirect";
const BackgroundReplacer = lazy(() => import("./pages/BackgroundReplacer"));
const PictureStudio = lazy(() => import("./pages/PictureStudio"));
const TrendRadar = lazy(() => import("./pages/TrendRadar"));
const NewsHub = lazy(() => import("./pages/NewsHub"));

const AllComments = lazy(() => import("./pages/AllComments"));
const MediaLibrary = lazy(() => import("./pages/MediaLibrary"));
const MediaProfiles = lazy(() => import("./pages/MediaProfiles"));
const TeamWorkspace = lazy(() => import("./pages/TeamWorkspace"));
const AdvancedAnalytics = lazy(() => import("./pages/AdvancedAnalytics"));
const SmartScheduler = lazy(() => import("./pages/SmartScheduler"));
const WhiteLabel = lazy(() => import("./pages/WhiteLabel"));
const InstagramPublishing = lazy(() => import("./pages/InstagramPublishing"));
const Account = lazy(() => import("./pages/Account"));
const Auth = lazy(() => import("./pages/Auth"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"));
const CheckEmail = lazy(() => import("./pages/CheckEmail"));
const EmailPreferences = lazy(() => import("./pages/EmailPreferences"));

const Pricing = lazy(() => import("./pages/Pricing"));
const FAQ = lazy(() => import("./pages/FAQ"));
const Billing = lazy(() => import("./pages/Billing"));
const Welcome = lazy(() => import("./pages/Welcome"));
const Support = lazy(() => import("./pages/Support"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Legal = lazy(() => import("./pages/Legal"));
const DeleteData = lazy(() => import("./pages/DeleteData"));
const DeleteAccount = lazy(() => import("./pages/DeleteAccount"));
const ComingSoon = lazy(() => import("./pages/ComingSoon"));
const Status = lazy(() => import("./pages/Status"));
// Credits page retired — Beta abo (14.99€) deckt alles ab; Media-Credits laufen über AI Video Studio (ai_video_wallets).
// UpgradeEnterprise page retired during Beta — route redirects to /pricing
const AIMonitoring = lazy(() => import("./pages/AIMonitoring"));
const VideoManagement = lazy(() => import("./pages/VideoManagement"));
const ContentProjects = lazy(() => import("./pages/ContentProjects"));
const UniversalCreator = lazy(() => import("./pages/UniversalCreator"));
const UniversalVideoCreator = lazy(() => import("./pages/UniversalVideoCreator"));
const UniversalDirectorsCut = lazy(() => import("./pages/DirectorsCut"));
const CompareLab = lazy(() => import("./pages/CompareLab"));
const AITextStudio = lazy(() => import("./pages/AITextStudio"));


const PersonalizedDashboard = lazy(() => import("./pages/PersonalizedDashboard"));
// Admin routes - lazy loaded for better performance
const Monitoring = lazy(() => import("./pages/admin/Monitoring"));
const FeatureFlags = lazy(() => import("./pages/admin/FeatureFlags"));
const AdminAnalytics = lazy(() => import("./pages/admin/AdminAnalytics"));
const Unauthorized = lazy(() => import("./pages/Unauthorized"));
const UnifiedAnalytics = lazy(() => import("./pages/UnifiedAnalytics"));
const Integrations = lazy(() => import("./pages/Integrations"));
const PostHogDashboard = lazy(() => import("./pages/PostHogDashboard"));
const PostHogEventTester = lazy(() => import("./pages/debug/PostHogEventTester"));
const DebugLipsync = lazy(() => import("./pages/DebugLipsync"));
const FeatureFlagDemo = lazy(() => import("./pages/FeatureFlagDemo"));
const UsageReports = lazy(() => import("./pages/Analytics/UsageReports"));
const PlatformAnalytics = lazy(() => import("./pages/Analytics/PlatformAnalytics"));
const Admin = lazy(() => import("./pages/Admin"));
const LambdaHealth = lazy(() => import("./pages/admin/LambdaHealth"));
const QACockpit = lazy(() => import("./pages/admin/QACockpit"));


const AIVideoToolkit = lazy(() => import("./pages/AIVideoToolkit"));
const AvatarDetail = lazy(() => import("./pages/AvatarDetail"));
const Locations = lazy(() => import("./pages/Locations"));
const Library = lazy(() => import("./pages/Library"));
const VideoComposer = lazy(() => import("./pages/VideoComposer"));
const RenderQueue = lazy(() => import("./pages/RenderQueue"));
const CreatorLibrary = lazy(() => import("./pages/CreatorLibrary"));
const EmailDirector = lazy(() => import("./pages/EmailDirector"));
const MotionStudioLibrary = lazy(() => import("./pages/MotionStudio/Library"));
const MotionStudioHub = lazy(() => import("./pages/MotionStudio/Hub"));
const MotionStudioStudioMode = lazy(() => import("./pages/MotionStudio/StudioMode"));
const Marketplace = lazy(() => import("./pages/Marketplace"));
const CreatorStudio = lazy(() => import("./pages/CreatorStudio"));
const MarketplaceCreatorTerms = lazy(() => import("./pages/legal/MarketplaceCreatorTerms"));
const MarketplaceBuyerTerms = lazy(() => import("./pages/legal/MarketplaceBuyerTerms"));
const CharacterTakedownRequest = lazy(() => import("./pages/legal/CharacterTakedownRequest"));
const Autopilot = lazy(() => import("./pages/Autopilot"));
const AutopilotAUP = lazy(() => import("./pages/legal/AutopilotAUP"));
const AIVideoRefundPolicy = lazy(() => import("./pages/legal/AIVideoRefundPolicy"));

const AudioStudio = lazy(() => import("./pages/AudioStudio"));
const MusicStudio = lazy(() => import("./pages/MusicStudio"));
const SfxLibrary = lazy(() => import("./pages/SfxLibrary"));
const StockVideos = lazy(() => import("./pages/StockVideos"));
const VerifyLicense = lazy(() => import("./pages/VerifyLicense"));
const SharedBrandKit = lazy(() => import("./pages/SharedBrandKit"));
const MyLicenses = lazy(() => import("./pages/MyLicenses"));

const HubPage = lazy(() => import("./pages/HubPage"));
const Community = lazy(() => import("./pages/Community"));
const GamingHub = lazy(() => import("./pages/GamingHub"));

const queryClient = new QueryClient();

function AppLayout() {
  const location = useLocation();
  const { user } = useAuth();
  
  // Sync analytics data automatically for authenticated users
  useAnalyticsSync();
  
  // Track user sessions for security
  useSessionTracking(user?.id);
  
  // Landing page routes
  const isLandingRoute = ['/', '/auth', '/pricing', '/faq', '/legal', '/privacy', '/terms', '/imprint', '/delete-data', '/coming-soon'].includes(location.pathname) || location.pathname.startsWith('/legal/') || location.pathname.startsWith('/brand/');
  
  return (
    <div className="flex w-full">
      <ScrollToTop />
      {user && <FounderExperience />}
      {user && !isLandingRoute && <AppSidebar />}
      <div className="min-w-0 flex-1 flex flex-col">
        {isLandingRoute ? <Header /> : <AppHeader />}
        {user && !isLandingRoute && <TrialBanner />}
        {user && <NewsTicker />}
        {/* Genau EIN Onboarding-Surface: die GettingStartedChecklist. Der alte
            Sticky-Stepper zeigte eine zweite, widersprüchliche Schrittliste. */}
        <main className="flex-1">
          <ErrorBoundary>
            <AccountPausedGate>
            <Suspense fallback={
              <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            }>
              <Routes>
                    {/* Public Landing Page - SEO optimiert */}
                    <Route path="/" element={user ? <Navigate to="/home" replace /> : <Index />} />
                    
                    {/* Main pages */}
                    <Route path="/home" element={<ProtectedRoute redirectTo="/"><Home /></ProtectedRoute>} />
                    <Route path="/debug/lipsync/:sceneId" element={<ProtectedRoute><DebugLipsync /></ProtectedRoute>} />
                    <Route path="/hub/:hubKey" element={<HubPage />} />
                    <Route path="/auth" element={<Auth />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                   <Route path="/verify-email" element={<VerifyEmail />} />
                   <Route path="/auth/check-email" element={<CheckEmail />} />
                   <Route path="/email-preferences" element={<EmailPreferences />} />
                   
                   <Route path="/account" element={<Account />} />
                    <Route path="/account/delete" element={<ProtectedRoute><DeleteAccount /></ProtectedRoute>} />
                    <Route path="/pricing" element={<Pricing />} />
                    <Route path="/faq" element={<FAQ />} />
                    <Route path="/billing" element={<Billing />} />
                    <Route path="/willkommen" element={<ProtectedRoute><Welcome /></ProtectedRoute>} />
                    {/* /welcome rendert dieselbe Seite (Query-Parameter wie session_id bleiben erhalten) */}
                    <Route path="/welcome" element={<ProtectedRoute><Welcome /></ProtectedRoute>} />
                    {/* /credits retired — Beta abo deckt alles ab. Media-Credits im AI Video Studio. */}
                    <Route path="/credits" element={<Navigate to="/billing" replace />} />
                    {/* Beta: single plan only — legacy Enterprise upgrade path redirects to /pricing */}
                    <Route path="/upgrade-enterprise" element={<Navigate to="/pricing" replace />} />
                    <Route path="/support" element={<Support />} />
                    <Route path="/onboarding" element={<Onboarding />} />
                    {/* Marketplace legal — must come before /legal/:page catchall */}
                    <Route path="/legal/marketplace-creator-terms" element={<MarketplaceCreatorTerms />} />
                    <Route path="/legal/marketplace-buyer-terms" element={<MarketplaceBuyerTerms />} />
                    <Route path="/legal/character-takedown-request" element={<CharacterTakedownRequest />} />
                    <Route path="/legal/autopilot-aup" element={<AutopilotAUP />} />
                    <Route path="/legal/ai-video-refund" element={<AIVideoRefundPolicy />} />
                    <Route path="/legal/:page" element={<Legal />} />
                    {/* Direct public routes for TikTok OAuth compliance */}
                    <Route path="/privacy" element={<Legal />} />
                    <Route path="/terms" element={<Legal />} />
                    <Route path="/imprint" element={<Legal />} />
                    <Route path="/delete-data" element={<DeleteData />} />
                    <Route path="/coming-soon" element={<ComingSoon />} />
                    <Route path="/status" element={<Status />} />
                    <Route path="/verify/:token" element={<VerifyLicense />} />
                    <Route path="/brand/:token" element={<SharedBrandKit />} />
                    
                    {/* Feature pages - enabled */}
                    <Route path="/generator" element={<Navigate to="/ai-text-studio" replace />} />
                    <Route path="/ai-text-studio" element={<AITextStudio />} />
                    <Route path="/prompt-wizard" element={<Navigate to="/ai-text-studio" replace />} />
                    
                    <Route path="/rewriter" element={<Rewriter />} />
                    <Route path="/command-center" element={<CommandCenter />} />
                    <Route path="/post-time-advisor" element={<CommandCenterRedirect view="times" />} />
                    <Route path="/posting-times" element={<CommandCenterRedirect view="times" />} />
                    <Route path="/goals" element={<GoalsDashboard />} />
                    <Route path="/performance" element={<PerformanceTracker />} />
                    <Route path="/api/oauth/tiktok/callback" element={<TikTokOAuthCallback />} />
                    <Route path="/calendar" element={<CommandCenterRedirect view="calendar" />} />
                    <Route path="/planner" element={<CommandCenterRedirect view="posts" />} />
                    <Route path="/content-studio" element={<ContentStudio />} />
                    <Route path="/template-manager" element={<ContentStudioRedirect templates />} />
                    <Route path="/review/:token" element={<ReviewLink />} />
                    <Route path="/bio" element={<BioOptimizer />} />
                    
                    {/* Placeholder features - disabled */}
                    <Route path="/image-generator" element={<ComingSoon />} />
                    <Route path="/carousel-builder" element={<ComingSoon />} />
                    <Route path="/hashtag-manager" element={<ComingSoon />} />
                    <Route path="/campaign-reports" element={<ComingSoon />} />
                    <Route path="/coach" element={<ContentStudioRedirect coach />} />
                    <Route path="/campaigns" element={<ContentStudioRedirect step="deliver" series />} />
                    
                    
                    {/* Design & Visuals features */}
                    <Route path="/image-caption-pairing" element={<ContentStudioRedirect step="motif" />} />
                    <Route path="/brand-kit" element={<BrandKit />} />
                    <Route path="/carousel" element={<Carousel />} />
                    <Route path="/ai-post-generator" element={<ContentStudioRedirect step="brief" />} />
                    <Route path="/post-designer" element={<ContentStudioRedirect step="layout" />} />

           <Route path="/background-replacer" element={<Navigate to="/picture-studio?tab=background" replace />} />
           <Route path="/picture-studio" element={<PictureStudio />} />
          <Route path="/trend-radar" element={<TrendRadar />} />
          <Route path="/news-hub" element={<NewsHub />} />
          
                    <Route path="/comment-manager" element={<Navigate to="/all-comments" replace />} />
          <Route path="/all-comments" element={<AllComments />} />

                <Route path="/media-library" element={<MediaLibrary />} />
                <Route path="/media-profiles" element={<MediaProfiles />} />
                <Route path="/videos" element={<Navigate to="/content-projects" replace />} />
                <Route path="/content-projects" element={<ContentProjects />} />
                <Route path="/universal-creator" element={<UniversalCreator />} />
                <Route path="/universal-creator/library" element={<Navigate to="/media-library" replace />} />
                <Route path="/universal-video-creator" element={<UniversalVideoCreator />} />
                <Route path="/universal-directors-cut" element={<UniversalDirectorsCut />} />
                <Route path="/directors-cut" element={<Navigate to="/universal-directors-cut" replace />} />
                <Route path="/voice-library" element={<Navigate to="/audio-studio" replace />} />
                <Route path="/personalized-dashboard" element={<PersonalizedDashboard />} />
          <Route path="/team-workspace" element={<TeamWorkspace />} />
          <Route path="/smart-scheduler" element={<SmartScheduler />} />
          <Route path="/white-label" element={<WhiteLabel />} />
          <Route path="/instagram-publishing" element={<InstagramPublishing />} />
          <Route path="/composer" element={<CommandCenterRedirect compose />} />
          {/* Unified AI Video Toolkit — replaces former individual studios */}
          <Route path="/ai-video-studio" element={<AIVideoToolkit />} />
          <Route path="/ai-video-toolkit" element={<Navigate to="/ai-video-studio" replace />} />
          <Route path="/brand-characters" element={<Navigate to="/library" replace />} />
          <Route path="/avatars" element={<Navigate to="/library" replace />} />
          <Route path="/avatars/:id" element={<ProtectedRoute><AvatarDetail /></ProtectedRoute>} />
          <Route path="/locations" element={<ProtectedRoute><Locations /></ProtectedRoute>} />
          <Route path="/library" element={<ProtectedRoute><Library /></ProtectedRoute>} />
          <Route path="/kling-video-studio" element={<Navigate to="/ai-video-studio?model=kling-3" replace />} />
          <Route path="/seedance-video-studio" element={<Navigate to="/ai-video-studio?model=seedance-standard" replace />} />
          <Route path="/wan-video-studio" element={<Navigate to="/ai-video-studio?model=wan-2-6-standard" replace />} />
          <Route path="/hailuo-video-studio" element={<Navigate to="/ai-video-studio?model=hailuo-standard" replace />} />
          <Route path="/luma-video-studio" element={<Navigate to="/ai-video-studio?model=luma-standard" replace />} />
          <Route path="/sora-video-studio" element={<Navigate to="/ai-video-studio?model=veo-3.1-fast" replace />} />
          <Route path="/veo-video-studio" element={<Navigate to="/ai-video-studio?model=veo-3.1-fast" replace />} />
          <Route path="/ltx-video-studio" element={<Navigate to="/ai-video-studio?model=ltx-standard" replace />} />
          <Route path="/grok-video-studio" element={<Navigate to="/ai-video-studio?model=grok-imagine" replace />} />
          <Route path="/vidu-studio" element={<Navigate to="/ai-video-studio?model=vidu-q2-reference" replace />} />
          <Route path="/pika-video-studio" element={<Navigate to="/ai-video-studio?model=pika-2-2-standard" replace />} />
          <Route path="/runway-video-studio" element={<Navigate to="/ai-video-studio?model=runway-gen-4-aleph" replace />} />
          <Route path="/compare-lab" element={<ProtectedRoute><CompareLab /></ProtectedRoute>} />
          <Route path="/audio-studio" element={<AudioStudio />} />
          <Route path="/music-studio" element={<ProtectedRoute><MusicStudio /></ProtectedRoute>} />
          <Route path="/sfx-library" element={<ProtectedRoute><SfxLibrary /></ProtectedRoute>} />
          <Route path="/stock-videos" element={<ProtectedRoute><StockVideos /></ProtectedRoute>} />
          <Route path="/my-licenses" element={<ProtectedRoute><MyLicenses /></ProtectedRoute>} />
           <Route path="/sora-long-form" element={<Navigate to="/video-composer" replace />} />
           <Route path="/video-composer" element={<VideoComposer />} />
           <Route path="/queue" element={<ProtectedRoute><RenderQueue /></ProtectedRoute>} />
            <Route path="/render-queue" element={<Navigate to="/queue" replace />} />
            <Route path="/creator-library" element={<ProtectedRoute><CreatorLibrary /></ProtectedRoute>} />
           <Route path="/email-director" element={<ProtectedRoute><EmailDirector /></ProtectedRoute>} />
           <Route path="/motion-studio" element={<MotionStudioHub />} />
           <Route path="/motion-studio/studio" element={<MotionStudioStudioMode />} />
           <Route path="/motion-studio/library" element={<Navigate to="/library" replace />} />
           <Route path="/marketplace" element={<Marketplace />} />
           <Route path="/autopilot" element={<ProtectedRoute><Autopilot /></ProtectedRoute>} />
           <Route path="/creator-studio" element={<ProtectedRoute><CreatorStudio /></ProtectedRoute>} />
           <Route path="/video-translator" element={<Navigate to="/home" replace />} />
           <Route path="/community" element={<Community />} />
           <Route path="/gaming" element={<GamingHub />} />
          <Route path="/explainer-studio" element={<Navigate to="/home" replace />} />
          <Route path="/templates" element={<Navigate to="/planner?tab=campaigns&newCampaign=1" replace />} />
          <Route path="/brand-visualizer" element={<ComingSoon />} />
          <Route path="/design-assistant" element={<ComingSoon />} />
          <Route path="/ai-monitoring" element={<AIMonitoring />} />
          
          {/* Admin Routes - Protected */}
          <Route path="/admin" element={
            <ProtectedRoute requireRole="admin">
              <Admin />
            </ProtectedRoute>
          } />
          <Route path="/admin/monitoring" element={
            <ProtectedRoute requireRole="admin">
              <Monitoring />
            </ProtectedRoute>
          } />
          <Route path="/admin/feature-flags" element={
            <ProtectedRoute requireRole="admin">
              <FeatureFlags />
            </ProtectedRoute>
          } />
          <Route path="/admin/analytics" element={
            <ProtectedRoute requireRole="admin">
              <AdminAnalytics />
            </ProtectedRoute>
          } />
          <Route path="/admin/lambda-health" element={
            <ProtectedRoute requireRole="admin">
              <LambdaHealth />
            </ProtectedRoute>
          } />
          <Route path="/admin/qa-cockpit" element={
            <ProtectedRoute requireRole="admin">
              <QACockpit />
            </ProtectedRoute>
          } />
          
          <Route path="/analytics" element={<UnifiedAnalytics />} />
          <Route path="/analytics/posthog" element={<PostHogDashboard />} />
           <Route path="/analytics/usage-reports" element={<UsageReports />} />
           <Route path="/analytics/platform/:platform" element={<PlatformAnalytics />} />
          <Route path="/integrations" element={<Integrations />} />
          <Route path="/debug/posthog" element={<PostHogEventTester />} />
          <Route path="/debug/feature-flags" element={<FeatureFlagDemo />} />
          <Route path="/unauthorized" element={<Unauthorized />} />
                    
                    {/* 404 catch-all - redirect to home */}
                    <Route path="*" element={<Navigate to="/home" replace />} />
              </Routes>
            </Suspense>
            </AccountPausedGate>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

const AppContent = () => {
  const translationState = useTranslationState();
  useConsoleErrorBuffer();

  return (
    <TranslationContext.Provider value={translationState}>
      <AuthProvider>
        <TooltipProvider>
          <SidebarProvider>
            <UpgradeTriggerProvider>
              <PinnedChatProvider>
                <Toaster />
                <Sonner />
                <CookieConsent />
                <CommandBar />
                <CommandPalette />
                <AICompanionWidget />
                <ConciergeTipHost />
                <ConciergeIntroScreen />
                <UpgradeMount />
                <EmailVerificationGate>
                  <AppLayout />
                  <GettingStartedChecklist />
                  <ProductTour />
                </EmailVerificationGate>
                <PinnedChatWindow />
              </PinnedChatProvider>
            </UpgradeTriggerProvider>
          </SidebarProvider>
        </TooltipProvider>
      </AuthProvider>
    </TranslationContext.Provider>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true
      }}
    >
      <AppContent />
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;