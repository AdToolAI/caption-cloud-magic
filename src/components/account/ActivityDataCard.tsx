import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Trash2, Loader2, AlertTriangle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const ActivityDataCard = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleDeleteActivityData = async () => {
    if (!user) return;

    setDeleting(true);
    try {
      const { error: sessionsError } = await supabase
        .from("user_sessions")
        .delete()
        .eq("user_id", user.id)
        .eq("is_current", false);

      if (sessionsError) throw sessionsError;

      const { error: eventsError } = await supabase
        .from("app_events")
        .delete()
        .eq("user_id", user.id);

      if (eventsError) throw eventsError;

      toast.success(t("accountActivity.successMsg"));
    } catch (error: any) {
      toast.error(error.message || t("accountActivity.errorMsg"));
    } finally {
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  return (
    <>
      <Card className="bg-card/60 backdrop-blur-xl border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-primary" />
            {t("accountActivity.title")}
          </CardTitle>
          <CardDescription>
            {t("accountActivity.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-500">
                <p className="font-medium">{t("accountActivity.warning")}</p>
                <p className="text-amber-500/80">
                  {t("accountActivity.warningText")}
                </p>
              </div>
            </div>
          </div>

          <Button
            variant="destructive"
            onClick={() => setShowDeleteDialog(true)}
            disabled={deleting}
            className="w-full"
          >
            {deleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("accountActivity.deleting")}
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                {t("accountActivity.deleteButton")}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("accountActivity.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("accountActivity.confirmDesc")}
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>{t("accountActivity.confirmItem1")}</li>
                <li>{t("accountActivity.confirmItem2")}</li>
                <li>{t("accountActivity.confirmItem3")}</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("accountActivity.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteActivityData}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("accountActivity.confirmDelete")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
