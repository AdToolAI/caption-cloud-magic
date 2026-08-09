import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { ensureValidSession } from '@/lib/ensureSession';
import { useAuth } from '@/hooks/useAuth';
import { tx } from "@/lib/i18nText";

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
    message: tx({ de: '💡 Tipp: Starte mit der KI-Analyse in Schritt 2 für automatische Szenen-Erkennung!', en: '💡 Tip: Start with the AI analysis in step 2 for automatic scene detection!', es: '💡 Consejo: Empieza con el análisis de IA en el paso 2 para la detección automática de escenas.' }),
    type: 'info'
  },
  '/calendar': {
    message: tx({ de: '💡 Tipp: Aktiviere Auto-Publish für geplante Posts um sie automatisch zu veröffentlichen!', en: '💡 Tip: Enable auto-publish for scheduled posts to publish them automatically!', es: '💡 Consejo: Activa la publicación automática para las publicaciones programadas.' }),
    type: 'info'
  },
  '/ai-text-studio': {
    message: tx({ de: '💡 Tipp: Probiere verschiedene Töne (Humorvoll, Inspirierend) für bessere Ergebnisse!', en: '💡 Tip: Try different tones (humorous, inspiring) for better results!', es: '💡 Consejo: Prueba diferentes tonos (humorístico, inspirador) para mejores resultados.' }),
    type: 'info'
  },
  '/campaign-wizard': {
    message: tx({ de: '💡 Tipp: Klicke ein Medium an und dann den Post, um es zuzuweisen - kein Drag & Drop nötig!', en: '💡 Tip: Click a media item and then the post to assign it - no drag & drop needed!', es: '💡 Consejo: Haz clic en un archivo multimedia y luego en la publicación para asignarlo, sin necesidad de arrastrar y soltar.' }),
    type: 'info'
  },
  '/media-library': {
    message: tx({ de: '💡 Tipp: Videos werden automatisch bereinigt wenn du das 100-Video-Limit erreichst.', en: '💡 Tip: Videos are automatically cleaned up once you reach the 100-video limit.', es: '💡 Consejo: Los videos se limpian automáticamente al alcanzar el límite de 100 videos.' }),
    type: 'info'
  },
};

export function useProactiveTips() {
  const [diagnostics, setDiagnostics] = useState<DiagnosticResult[]>([]);
  const [currentTip, setCurrentTip] = useState<ProactiveTip | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const location = useLocation();

  const fetchDiagnostics = useCallback(async () => {
    try {
      setIsLoading(true);
      const session = await ensureValidSession();
      if (!session) {
        setDiagnostics([]);
        return;
      }

      const { data, error } = await supabase.functions.invoke('companion-diagnose', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      });


      if (error) {
        console.warn('Diagnostics fetch failed:', error.message);
        setDiagnostics([]);
        return;
      }

      setDiagnostics(data?.diagnostics || []);
    } catch (err) {
      // Silently fail - diagnostics are not critical
      console.warn('Diagnostics error:', err);
      setDiagnostics([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDiagnostics();
    const interval = setInterval(fetchDiagnostics, 5 * 60 * 1000); // Every 5 minutes
    return () => clearInterval(interval);
  }, [fetchDiagnostics]);

  useEffect(() => {
    // Priority: critical errors > warnings > page tips
    const errors = diagnostics.filter(d => d.status === 'error');
    const warnings = diagnostics.filter(d => d.status === 'warning');

    if (errors.length > 0) {
      setCurrentTip({
        message: errors[0].message,
        type: 'error',
        action: errors[0].action
      });
    } else if (warnings.length > 0) {
      setCurrentTip({
        message: warnings[0].message,
        type: 'warning',
        action: warnings[0].action
      });
    } else {
      // Check for page-specific tips
      const pageTip = PAGE_TIPS[location.pathname];
      setCurrentTip(pageTip || null);
    }
  }, [diagnostics, location.pathname]);

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
