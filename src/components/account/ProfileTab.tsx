import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, User, Mail, Phone, CheckCircle2, AlertCircle, Save } from "lucide-react";

const profileSchema = z.object({
  name: z.string()
    .min(2, "Name muss mindestens 2 Zeichen haben")
    .max(100, "Name darf maximal 100 Zeichen haben")
    .optional()
    .or(z.literal("")),
  phone_number: z.string()
    .regex(/^\+?[0-9\s\-()]+$/, "Ungültige Telefonnummer")
    .min(6, "Telefonnummer zu kurz")
    .max(20, "Telefonnummer zu lang")
    .optional()
    .or(z.literal(""))
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export const ProfileTab = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: "",
      phone_number: ""
    }
  });

  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;

    const { data } = await supabase
      .from("profiles")
      .select("name, phone_number, email_verified")
      .eq("id", user.id)
      .single();

    if (data) {
      form.reset({
        name: data.name || "",
        phone_number: data.phone_number || ""
      });
      setEmailVerified(data.email_verified || false);
    }
  };

  const onSubmit = async (values: ProfileFormValues) => {
    if (!user) return;

    setLoading(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        name: values.name || null,
        phone_number: values.phone_number || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", user.id);

    setLoading(false);

    if (error) {
      toast({
        title: "Fehler",
        description: "Profil konnte nicht aktualisiert werden",
        variant: "destructive"
      });
    } else {
      toast({
        title: "Gespeichert!",
        description: "Ihre Profildaten wurden aktualisiert"
      });
    }
  };

  const resendVerification = async () => {
    if (!user?.email) return;

    setResendLoading(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: user.email
    });
    setResendLoading(false);

    if (error) {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "E-Mail gesendet",
        description: "Verifizierungs-E-Mail wurde erneut gesendet"
      });
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <Card className="backdrop-blur-xl bg-card/60 border border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Persönliche Informationen
          </CardTitle>
          <CardDescription>
            Verwalten Sie Ihre persönlichen Daten und Kontaktinformationen
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vollständiger Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Max Mustermann" 
                        {...field} 
                        className="h-12 bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Email with Verification Status */}
              <div className="space-y-2">
                <FormLabel className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  E-Mail-Adresse
                </FormLabel>
                <div className="flex items-center gap-3">
                  <Input 
                    value={user?.email || ""} 
                    disabled 
                    className="flex-1 h-12 bg-muted/10 border-white/5"
                  />
                  {emailVerified ? (
                    <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Verifiziert
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Nicht verifiziert
                    </Badge>
                  )}
                </div>
                <FormDescription>
                  {emailVerified 
                    ? "Ihre E-Mail-Adresse ist bestätigt" 
                    : (
                      <span className="flex items-center gap-2">
                        Bitte bestätigen Sie Ihre E-Mail-Adresse
                        <Button 
                          type="button" 
                          variant="link" 
                          size="sm" 
                          onClick={resendVerification}
                          disabled={resendLoading}
                          className="p-0 h-auto text-primary"
                        >
                          {resendLoading ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Erneut senden"
                          )}
                        </Button>
                      </span>
                    )
                  }
                </FormDescription>
              </div>

              <FormField
                control={form.control}
                name="phone_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Telefonnummer (Optional)
                    </FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="+49 123 456789" 
                        {...field} 
                        className="h-12 bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                      />
                    </FormControl>
                    <FormDescription>
                      Für SMS-Benachrichtigungen und Zwei-Faktor-Authentifizierung
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button 
                type="submit" 
                disabled={loading}
                className="h-11 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Änderungen speichern
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </motion.div>
  );
};
