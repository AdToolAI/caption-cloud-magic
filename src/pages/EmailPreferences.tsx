import { tx } from "@/lib/i18nText";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2, Mail, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Lang = "en" | "de" | "es";

const COPY: Record<Lang, {
  title: string; desc: string; loading: string; invalid: string; back: string;
  toggleLabel: string; toggleDesc: string; saved: string; error: string;
  unsubscribed: string; resubscribed: string; quickUnsub: string;
  pushLabel: string; pushDesc: string;
}> = {
  en: {
    title: "Email preferences",
    desc: "Manage which emails you receive from AdTool.",
    loading: "Loading your preferences…",
    invalid: "This unsubscribe link is invalid or has expired.",
    back: "Go to homepage",
    toggleLabel: "Onboarding reminder emails",
    toggleDesc: "Helpful tips and progress reminders during your first week.",
    saved: "Preferences updated",
    error: "Could not update preferences",
    unsubscribed: "You have been unsubscribed.",
    resubscribed: "You are subscribed again.",
    quickUnsub: "Unsubscribe from all reminders",
    pushLabel: "Browser push reminders",
    pushDesc: "Short browser notifications during your first week (requires permission).",
  },
  de: {
    title: tx({ de: "E-Mail-Einstellungen", en: "Email Settings", es: "Configuración de correo electrónico" }),
    desc: "Verwalte, welche E-Mails du von AdTool erhältst.",
    loading: tx({ de: "Einstellungen werden geladen…", en: "Settings are loading…", es: "Cargando configuración…" }),
    invalid: tx({ de: "Dieser Abmelde-Link ist ungültig oder abgelaufen.", en: "This unsubscribe link is invalid or has expired.", es: "Este enlace para cancelar la suscripción no es válido o ha caducado." }),
    back: tx({ de: "Zur Startseite", en: "To Homepage", es: "A la página de inicio" }),
    toggleLabel: "Onboarding-Erinnerungs-E-Mails",
    toggleDesc: tx({ de: "Hilfreiche Tipps und Fortschritts-Erinnerungen in deiner ersten Woche.", en: "Helpful tips and progress reminders in your first week.", es: "Consejos útiles y recordatorios de progreso en tu primera semana." }),
    saved: tx({ de: "Einstellungen aktualisiert", en: "Settings updated", es: "Configuraciones actualizadas" }),
    error: tx({ de: "Einstellungen konnten nicht aktualisiert werden", en: "Could not update settings", es: "No se pudieron actualizar los ajustes" }),
    unsubscribed: tx({ de: "Du wurdest abgemeldet.", en: "You have been unsubscribed.", es: "Has sido dado de baja." }),
    resubscribed: tx({ de: "Du bist wieder angemeldet.", en: "You are subscribed again.", es: "Te has suscrito de nuevo." }),
    quickUnsub: tx({ de: "Von allen Erinnerungen abmelden", en: "Unsubscribe from all reminders", es: "Darse de baja de todos los recordatorios" }),
    pushLabel: tx({ de: "Browser-Push-Erinnerungen", en: "Browser push reminders", es: "Recordatorios push del navegador" }),
    pushDesc: tx({ de: "Kurze Browser-Benachrichtigungen in deiner ersten Woche (Berechtigung erforderlich).", en: "Short browser notifications in your first week (permission required).", es: "Notificaciones breves del navegador en tu primera semana (se requiere permiso)." }),
  },
  es: {
    title: "Preferencias de correo",
    desc: "Gestiona qué correos recibes de AdTool.",
    loading: "Cargando tus preferencias…",
    invalid: "Este enlace de cancelación es inválido o ha expirado.",
    back: "Ir al inicio",
    toggleLabel: "Correos de recordatorio de incorporación",
    toggleDesc: "Consejos útiles y recordatorios de progreso durante tu primera semana.",
    saved: "Preferencias actualizadas",
    error: "No se pudieron actualizar las preferencias",
    unsubscribed: "Te has dado de baja.",
    resubscribed: "Te has suscrito de nuevo.",
    quickUnsub: "Darse de baja de todos los recordatorios",
    pushLabel: "Recordatorios push del navegador",
    pushDesc: "Notificaciones cortas durante tu primera semana (requiere permiso).",
  },
};

