import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Lock, Eye, EyeOff, CheckCircle2, Shield, KeyRound } from "lucide-react";
import { Footer } from "@/components/Footer";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if we have a valid session from the reset link
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Check for error in URL params
        const errorDescription = searchParams.get("error_description");
        if (errorDescription) {
          setError(errorDescription);
        }
      }
    };
    checkSession();
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      toast.error("Passwort muss mindestens 6 Zeichen haben");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwörter stimmen nicht überein");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password: password,
    });

    setLoading(false);

    if (error) {
      toast.error("Fehler beim Zurücksetzen", {
        description: error.message,
      });
    } else {
      setSuccess(true);
      toast.success("Passwort erfolgreich geändert!");
      
      // Redirect to auth page after 3 seconds
      setTimeout(() => {
        navigate("/auth");
      }, 3000);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex flex-col bg-muted/30">
        <main className="flex-1 flex items-center justify-center py-12 px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md"
          >
            <Card className="backdrop-blur-xl bg-card/80 border border-white/10 shadow-2xl">
              <CardHeader className="text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-destructive/10 flex items-center justify-center">
                  <Lock className="h-8 w-8 text-destructive" />
                </div>
                <CardTitle className="text-2xl">Link ungültig</CardTitle>
                <CardDescription>
                  {error || "Der Passwort-Reset-Link ist ungültig oder abgelaufen."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => navigate("/auth")}
                  className="w-full"
                >
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

  if (success) {
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
                <CardTitle className="text-2xl">Passwort geändert!</CardTitle>
                <CardDescription>
                  Ihr Passwort wurde erfolgreich zurückgesetzt. Sie werden zur Anmeldung weitergeleitet...
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => navigate("/auth")}
                  className="w-full"
                >
                  Jetzt anmelden
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
                <KeyRound className="h-10 w-10 text-primary" />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-sm font-medium text-primary mx-auto"
              >
                <Shield className="h-4 w-4" />
                Sicherheit
              </motion.div>

              <CardTitle className="text-2xl font-bold">
                Neues Passwort festlegen
              </CardTitle>
              <CardDescription>
                Geben Sie Ihr neues Passwort ein
              </CardDescription>
            </CardHeader>

            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-5 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="password">Neues Passwort</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={loading}
                      minLength={6}
                      placeholder="Mindestens 6 Zeichen"
                      className="h-12 pr-10 bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Passwort bestätigen</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      disabled={loading}
                      minLength={6}
                      placeholder="Passwort wiederholen"
                      className="h-12 pr-10 bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground font-medium"
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : (
                    <Lock className="mr-2 h-5 w-5" />
                  )}
                  Passwort zurücksetzen
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

export default ResetPassword;
