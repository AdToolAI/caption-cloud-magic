import { useEffect, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const LS_AUTOSTART_DONE = "adtool-tour-autostart-done";

export const useProductTour = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [run, setRun] = useState(false);
  const [tourCompletedAt, setTourCompletedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

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
        setTourCompletedAt((data as any)?.tour_completed_at ?? null);
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
    if (location.pathname !== "/home") return;
    if (sessionStorage.getItem(LS_AUTOSTART_DONE) === "1") return;

    // Tiny delay to let DOM settle (lazy routes / animations)
    const t = setTimeout(() => {
      setRun(true);
      sessionStorage.setItem(LS_AUTOSTART_DONE, "1");
    }, 1200);
    return () => clearTimeout(t);
  }, [loaded, user, tourCompletedAt, location.pathname]);

  const markCompleted = useCallback(async () => {
    setRun(false);
    if (!user) return;
    const now = new Date().toISOString();
    setTourCompletedAt(now);
    await supabase
      .from("profiles")
      .update({ tour_completed_at: now } as any)
      .eq("id", user.id);
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
    isCompleted: !!tourCompletedAt,
  };
};
