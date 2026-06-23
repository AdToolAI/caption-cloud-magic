import { useEffect, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const LS_AUTOSTART_DONE = "adtool-tour-autostart-done";
const LS_TOUR_COMPLETED = "adtool-tour-completed-v1";

const readLocalCompleted = (): boolean => {
  try {
    return localStorage.getItem(LS_TOUR_COMPLETED) === "1";
  } catch {
    return false;
  }
};

const writeLocalCompleted = () => {
  try {
    localStorage.setItem(LS_TOUR_COMPLETED, "1");
    sessionStorage.setItem(LS_AUTOSTART_DONE, "1");
  } catch {
    /* ignore */
  }
};

export const useProductTour = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [run, setRun] = useState(false);
  const [tourCompletedAt, setTourCompletedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [locallyCompleted, setLocallyCompleted] = useState<boolean>(() => readLocalCompleted());

  // Load tour state from DB
  useEffect(() => {
    if (!user) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("tour_completed_at" as any)
        .eq("id", user.id)
        .maybeSingle();
      if (!cancelled) {
        const serverCompleted = (data as any)?.tour_completed_at ?? null;
        setTourCompletedAt(serverCompleted);
        // Mirror server state to localStorage so future loads are instant & robust
        if (serverCompleted) {
          writeLocalCompleted();
          setLocallyCompleted(true);
        }
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Auto-start on /home for new users that haven't completed the tour yet
  useEffect(() => {
    if (!loaded || !user) return;
    if (tourCompletedAt) return;
    if (locallyCompleted) return;
    if (location.pathname !== "/home") return;
    if (sessionStorage.getItem(LS_AUTOSTART_DONE) === "1") return;

    // Tiny delay to let DOM settle (lazy routes / animations)
    const t = setTimeout(() => {
      setRun(true);
      try {
        sessionStorage.setItem(LS_AUTOSTART_DONE, "1");
      } catch {
        /* ignore */
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [loaded, user, tourCompletedAt, locallyCompleted, location.pathname]);

  const markCompleted = useCallback(async () => {
    setRun(false);
    // Persist locally FIRST so UI is stable even if backend write is slow/fails
    writeLocalCompleted();
    setLocallyCompleted(true);
    if (!user) return;
    const now = new Date().toISOString();
    setTourCompletedAt(now);
    try {
      await supabase
        .from("profiles")
        .update({ tour_completed_at: now } as any)
        .eq("id", user.id);
    } catch {
      /* local marker already prevents re-show */
    }
  }, [user]);

  const startTour = useCallback(() => {
    setRun(true);
  }, []);

  const skipTour = useCallback(() => {
    markCompleted();
  }, [markCompleted]);

  return {
    run,
    setRun,
    tourCompletedAt,
    markCompleted,
    skipTour,
    startTour,
    isCompleted: !!tourCompletedAt || locallyCompleted,
  };
};
