import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

// VAPID public key - loaded from env or hardcoded after generation
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

type PushStatus = "unsupported" | "default" | "granted" | "denied" | "loading";

export function usePushNotifications() {
  const { user } = useAuth();
  const [status, setStatus] = useState<PushStatus>("loading");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    setStatus(Notification.permission as PushStatus);

    // Load current state from DB
    if (user) {
      supabase
        .from("notification_preferences")
        .select("push_enabled")
        .eq("user_id", user.id)
        .single()
        .then(({ data }) => {
          if (data) setPushEnabled(data.push_enabled ?? false);
        });
    }
  }, [user]);

  const subscribe = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const permission = await Notification.requestPermission();
      setStatus(permission as PushStatus);

      if (permission !== "granted") {
        toast.error("Push-Benachrichtigungen wurden blockiert. Bitte erlaube sie in den Browser-Einstellungen.");
        setLoading(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;

      // Fetch VAPID public key from edge function
      const { data: vapidData } = await supabase.functions.invoke("send-push-notification", {
        body: { action: "get_vapid_key" },
      });

      const vapidKey = vapidData?.vapid_public_key || VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        toast.error("Push-Konfiguration nicht verfügbar");
        setLoading(false);
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
      });

      const subJson = subscription.toJSON() as Record<string, unknown>;

      // Save subscription to DB
      const { error } = await supabase
        .from("notification_preferences")
        .upsert({
          user_id: user.id,
          push_enabled: true,
          push_subscription: subJson,
          updated_at: new Date().toISOString(),
        } as any);

      if (error) throw error;

      setPushEnabled(true);
      toast.success("Push-Benachrichtigungen aktiviert! 🔔");
    } catch (err: any) {
      console.error("Push subscription error:", err);
      toast.error("Fehler beim Aktivieren der Push-Benachrichtigungen");
    } finally {
      setLoading(false);
    }
  }, [user]);

  const unsubscribe = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
      }

      const { error } = await supabase
        .from("notification_preferences")
        .upsert({
          user_id: user.id,
          push_enabled: false,
          push_subscription: null,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      setPushEnabled(false);
      toast.success("Push-Benachrichtigungen deaktiviert");
    } catch (err: any) {
      console.error("Push unsubscribe error:", err);
      toast.error("Fehler beim Deaktivieren");
    } finally {
      setLoading(false);
    }
  }, [user]);

  const togglePush = useCallback(async () => {
    if (pushEnabled) {
      await unsubscribe();
    } else {
      await subscribe();
    }
  }, [pushEnabled, subscribe, unsubscribe]);

  return {
    status,
    pushEnabled,
    loading,
    togglePush,
    subscribe,
    unsubscribe,
    isSupported: status !== "unsupported",
    isDenied: status === "denied",
  };
}
