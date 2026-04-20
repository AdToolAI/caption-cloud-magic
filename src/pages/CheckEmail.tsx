import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail, RefreshCw, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Footer } from "@/components/Footer";
import { useTranslation } from "@/hooks/useTranslation";

const RESEND_COOLDOWN_SECONDS = 60;

const CheckEmail = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, language } = useTranslation();
  const email = searchParams.get("email") || "";
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleResend = async () => {
    if (cooldown > 0 || !email) return;
    setResending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) {
        toast.error(t("checkEmail.notLoggedIn"));
        navigate("/auth");
        return;
      }
      const { error } = await supabase.functions.invoke("send-verification-email", {
        body: { email, userId: user.id, language },
      });
      if (error) throw error;
      toast.success(t("checkEmail.resentTitle"), {
        description: t("checkEmail.resentDesc"),
      });
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err: any) {
      toast.error(t("checkEmail.resendError"), {
        description: err.message,
      });
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl"
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
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
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", delay: 0.2 }}
                className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center"
              >
                <Mail className="h-10 w-10 text-primary" />
              </motion.div>
              <CardTitle className="text-2xl">{t("checkEmail.title")}</CardTitle>
              <CardDescription className="text-base">
                {t("checkEmail.subtitle")}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {email && (
                <div className="rounded-xl border border-border bg-muted/40 p-4 text-center">
                  <p className="text-sm text-muted-foreground mb-1">
                    {t("checkEmail.sentTo")}
                  </p>
                  <p className="font-semibold text-foreground break-all">{email}</p>
                </div>
              )}

              <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span>{t("checkEmail.step1")}</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span>{t("checkEmail.step2")}</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span>{t("checkEmail.step3")}</span>
                </div>
              </div>

              <Button
                onClick={handleResend}
                disabled={cooldown > 0 || resending || !email}
                variant="outline"
                className="w-full"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${resending ? "animate-spin" : ""}`} />
                {cooldown > 0
                  ? t("checkEmail.resendIn", { seconds: cooldown })
                  : t("checkEmail.resend")}
              </Button>

              <Button
                onClick={() => navigate("/auth")}
                variant="ghost"
                className="w-full"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t("checkEmail.useDifferent")}
              </Button>

              <p className="text-xs text-center text-muted-foreground pt-2">
                {t("checkEmail.problemsContact")}{" "}
                <Link to="/support" className="text-primary hover:underline">
                  {t("checkEmail.support")}
                </Link>
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </main>

      <Footer />
    </div>
  );
};

export default CheckEmail;
