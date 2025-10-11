import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { TranslationContext, useTranslationState } from "@/hooks/useTranslation";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Generator from "./pages/Generator";
import PromptWizard from "./pages/PromptWizard";
import PostTimeAdvisor from "./pages/PostTimeAdvisor";
import HookGenerator from "./pages/HookGenerator";
import Rewriter from "./pages/Rewriter";
import GoalsDashboard from "./pages/GoalsDashboard";
import PerformanceTracker from "./pages/PerformanceTracker";
import Auth from "./pages/Auth";
import Account from "./pages/Account";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const AppContent = () => {
  const translationState = useTranslationState();

  return (
    <TranslationContext.Provider value={translationState}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/generator" element={<Generator />} />
            <Route path="/prompt-wizard" element={<PromptWizard />} />
            <Route path="/post-time-advisor" element={<PostTimeAdvisor />} />
            <Route path="/hook-generator" element={<HookGenerator />} />
            <Route path="/rewriter" element={<Rewriter />} />
            <Route path="/goals" element={<GoalsDashboard />} />
            <Route path="/performance" element={<PerformanceTracker />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/account" element={<Account />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
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
