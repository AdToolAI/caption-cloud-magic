import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, Smartphone, Loader2, CheckCircle, XCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { TwoFactorSetup } from "./TwoFactorSetup";
import { ActiveSessionsList } from "./ActiveSessionsList";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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

export const SecurityTab = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [showTwoFactorSetup, setShowTwoFactorSetup] = useState(false);
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [disabling, setDisabling] = useState(false);

  const checkTwoFactorStatus = async () => {
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      
      const hasVerifiedFactor = data.totp.some(f => f.status === 'verified');
      setTwoFactorEnabled(hasVerifiedFactor);
    } catch (err) {
      console.error('Error checking 2FA status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkTwoFactorStatus();
  }, []);

  const handleDisable2FA = async () => {
    setDisabling(true);
    try {
      const { data, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;

      const verifiedFactor = data.totp.find(f => f.status === 'verified');
      if (verifiedFactor) {
        const { error } = await supabase.auth.mfa.unenroll({ factorId: verifiedFactor.id });
        if (error) throw error;
      }

      setTwoFactorEnabled(false);
      setShowDisableDialog(false);
      toast({
        title: "2FA deaktiviert",
        description: "Zwei-Faktor-Authentifizierung wurde deaktiviert"
      });
    } catch (err: any) {
      console.error('Error disabling 2FA:', err);
      toast({
        title: "Fehler",
        description: err.message || "2FA konnte nicht deaktiviert werden",
        variant: "destructive"
      });
    } finally {
      setDisabling(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Two-Factor Authentication */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            {t('settings.twoFactorAuth')}
          </CardTitle>
          <CardDescription>
            Schütze dein Konto mit einem zusätzlichen Sicherheitscode
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Status wird geladen...
            </div>
          ) : twoFactorEnabled ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-500">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">2FA ist aktiviert</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Dein Konto ist durch Zwei-Faktor-Authentifizierung geschützt. 
                Bei jeder Anmeldung benötigst du einen Code aus deiner Authenticator-App.
              </p>
              <Button 
                variant="outline" 
                onClick={() => setShowDisableDialog(true)}
                className="text-destructive border-destructive/30 hover:bg-destructive/10"
              >
                <XCircle className="h-4 w-4 mr-2" />
                2FA deaktivieren
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Aktiviere die Zwei-Faktor-Authentifizierung für zusätzlichen Schutz. 
                Du benötigst eine Authenticator-App wie Google Authenticator oder Authy.
              </p>
              <Button onClick={() => setShowTwoFactorSetup(true)}>
                <Shield className="h-4 w-4 mr-2" />
                2FA aktivieren
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            {t('settings.activeSessions')}
          </CardTitle>
          <CardDescription>
            Verwalte alle Geräte, auf denen du angemeldet bist
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActiveSessionsList />
        </CardContent>
      </Card>

      {/* Two-Factor Setup Dialog */}
      <TwoFactorSetup
        open={showTwoFactorSetup}
        onOpenChange={setShowTwoFactorSetup}
        onSuccess={() => {
          setTwoFactorEnabled(true);
          setShowTwoFactorSetup(false);
        }}
      />

      {/* Disable 2FA Confirmation Dialog */}
      <AlertDialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>2FA deaktivieren?</AlertDialogTitle>
            <AlertDialogDescription>
              Wenn du die Zwei-Faktor-Authentifizierung deaktivierst, wird dein Konto 
              weniger sicher sein. Du kannst sie jederzeit wieder aktivieren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDisable2FA}
              disabled={disabling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {disabling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Deaktivieren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
