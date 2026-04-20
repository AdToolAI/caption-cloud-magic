import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail, Loader2, RefreshCw, CheckCircle2, Shield } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface EmailVerificationGateProps {
  children: React.ReactNode;
}

// Routes that don't require email verification
const PUBLIC_ROUTES = [
  '/', 
  '/auth', 
  '/forgot-password', 
  '/reset-password', 
  '/verify-email',
  '/pricing', 
  '/faq', 
  '/legal',
  '/privacy',
  '/terms',
  '/delete-data',
  '/support'
];

export const EmailVerificationGate = ({ children }: EmailVerificationGateProps) => {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const { t, language } = useTranslation();
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [checking, setChecking] = useState(true);

  // Check if current route is public
  const isPublicRoute = PUBLIC_ROUTES.some(route => 
    location.pathname === route || location.pathname.startsWith('/legal/')
  );

  useEffect(() => {
    if (user) {
      checkEmailVerification();
    } else {
      setEmailVerified(null);
      setChecking(false);
    }
  }, [user]);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const checkEmailVerification = async () => {
    if (!user) return;
    
    setChecking(true);
    
    // Check directly from Supabase Auth session - this is the source of truth
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session?.user?.email_confirmed_at) {
      setEmailVerified(true);
    } else {
      setEmailVerified(false);
    }
    
    setChecking(false);
  };

  const resendVerification = async () => {
    if (!user?.email || !user?.id || countdown > 0) return;

    setLoading(true);
    
    try {
      const { error } = await supabase.functions.invoke('send-verification-email', {
        body: { email: user.email, userId: user.id, language }
      });

      if (error) {
        toast.error(t("emailGate.sendError"), {
          description: error.message,
        });
      } else {
        toast.success(t("emailGate.sentTitle"), {
          description: t("emailGate.sentDesc"),
        });
        setCountdown(60);
      }
    } catch (err: any) {
      toast.error(t("emailGate.sendError"), {
        description: err.message || t("emailGate.tryAgain"),
      });
    }
    
    setLoading(false);
  };

  const refreshStatus = async () => {
    setLoading(true);
    
    const { data: { session }, error } = await supabase.auth.refreshSession();
    
    if (error) {
      toast.error(t("emailGate.refreshError"), {
        description: error.message,
      });
      setLoading(false);
      return;
    }
    
    if (session?.user?.email_confirmed_at) {
      setEmailVerified(true);
      toast.success(t("emailGate.verified"), {
        description: t("emailGate.welcome"),
      });
    } else {
      toast.info(t("emailGate.notYet"), {
        description: t("emailGate.clickLink"),
      });
    }
    setLoading(false);
  };

  // Show loading state only briefly
  if (authLoading || (checking && user)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If not logged in, show children (public routes or auth handling)
  if (!user) {
    return <>{children}</>;
  }

  // Always allow public routes
  if (isPublicRoute) {
    return <>{children}</>;
  }

  // If email is verified, show children
  if (emailVerified) {
    return <>{children}</>;
  }

  // Show verification gate
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-muted/20">
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
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl"
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{ duration: 8, repeat: Infinity, delay: 2 }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md"
      >
        <Card className="backdrop-blur-xl bg-card/80 border border-white/10 shadow-2xl">
          <CardHeader className="text-center space-y-4 pb-2">
            {/* Icon */}
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

            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-sm font-medium text-primary mx-auto"
            >
              <Shield className="h-4 w-4" />
              {t("emailGate.badge")}
            </motion.div>

            <CardTitle className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
              {t("emailGate.title")}
            </CardTitle>
            <CardDescription className="text-base">
              {t("emailGate.subtitle")}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 pt-4">
            {/* Email Display */}
            <div className="p-4 rounded-xl bg-muted/30 border border-white/5">
              <p className="text-sm text-muted-foreground mb-1">{t("emailGate.emailLabel")}</p>
              <p className="font-medium text-foreground">{user.email}</p>
            </div>

            {/* Instructions */}
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t("emailGate.instructions")}
              </p>
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span>{t("emailGate.checkSpam")}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <Button
                onClick={resendVerification}
                disabled={loading || countdown > 0}
                className="w-full h-12 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground font-medium"
              >
                {loading ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <Mail className="mr-2 h-5 w-5" />
                )}
                {countdown > 0
                  ? t("emailGate.resendIn", { seconds: countdown })
                  : t("emailGate.resend")}
              </Button>

              <Button
                variant="outline"
                onClick={refreshStatus}
                disabled={loading}
                className="w-full h-11 border-white/10 hover:bg-white/5"
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                {t("emailGate.refresh")}
              </Button>
            </div>

            {/* Help Text */}
            <p className="text-xs text-center text-muted-foreground">
              {t("emailGate.problemsContact")}{" "}
              <a href="/support" className="text-primary hover:underline">
                {t("emailGate.support")}
              </a>
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};