const EmailPreferences = () => {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPush, setSavingPush] = useState(false);
  const [valid, setValid] = useState<boolean | null>(null);
  const [email, setEmail] = useState<string>("");
  const [enabled, setEnabled] = useState<boolean>(true);
  const [pushEnabled, setPushEnabled] = useState<boolean>(true);
  const [lang, setLang] = useState<Lang>("en");
  const c = COPY[lang];

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!token) {
        setValid(false);
        setLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase.functions.invoke("update-email-preferences", {
          body: { token, action: "lookup" },
        });
        if (cancelled) return;
        if (error || !data || data.error) {
          setValid(false);
        } else {
          setValid(true);
          setEmail(data.email);
          setEnabled(!!data.drip_emails_enabled);
          setPushEnabled(data.reminder_pushes_enabled !== false);
          const l = (data.language as string) || "en";
          setLang((["en", "de", "es"].includes(l) ? l : "en") as Lang);
        }
      } catch {
        if (!cancelled) setValid(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [token]);

  const updateEmail = async (next: boolean) => {
    if (!token) return;
    setSavingEmail(true);
    const previous = enabled;
    setEnabled(next);
    try {
      const { data, error } = await supabase.functions.invoke("update-email-preferences", {
        body: { token, enabled: next },
      });
      if (error || !data || data.error) throw new Error(data?.error || error?.message);
      toast({ title: c.saved, description: next ? c.resubscribed : c.unsubscribed });
    } catch (e) {
      setEnabled(previous);
      toast({ title: c.error, description: (e as Error).message, variant: "destructive" });
    } finally {
      setSavingEmail(false);
    }
  };

  const updatePush = async (next: boolean) => {
    if (!token) return;
    setSavingPush(true);
    const previous = pushEnabled;
    setPushEnabled(next);
    try {
      const { data, error } = await supabase.functions.invoke("update-email-preferences", {
        body: { token, push_enabled: next },
      });
      if (error || !data || data.error) throw new Error(data?.error || error?.message);
      toast({ title: c.saved });
    } catch (e) {
      setPushEnabled(previous);
      toast({ title: c.error, description: (e as Error).message, variant: "destructive" });
    } finally {
      setSavingPush(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-br from-background via-background to-primary/5">
      <Card className="w-full max-w-lg backdrop-blur-xl bg-card/70 border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            {c.title}
          </CardTitle>
          <CardDescription>{c.desc}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{c.loading}</span>
            </div>
          )}

          {!loading && valid === false && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <p>{c.invalid}</p>
              </div>
              <Button asChild variant="outline">
                <a href="/">{c.back}</a>
              </Button>
            </div>
          )}

          {!loading && valid && (
            <div className="space-y-6">
              <div className="text-sm text-muted-foreground">
                {email && <span className="font-medium text-foreground">{email}</span>}
              </div>

              <div className="flex items-start justify-between gap-4 p-4 rounded-lg border border-white/10 bg-muted/10">
                <div className="space-y-1">
                  <div className="font-medium">{c.toggleLabel}</div>
                  <div className="text-sm text-muted-foreground">{c.toggleDesc}</div>
                </div>
                <Switch checked={enabled} onCheckedChange={updateEmail} disabled={savingEmail} />
              </div>

              <div className="flex items-start justify-between gap-4 p-4 rounded-lg border border-white/10 bg-muted/10">
                <div className="space-y-1">
                  <div className="font-medium">{c.pushLabel}</div>
                  <div className="text-sm text-muted-foreground">{c.pushDesc}</div>
                </div>
                <Switch checked={pushEnabled} onCheckedChange={updatePush} disabled={savingPush} />
              </div>

              {enabled && (
                <Button
                  onClick={() => updateEmail(false)}
                  disabled={savingEmail}
                  variant="outline"
                  className="w-full border-destructive/40 text-destructive hover:bg-destructive/10"
                >
                  {savingEmail ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {c.quickUnsub}
                </Button>
              )}

              {!enabled && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span>{c.unsubscribed}</span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default EmailPreferences;
