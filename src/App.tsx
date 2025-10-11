import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { TranslationContext, useTranslationState } from "@/hooks/useTranslation";
import { AuthProvider } from "@/hooks/useAuth";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Header } from "@/components/Header";
import Home from "./pages/Home";
import Generator from "./pages/Generator";
import PromptWizard from "./pages/PromptWizard";
import PostTimeAdvisor from "./pages/PostTimeAdvisor";
import HookGenerator from "./pages/HookGenerator";
import Rewriter from "./pages/Rewriter";
import GoalsDashboard from "./pages/GoalsDashboard";
import PerformanceTracker from "./pages/PerformanceTracker";
import Auth from "./pages/Auth";
import Account from "./pages/Account";
import ComingSoon from "./pages/ComingSoon";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const AppContent = () => {
  const translationState = useTranslationState();

  return (
    <TranslationContext.Provider value={translationState}>
      <AuthProvider>
        <TooltipProvider>
          <SidebarProvider>
            <div className="flex min-h-screen w-full">
              <AppSidebar />
              <div className="flex-1 flex flex-col w-full">
                <Header />
                <main className="flex-1">
                  <Toaster />
                  <Sonner />
                  <Routes>
                    {/* Redirect root to home */}
                    <Route path="/" element={<Navigate to="/home" replace />} />
                    
                    {/* Main pages */}
                    <Route path="/home" element={<Home />} />
                    <Route path="/auth" element={<Auth />} />
                    <Route path="/account" element={<Account />} />
                    
                    {/* Feature pages - enabled */}
                    <Route path="/generator" element={<Generator />} />
                    <Route path="/prompt-wizard" element={<PromptWizard />} />
                    <Route path="/hook-generator" element={<HookGenerator />} />
                    <Route path="/rewriter" element={<Rewriter />} />
                    <Route path="/post-time-advisor" element={<PostTimeAdvisor />} />
                    <Route path="/performance" element={<PerformanceTracker />} />
                    <Route path="/goals" element={<GoalsDashboard />} />
                    
                    {/* Placeholder features - disabled */}
                    <Route path="/image-generator" element={<ComingSoon />} />
                    <Route path="/carousel-builder" element={<ComingSoon />} />
                    <Route path="/hashtag-manager" element={<ComingSoon />} />
                    <Route path="/bio-optimizer" element={<ComingSoon />} />
                    <Route path="/campaign-reports" element={<ComingSoon />} />
                    
                    {/* 404 catch-all - redirect to home */}
                    <Route path="*" element={<Navigate to="/home" replace />} />
                  </Routes>
                </main>
              </div>
            </div>
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