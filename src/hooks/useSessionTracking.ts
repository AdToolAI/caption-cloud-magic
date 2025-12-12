import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const getBrowserInfo = () => {
  const ua = navigator.userAgent;
  let browser = "Unbekannt";
  let os = "Unbekannt";

  // Detect browser
  if (ua.includes("Firefox")) {
    browser = "Firefox";
  } else if (ua.includes("Edg")) {
    browser = "Edge";
  } else if (ua.includes("Chrome")) {
    browser = "Chrome";
  } else if (ua.includes("Safari")) {
    browser = "Safari";
  } else if (ua.includes("Opera") || ua.includes("OPR")) {
    browser = "Opera";
  }

  // Detect OS
  if (ua.includes("Windows")) {
    os = "Windows";
  } else if (ua.includes("Mac OS")) {
    os = "macOS";
  } else if (ua.includes("Linux")) {
    os = "Linux";
  } else if (ua.includes("Android")) {
    os = "Android";
  } else if (ua.includes("iPhone") || ua.includes("iPad")) {
    os = "iOS";
  }

  return { browser, os, deviceInfo: ua };
};

export const useSessionTracking = (userId: string | undefined) => {
  const sessionIdRef = useRef<string | null>(null);
  const hasTrackedRef = useRef(false);

  useEffect(() => {
    if (!userId || hasTrackedRef.current) return;

    const trackSession = async () => {
      const { browser, os, deviceInfo } = getBrowserInfo();

      try {
        // Check if there's already a current session for this user in this browser session
        const existingSessionId = sessionStorage.getItem('current_session_id');
        
        if (existingSessionId) {
          // Update last_active for existing session
          await supabase
            .from('user_sessions')
            .update({ last_active: new Date().toISOString() })
            .eq('id', existingSessionId);
          
          sessionIdRef.current = existingSessionId;
          hasTrackedRef.current = true;
          return;
        }

        // Mark all previous sessions as not current
        await supabase
          .from('user_sessions')
          .update({ is_current: false })
          .eq('user_id', userId);

        // Create new session
        const { data, error } = await supabase
          .from('user_sessions')
          .insert({
            user_id: userId,
            browser,
            os,
            device_info: deviceInfo,
            is_current: true,
            location: null // Could be populated via IP geolocation API
          })
          .select('id')
          .single();

        if (error) {
          console.error('Error creating session:', error);
          return;
        }

        if (data) {
          sessionIdRef.current = data.id;
          sessionStorage.setItem('current_session_id', data.id);
          hasTrackedRef.current = true;
        }
      } catch (err) {
        console.error('Session tracking error:', err);
      }
    };

    trackSession();

    // Update last_active periodically (every 5 minutes)
    const interval = setInterval(async () => {
      if (sessionIdRef.current) {
        await supabase
          .from('user_sessions')
          .update({ last_active: new Date().toISOString() })
          .eq('id', sessionIdRef.current);
      }
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(interval);
    };
  }, [userId]);

  return sessionIdRef.current;
};
