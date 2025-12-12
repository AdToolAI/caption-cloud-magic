import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Loader2, AlertTriangle, Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
      <DialogContent 
        className="sm:max-w-md backdrop-blur-xl bg-card/90 border border-border/50 shadow-[0_20px_60px_-15px_hsl(var(--primary)/0.2)]" 
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="mx-auto mb-4"
          >
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 bg-gradient-to-br from-primary to-accent rounded-2xl animate-pulse opacity-20" />
              <div className="relative w-full h-full bg-gradient-to-br from-primary to-accent rounded-2xl flex items-center justify-center shadow-[0_8px_30px_-5px_hsl(var(--primary)/0.4)]">
                <Shield className="h-8 w-8 text-primary-foreground" />
              </div>
            </div>
          </motion.div>
          
          <DialogTitle className="text-xl font-bold">
            Zwei-Faktor-Authentifizierung
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Gib den Code aus deiner Authenticator-App ein
          </DialogDescription>
        </DialogHeader>

        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3 }}
          className="space-y-5 py-4"
        >
          <div className="space-y-3">
            <Label htmlFor="mfa-code" className="text-sm font-medium flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" />
              Verifizierungscode
            </Label>
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
              className="text-center text-3xl tracking-[0.5em] font-mono h-14 bg-muted/30 border-border/50 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 rounded-xl transition-all duration-300"
              autoFocus
            />
          </div>

          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2 text-destructive text-sm p-3 bg-destructive/10 rounded-lg border border-destructive/20"
              >
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex gap-3 pt-2">
            <Button 
              variant="outline" 
              onClick={handleCancel} 
              className="flex-1 h-11 bg-muted/30 border-border/50 hover:bg-muted/50 transition-all duration-300"
            >
              Abbrechen
            </Button>
            <Button 
              onClick={handleVerify} 
              disabled={loading || code.length !== 6} 
              className="flex-1 h-11 bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 shadow-[0_8px_30px_-5px_hsl(var(--primary)/0.3)] hover:shadow-[0_12px_40px_-5px_hsl(var(--primary)/0.4)] transition-all duration-300 relative overflow-hidden group"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              <span className="relative">Verifizieren</span>
            </Button>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
};
