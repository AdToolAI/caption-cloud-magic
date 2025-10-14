import { useState } from "react";
import { Settings } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { IntegrationSettings } from "./IntegrationSettings";
import { useTranslation } from "@/hooks/useTranslation";
import { useIsMobile } from "@/hooks/use-mobile";

interface IntegrationSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  workspaceId?: string;
}

export function IntegrationSettingsDialog({ open, onClose, workspaceId }: IntegrationSettingsDialogProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  if (!workspaceId) {
    return null;
  }

  const content = (
    <div className="max-h-[70vh] overflow-y-auto">
      <IntegrationSettings workspaceId={workspaceId} />
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent side="bottom" className="h-[85vh]">
          <SheetHeader>
            <SheetTitle>{t("calendar.integrations.title")}</SheetTitle>
          </SheetHeader>
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("calendar.integrations.title")}</DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
