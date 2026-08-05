import { useState } from "react";
import { Download, Send, CalendarClock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { useQuickPublish } from "@/hooks/useQuickPublish";
import type { PublishHandoff } from "@/lib/publishHandoff";

interface ExportActionBarProps {
  /** Fertiges Medium samt Textvorschlägen. Optional, wenn `resolveHandoff` gesetzt ist. */
  handoff?: PublishHandoff;
  /**
   * Für Oberflächen, die das Medium erst beim Klick erzeugen/hochladen müssen
   * (z. B. Post Designer rendert das PNG erst on demand).
   */
  resolveHandoff?: () => Promise<PublishHandoff | null>;
  /** Download bleibt bei der jeweiligen Seite — Formate/Dateinamen sind dort bekannt. */
  onDownload?: () => void;
  downloading?: boolean;
  /** Audio kann nicht direkt gepostet werden — dann nur Einplanen anbieten. */
  allowPublish?: boolean;
  size?: "sm" | "default";
  className?: string;
}

/**
 * Einheitliche Abschlussleiste für alle Export-Oberflächen:
 * Herunterladen · Jetzt veröffentlichen · Einplanen.
 */
export function ExportActionBar({
  handoff,
  resolveHandoff,
  onDownload,
  downloading,
  allowPublish = true,
  size = "default",
  className,
}: ExportActionBarProps) {
  const { t } = useTranslation();
  const { publishNow, schedule } = useQuickPublish();
  const [preparing, setPreparing] = useState(false);

  const run = async (action: (h: PublishHandoff) => void) => {
    if (preparing) return;
    if (!resolveHandoff) {
      if (handoff) action(handoff);
      return;
    }
    setPreparing(true);
    try {
      const resolved = await resolveHandoff();
      if (resolved) action(resolved);
    } finally {
      setPreparing(false);
    }
  };

  const canPublish = allowPublish && (handoff?.mediaType ?? "image") !== "audio";

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {onDownload && (
        <Button variant="outline" size={size} onClick={onDownload} disabled={downloading}>
          {downloading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          {t("publishBar.download")}
        </Button>
      )}

      {canPublish && (
        <Button
          size={size}
          onClick={() => run(publishNow)}
          disabled={preparing}
          className="shadow-glow-gold"
        >
          {preparing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          {t("publishBar.publishNow")}
        </Button>
      )}

      <Button variant="secondary" size={size} onClick={() => run(schedule)} disabled={preparing}>
        <CalendarClock className="mr-2 h-4 w-4" />
        {t("publishBar.schedule")}
      </Button>
    </div>
  );
}

export default ExportActionBar;
