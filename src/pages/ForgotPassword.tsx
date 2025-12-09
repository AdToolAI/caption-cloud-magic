import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Mail, ArrowLeft, CheckCircle2, Shield } from "lucide-react";
import { Footer } from "@/components/Footer";

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      toast.error("Bitte geben Sie Ihre E-Mail-Adresse ein");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.functions.invoke('send-password-reset-email', {
        body: { email }
      });

      setLoading(false);

      if (error) {
        toast.error("Fehler beim Senden", {
          description: error.message,
        });
      } else {
        setSent(true);
        toast.success("E-Mail gesendet!", {
          description: "Prüfen Sie Ihren Posteingang",
        });
      }
    } catch (err: any) {
      setLoading(false);
      toast.error("Fehler beim Senden", {
        description: err.message || "Bitte versuchen Sie es später erneut",
      });
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex flex-col bg-muted/30">
        <main className="flex-1 flex items-center justify-center py-12 px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md"
          >
            <Card className="backdrop-blur-xl bg-card/80 border border-white/10 shadow-2xl">
              <CardHeader className="text-center space-y-4">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.2 }}
                  className="w-20 h-20 mx-auto rounded-full bg-green-500/10 flex items-center justify-center"
                >
                  <CheckCircle2 className="h-10 w-10 text-green-500" />
                </motion.div>
                <CardTitle className="text-2xl">E-Mail gesendet!</CardTitle>
                <CardDescription className="text-base">
                  Wir haben Ihnen einen Link zum Zurücksetzen Ihres Passworts an <strong>{email}</strong> gesendet.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-xl bg-muted/30 border border-white/5 text-sm text-muted-foreground">
                  <p>Prüfen Sie auch Ihren Spam- oder Junk-Ordner, falls Sie die E-Mail nicht finden.</p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => navigate("/auth")}
                  className="w-full"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Zurück zur Anmeldung
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{ duration: 8, repeat: Infinity }}
        />
      </div>

      <main className="flex-1 flex items-center justify-center py-12 px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <Card className="backdrop-blur-xl bg-card/80 border border-white/10 shadow-2xl">
            <CardHeader className="text-center space-y-4 pb-2">
              <motion.div
                className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center border border-white/10"
                animate={{
                  boxShadow: [
                    "0 0 20px hsla(43, 90%, 68%, 0.2)",
                    "0 0 40px hsla(43, 90%, 68%, 0.3)",
                    "0 0 20px hsla(43, 90%, 68%, 0.2)",
                  ],
                }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Mail className="h-10 w-10 text-primary" />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-sm font-medium text-primary mx-auto"
              >
                <Shield className="h-4 w-4" />
                Passwort-Wiederherstellung
              </motion.div>

              <CardTitle className="text-2xl font-bold">
                Passwort vergessen?
              </CardTitle>
              <CardDescription className="text-base">
                Geben Sie Ihre E-Mail-Adresse ein und wir senden Ihnen einen Link zum Zurücksetzen.
              </CardDescription>
            </CardHeader>

            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-5 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="email">E-Mail-Adresse</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    placeholder="you@example.com"
                    className="h-12 bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground font-medium"
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                    <Mail className="mr-2 h-5 w-5" />
                  )}
                  Reset-Link senden
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => navigate("/auth")}
                  className="w-full"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Zurück zur Anmeldung
                </Button>
              </CardContent>
            </form>
          </Card>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
};

export default ForgotPassword;
