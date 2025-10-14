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

  // Show fallback if no workspace is selected
  if (!workspaceId) {
    const fallbackContent = (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <Settings className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">
          {t("calendar.integrations.noWorkspace")}
        </h3>
        <p className="text-sm text-muted-foreground">
          Bitte wähle zuerst einen Workspace aus, um Integrationen zu verwalten.
        </p>
      </div>
    );

    if (isMobile) {
      return (
        <Sheet open={open} onOpenChange={onClose}>
          <SheetContent side="bottom" className="h-[85vh]">
            <SheetHeader>
              <SheetTitle>{t("calendar.integrations.title")}</SheetTitle>
            </SheetHeader>
            {fallbackContent}
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
          {fallbackContent}
        </DialogContent>
      </Dialog>
    );
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
