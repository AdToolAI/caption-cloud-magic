import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { usePlatformCredentials } from "@/hooks/usePlatformCredentials";
import {
  writeComposerHandoff,
  writeCalendarHandoff,
  type PublishHandoff,
} from "@/lib/publishHandoff";

/**
 * Übergibt ein fertig exportiertes Medium an das Content Command Center.
 * Ohne verbundenen Kanal führt der Weg zuerst zur Kanalverbindung —
 * nie in eine Fehlermeldung am Ende des Flows.
 */
export function useQuickPublish() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { credentials, loading } = usePlatformCredentials();

  const hasChannel = credentials.some((c) => c.is_connected);

  const requireChannel = useCallback(() => {
    if (loading || hasChannel) return true;
    toast({
      title: t("publishBar.noChannelTitle"),
      description: t("publishBar.noChannelDesc"),
    });
    navigate("/integrations");
    return false;
  }, [hasChannel, loading, navigate, t, toast]);

  const publishNow = useCallback(
    (handoff: PublishHandoff) => {
      if (!requireChannel()) return;
      writeComposerHandoff(handoff);
      navigate("/command-center?compose=1");
    },
    [navigate, requireChannel],
  );

  const schedule = useCallback(
    (handoff: PublishHandoff) => {
      if (!requireChannel()) return;
      writeCalendarHandoff(handoff);
      navigate("/command-center?view=calendar&prefill=true");
    },
    [navigate, requireChannel],
  );

  return { publishNow, schedule, hasChannel, loading };
}
