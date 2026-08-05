import { Download, Send, CalendarClock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { useQuickPublish } from "@/hooks/useQuickPublish";
import type { PublishHandoff } from "@/lib/publishHandoff";

interface ExportActionBarProps {
  /** Fertiges Medium samt Textvorschlägen. */
  handoff: PublishHandoff;
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
  onDownload,
  downloading,
  allowPublish = true,
  size = "default",
  className,
}: ExportActionBarProps) {
  const { t } = useTranslation();
  const { publishNow, schedule } = useQuickPublish();

  const canPublish = allowPublish && handoff.mediaType !== "audio";

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
        <Button size={size} onClick={() => publishNow(handoff)} className="shadow-glow-gold">
          <Send className="mr-2 h-4 w-4" />
          {t("publishBar.publishNow")}
        </Button>
      )}

      <Button variant="secondary" size={size} onClick={() => schedule(handoff)}>
        <CalendarClock className="mr-2 h-4 w-4" />
        {t("publishBar.schedule")}
      </Button>
    </div>
  );
}

export default ExportActionBar;
