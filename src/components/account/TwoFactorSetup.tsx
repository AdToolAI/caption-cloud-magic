import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Loader2, CheckCircle, Copy, AlertTriangle, Lock, Smartphone, QrCode } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { motion, AnimatePresence } from "framer-motion";

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

  const steps = [
    { id: 'intro', label: 'Start' },
    { id: 'qr', label: 'QR-Code' },
    { id: 'verify', label: 'Verifizieren' },
    { id: 'success', label: 'Fertig' }
  ];

  const currentStepIndex = steps.findIndex(s => s.id === step);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md backdrop-blur-xl bg-card/90 border border-border/50 shadow-[0_20px_60px_-15px_hsl(var(--primary)/0.2)]">
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
            Schütze dein Konto mit einem zusätzlichen Sicherheitsfaktor
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 py-2">
          {steps.map((s, index) => (
            <div key={s.id} className="flex items-center">
              <div 
                className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                  index <= currentStepIndex 
                    ? 'bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.5)]' 
                    : 'bg-muted-foreground/30'
                }`}
              />
              {index < steps.length - 1 && (
                <div 
                  className={`w-8 h-0.5 mx-1 transition-all duration-300 ${
                    index < currentStepIndex 
                      ? 'bg-primary' 
                      : 'bg-muted-foreground/30'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <div className="py-4">
          <AnimatePresence mode="wait">
            {step === 'intro' && (
              <motion.div 
                key="intro"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                <div className="p-4 bg-muted/30 rounded-xl border border-border/50 space-y-3">
                  <h4 className="font-medium flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-primary" />
                    So funktioniert es:
                  </h4>
                  <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2">
                    <li>Lade eine Authenticator-App herunter (Google Authenticator, Authy, etc.)</li>
                    <li>Scanne den QR-Code mit der App</li>
                    <li>Gib den generierten Code ein, um die Einrichtung abzuschließen</li>
                  </ol>
                </div>
                <Button 
                  onClick={handleEnroll} 
                  disabled={loading} 
                  className="w-full h-11 bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 shadow-[0_8px_30px_-5px_hsl(var(--primary)/0.3)] hover:shadow-[0_12px_40px_-5px_hsl(var(--primary)/0.4)] transition-all duration-300 relative overflow-hidden group"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  <span className="relative">Einrichtung starten</span>
                </Button>
              </motion.div>
            )}

            {step === 'qr' && (
              <motion.div 
                key="qr"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                <div className="flex justify-center">
                  <div className="p-4 bg-white rounded-xl shadow-[0_8px_30px_-5px_hsl(var(--foreground)/0.1)]">
                    <img src={qrCode} alt="QR Code" className="w-48 h-48" />
                  </div>
                </div>
                
                <div className="p-3 bg-muted/30 rounded-xl border border-border/50">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <QrCode className="h-3 w-3" />
                    Manueller Schlüssel:
                  </Label>
                  <div className="flex items-center gap-2 mt-2">
                    <code className="flex-1 text-xs font-mono bg-background/50 px-3 py-2 rounded-lg break-all border border-border/50">
                      {secret}
                    </code>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={copySecret}
                      className="h-9 w-9 hover:bg-primary/10 hover:text-primary transition-colors"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <Button 
                  onClick={() => setStep('verify')} 
                  className="w-full h-11 bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 shadow-[0_8px_30px_-5px_hsl(var(--primary)/0.3)] hover:shadow-[0_12px_40px_-5px_hsl(var(--primary)/0.4)] transition-all duration-300 relative overflow-hidden group"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                  <span className="relative">Weiter zur Verifizierung</span>
                </Button>
              </motion.div>
            )}

            {step === 'verify' && (
              <motion.div 
                key="verify"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                <div className="space-y-3">
                  <Label htmlFor="code" className="text-sm font-medium flex items-center gap-2">
                    <Lock className="h-4 w-4 text-primary" />
                    Verifizierungscode
                  </Label>
                  <Input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    placeholder="000000"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                    className="text-center text-3xl tracking-[0.5em] font-mono h-14 bg-muted/30 border-border/50 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 rounded-xl transition-all duration-300"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground text-center">
                    Gib den 6-stelligen Code aus deiner Authenticator-App ein
                  </p>
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
                    onClick={() => setStep('qr')} 
                    className="flex-1 h-11 bg-muted/30 border-border/50 hover:bg-muted/50 transition-all duration-300"
                  >
                    Zurück
                  </Button>
                  <Button 
                    onClick={handleVerify} 
                    disabled={loading || verifyCode.length !== 6} 
                    className="flex-1 h-11 bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90 shadow-[0_8px_30px_-5px_hsl(var(--primary)/0.3)] hover:shadow-[0_12px_40px_-5px_hsl(var(--primary)/0.4)] transition-all duration-300 relative overflow-hidden group"
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    <span className="relative">Verifizieren</span>
                  </Button>
                </div>
              </motion.div>
            )}

            {step === 'success' && (
              <motion.div 
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, type: "spring" }}
                className="text-center space-y-4 py-6"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                >
                  <div className="w-20 h-20 mx-auto bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center shadow-[0_8px_30px_-5px_rgb(34,197,94,0.4)]">
                    <CheckCircle className="h-10 w-10 text-white" />
                  </div>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.3 }}
                >
                  <h3 className="font-semibold text-lg">Erfolgreich aktiviert!</h3>
                  <p className="text-sm text-muted-foreground">
                    Dein Konto ist jetzt zusätzlich geschützt
                  </p>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
};
