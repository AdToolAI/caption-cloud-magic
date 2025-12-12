import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Loader2, AlertTriangle } from "lucide-react";

interface TwoFactorChallengeProps {
  open: boolean;
  onSuccess: () => void;
  onCancel: () => void;
}

export const TwoFactorChallenge = ({ open, onSuccess, onCancel }: TwoFactorChallengeProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const handleVerify = async () => {
    if (code.length !== 6) {
      setError("Bitte gib einen 6-stelligen Code ein");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Get the list of factors
      const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
      
      if (factorsError) throw factorsError;

      const totpFactor = factorsData.totp.find(f => f.status === 'verified');
      
      if (!totpFactor) {
        throw new Error('Kein verifizierter TOTP-Faktor gefunden');
      }

      // Create a challenge
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: totpFactor.id
      });

      if (challengeError) throw challengeError;

      // Verify the challenge
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: totpFactor.id,
        challengeId: challengeData.id,
        code
      });

      if (verifyError) throw verifyError;

      toast({
        title: "Erfolgreich verifiziert",
        description: "Du bist jetzt angemeldet"
      });
      
      onSuccess();
    } catch (err: any) {
      console.error('MFA challenge error:', err);
      setError(err.message || 'Ungültiger Code');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    // Sign out if user cancels 2FA
    await supabase.auth.signOut();
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Zwei-Faktor-Authentifizierung
          </DialogTitle>
          <DialogDescription>
            Gib den Code aus deiner Authenticator-App ein
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="mfa-code">Verifizierungscode</Label>
            <Input
              id="mfa-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
              className="text-center text-2xl tracking-widest"
              autoFocus
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCancel} className="flex-1">
              Abbrechen
            </Button>
            <Button onClick={handleVerify} disabled={loading || code.length !== 6} className="flex-1">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Verifizieren
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
