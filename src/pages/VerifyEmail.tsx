import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, ArrowRight, RefreshCw } from "lucide-react";
import { Footer } from "@/components/Footer";

const VerifyEmail = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    const verifyEmail = async () => {
      const token = searchParams.get("token");

      if (!token) {
        setStatus("error");
        setErrorMessage("Kein Verifizierungstoken gefunden");
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke("verify-email", {
          body: { token }
        });

        if (error) {
          throw error;
        }

        if (data?.success) {
          setStatus("success");
          toast.success("E-Mail erfolgreich verifiziert!", {
            description: "Du kannst jetzt alle Features nutzen"
          });

          // Refresh the session to update email_confirmed_at
          await supabase.auth.refreshSession();
        } else {
          throw new Error(data?.error || "Verification failed");
        }
      } catch (err: any) {
        console.error("Verification error:", err);
        setStatus("error");
        setErrorMessage(err.message || "Die Verifizierung ist fehlgeschlagen");
      }
    };

    verifyEmail();
  }, [searchParams]);

  const handleResendVerification = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user?.email) {
      toast.error("Bitte melde dich erneut an");
      navigate("/auth");
      return;
    }

    try {
      const { error } = await supabase.functions.invoke("send-verification-email", {
        body: { email: user.email, userId: user.id }
      });

      if (error) throw error;

      toast.success("Neue Verifizierungs-E-Mail gesendet!", {
        description: "Prüfe deinen Posteingang"
      });
    } catch (err: any) {
      toast.error("Fehler beim Senden", {
        description: err.message
      });
    }
  };

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
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md"
        >
          <Card className="backdrop-blur-xl bg-card/80 border border-white/10 shadow-2xl">
            <CardHeader className="text-center space-y-4">
              {status === "loading" && (
                <>
                  <motion.div
                    className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  >
                    <Loader2 className="h-10 w-10 text-primary" />
                  </motion.div>
                  <CardTitle className="text-2xl">E-Mail wird verifiziert...</CardTitle>
                  <CardDescription className="text-base">
                    Bitte warten
                  </CardDescription>
                </>
              )}

              {status === "success" && (
                <>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", delay: 0.2 }}
                    className="w-20 h-20 mx-auto rounded-full bg-green-500/10 flex items-center justify-center"
                  >
                    <CheckCircle2 className="h-10 w-10 text-green-500" />
                  </motion.div>
                  <CardTitle className="text-2xl text-green-500">
                    Erfolgreich verifiziert! 🎉
                  </CardTitle>
                  <CardDescription className="text-base">
                    Deine E-Mail-Adresse wurde bestätigt. Du hast jetzt vollen Zugriff auf alle Features.
                  </CardDescription>
                </>
              )}

              {status === "error" && (
                <>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", delay: 0.2 }}
                    className="w-20 h-20 mx-auto rounded-full bg-destructive/10 flex items-center justify-center"
                  >
                    <XCircle className="h-10 w-10 text-destructive" />
                  </motion.div>
                  <CardTitle className="text-2xl text-destructive">
                    Verifizierung fehlgeschlagen
                  </CardTitle>
                  <CardDescription className="text-base">
                    {errorMessage}
                  </CardDescription>
                </>
              )}
            </CardHeader>

            <CardContent className="space-y-4">
              {status === "success" && (
                <Button
                  onClick={() => navigate("/generator")}
                  className="w-full bg-gradient-to-r from-primary to-primary/80"
                >
                  Zum Dashboard
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              )}

              {status === "error" && (
                <>
                  <Button
                    onClick={handleResendVerification}
                    variant="outline"
                    className="w-full"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Neue E-Mail senden
                  </Button>
                  <Button
                    onClick={() => navigate("/auth")}
                    variant="ghost"
                    className="w-full"
                  >
                    Zurück zur Anmeldung
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
};

export default VerifyEmail;
