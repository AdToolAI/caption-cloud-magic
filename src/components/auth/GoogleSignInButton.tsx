import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { tx } from "@/lib/i18nText";
import { lovable } from "@/integrations/lovable";

const GoogleLogo = () => (
  <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 0 1 9.77 24c0-1.6.27-3.15.76-4.59l-7.98-6.19A23.94 23.94 0 0 0 0 24c0 3.88.93 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.17 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

export const GoogleSignInButton = ({ disabled }: { disabled?: boolean }) => {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
      extraParams: { prompt: "select_account" },
    });

    const error = "error" in result ? result.error : undefined;
    if (!error) {
      if (!("redirected" in result && result.redirected)) setLoading(false);
      return;
    }
    setLoading(false);
    
      toast.error(
        tx({
          de: "Google-Anmeldung fehlgeschlagen",
          en: "Google sign-in failed",
          es: "Error al iniciar sesión con Google",
        }),
        {
          description: tx({
            de: "Bitte versuche es erneut oder nutze E-Mail und Passwort.",
            en: "Please try again or use email and password.",
            es: "Inténtalo de nuevo o usa correo y contraseña.",
          }),
        },
      );
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleClick}
      disabled={disabled || loading}
      className="h-11 w-full rounded-xl border-border/60 bg-background/60 font-medium transition-all duration-300 hover:bg-muted/40"
    >
      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <span className="mr-2"><GoogleLogo /></span>}
      {tx({ de: "Mit Google fortfahren", en: "Continue with Google", es: "Continuar con Google" })}
    </Button>
  );
};
