import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Loader2, CheckCircle, Copy, AlertTriangle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface TwoFactorSetupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const TwoFactorSetup = ({ open, onOpenChange, onSuccess }: TwoFactorSetupProps) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [step, setStep] = useState<'intro' | 'qr' | 'verify' | 'success'>('intro');
  const [loading, setLoading] = useState(false);
  const [qrCode, setQrCode] = useState<string>("");
  const [secret, setSecret] = useState<string>("");
  const [factorId, setFactorId] = useState<string>("");
  const [verifyCode, setVerifyCode] = useState("");
  const [error, setError] = useState("");

  const resetState = () => {
    setStep('intro');
    setQrCode("");
    setSecret("");
    setFactorId("");
    setVerifyCode("");
    setError("");
  };

  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open]);

  const handleEnroll = async () => {
    setLoading(true);
    setError("");
    
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'AdTool Authenticator'
      });

      if (error) throw error;

      if (data) {
        setQrCode(data.totp.qr_code);
        setSecret(data.totp.secret);
        setFactorId(data.id);
        setStep('qr');
      }
    } catch (err: any) {
      console.error('MFA enroll error:', err);
      setError(err.message || 'Fehler beim Einrichten der 2FA');
      toast({
        title: "Fehler",
        description: err.message || 'Fehler beim Einrichten der 2FA',
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (verifyCode.length !== 6) {
      setError("Bitte gib einen 6-stelligen Code ein");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId
      });

      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: verifyCode
      });

      if (verifyError) throw verifyError;

      setStep('success');
      toast({
        title: "2FA aktiviert",
        description: "Zwei-Faktor-Authentifizierung wurde erfolgreich eingerichtet"
      });
      
      setTimeout(() => {
        onSuccess();
        onOpenChange(false);
      }, 2000);
    } catch (err: any) {
      console.error('MFA verify error:', err);
      setError(err.message || 'Ungültiger Code');
    } finally {
      setLoading(false);
    }
  };

  const copySecret = () => {
    navigator.clipboard.writeText(secret);
    toast({
      title: "Kopiert",
      description: "Geheimer Schlüssel wurde kopiert"
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Zwei-Faktor-Authentifizierung
          </DialogTitle>
          <DialogDescription>
            Schütze dein Konto mit einem zusätzlichen Sicherheitsfaktor
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {step === 'intro' && (
            <div className="space-y-4">
              <div className="p-4 bg-muted/30 rounded-lg space-y-2">
                <h4 className="font-medium">So funktioniert es:</h4>
                <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1">
                  <li>Lade eine Authenticator-App herunter (Google Authenticator, Authy, etc.)</li>
                  <li>Scanne den QR-Code mit der App</li>
                  <li>Gib den generierten Code ein, um die Einrichtung abzuschließen</li>
                </ol>
              </div>
              <Button onClick={handleEnroll} disabled={loading} className="w-full">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Einrichtung starten
              </Button>
            </div>
          )}

          {step === 'qr' && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="p-4 bg-white rounded-lg">
                  <img src={qrCode} alt="QR Code" className="w-48 h-48" />
                </div>
              </div>
              
              <div className="p-3 bg-muted/30 rounded-lg">
                <Label className="text-xs text-muted-foreground">Manueller Schlüssel:</Label>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 text-xs font-mono bg-background px-2 py-1 rounded break-all">
                    {secret}
                  </code>
                  <Button variant="ghost" size="icon" onClick={copySecret}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <Button onClick={() => setStep('verify')} className="w-full">
                Weiter zur Verifizierung
              </Button>
            </div>
          )}

          {step === 'verify' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Verifizierungscode</Label>
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                  className="text-center text-2xl tracking-widest"
                />
                <p className="text-xs text-muted-foreground">
                  Gib den 6-stelligen Code aus deiner Authenticator-App ein
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  {error}
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep('qr')} className="flex-1">
                  Zurück
                </Button>
                <Button onClick={handleVerify} disabled={loading || verifyCode.length !== 6} className="flex-1">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Verifizieren
                </Button>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="text-center space-y-4 py-4">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
              <div>
                <h3 className="font-semibold text-lg">Erfolgreich aktiviert!</h3>
                <p className="text-sm text-muted-foreground">
                  Dein Konto ist jetzt zusätzlich geschützt
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
