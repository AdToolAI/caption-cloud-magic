import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface DiagnosticResult {
  category: string;
  status: 'ok' | 'warning' | 'error';
  message: string;
  action?: string;
  actionLabel?: string;
}

interface ProactiveTip {
  message: string;
  type: 'info' | 'warning' | 'error';
  action?: string;
  actionLabel?: string;
}

// Page-specific tips
const PAGE_TIPS: Record<string, ProactiveTip> = {
  '/directors-cut': {
    message: '💡 Tipp: Starte mit der KI-Analyse in Schritt 2 für automatische Szenen-Erkennung!',
    type: 'info'
  },
  '/calendar': {
    message: '💡 Tipp: Aktiviere Auto-Publish für geplante Posts um sie automatisch zu veröffentlichen!',
    type: 'info'
  },
  '/generator': {
    message: '💡 Tipp: Probiere verschiedene Töne (Humorvoll, Inspirierend) für bessere Ergebnisse!',
    type: 'info'
  },
  '/campaign-wizard': {
    message: '💡 Tipp: Klicke ein Medium an und dann den Post, um es zuzuweisen - kein Drag & Drop nötig!',
    type: 'info'
  },
  '/media-library': {
    message: '💡 Tipp: Videos werden automatisch bereinigt wenn du das 100-Video-Limit erreichst.',
    type: 'info'
  },
};

export function useProactiveTips() {
  const { user } = useAuth();
  const location = useLocation();
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult[]>([]);
  const [currentTip, setCurrentTip] = useState<ProactiveTip | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch diagnostics from edge function
  const fetchDiagnostics = useCallback(async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return;

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/companion-diagnose`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData.session.access_token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setDiagnostics(data.diagnostics || []);
      }
    } catch (error) {
      console.error('Failed to fetch diagnostics:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Fetch diagnostics on mount and periodically
  useEffect(() => {
    fetchDiagnostics();
    
    // Refresh every 5 minutes
    const interval = setInterval(fetchDiagnostics, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchDiagnostics]);

  // Update current tip based on page and diagnostics
  useEffect(() => {
    // Priority 1: Critical errors from diagnostics
    const criticalIssue = diagnostics.find(d => d.status === 'error');
    if (criticalIssue) {
      setCurrentTip({
        message: `🚨 ${criticalIssue.message}`,
        type: 'error',
        action: criticalIssue.action,
        actionLabel: criticalIssue.actionLabel
      });
      return;
    }

    // Priority 2: Warnings from diagnostics
    const warningIssue = diagnostics.find(d => d.status === 'warning');
    if (warningIssue) {
      setCurrentTip({
        message: `⚠️ ${warningIssue.message}`,
        type: 'warning',
        action: warningIssue.action,
        actionLabel: warningIssue.actionLabel
      });
      return;
    }

    // Priority 3: Page-specific tips
    const pagePath = Object.keys(PAGE_TIPS).find(path => 
      location.pathname.startsWith(path)
    );
    
    if (pagePath) {
      setCurrentTip(PAGE_TIPS[pagePath]);
    } else {
      setCurrentTip(null);
    }
  }, [location.pathname, diagnostics]);

  return {
    currentTip,
    diagnostics,
    isLoading,
    refetchDiagnostics: fetchDiagnostics,
    hasIssues: diagnostics.some(d => d.status === 'error' || d.status === 'warning'),
    errorCount: diagnostics.filter(d => d.status === 'error').length,
    warningCount: diagnostics.filter(d => d.status === 'warning').length,
  };
}
