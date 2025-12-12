import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Trash2, Loader2, AlertTriangle } from "lucide-react";
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
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleDeleteActivityData = async () => {
    if (!user) return;

    setDeleting(true);
    try {
      // Delete user sessions (except current)
      const { error: sessionsError } = await supabase
        .from("user_sessions")
        .delete()
        .eq("user_id", user.id)
        .eq("is_current", false);

      if (sessionsError) throw sessionsError;

      // Delete app events
      const { error: eventsError } = await supabase
        .from("app_events")
        .delete()
        .eq("user_id", user.id);

      if (eventsError) throw eventsError;

      toast.success("Aktivitätsdaten gelöscht");
    } catch (error: any) {
      toast.error(error.message || "Fehler beim Löschen");
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
            Aktivitätsdaten
          </CardTitle>
          <CardDescription>
            Lösche deine gespeicherten Aktivitätsdaten
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-500">
                <p className="font-medium">Hinweis</p>
                <p className="text-amber-500/80">
                  Das Löschen entfernt deinen Login-Verlauf und App-Events.
                  Diese Aktion kann nicht rückgängig gemacht werden.
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
                Wird gelöscht...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                Aktivitätsdaten löschen
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aktivitätsdaten löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Aktion löscht unwiderruflich:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Deinen Login-Verlauf</li>
                <li>App-Events und Nutzungsdaten</li>
                <li>Andere Sitzungen (außer der aktuellen)</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteActivityData}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Endgültig löschen"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
