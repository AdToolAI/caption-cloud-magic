import { useState, useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { getProductInfo } from "@/config/pricing";
import { pricingPlans } from "@/config/pricing";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Crown, Calendar, Headphones, User, Mail, Phone, Lock, CheckCircle2, AlertCircle } from "lucide-react";

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

const passwordSchema = z.object({
  currentPassword: z.string().min(6, "Passwort muss mindestens 6 Zeichen haben"),
  newPassword: z.string().min(6, "Passwort muss mindestens 6 Zeichen haben"),
  confirmPassword: z.string()
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Passwörter stimmen nicht überein",
  path: ["confirmPassword"]
});

type ProfileFormValues = z.infer<typeof profileSchema>;
type PasswordFormValues = z.infer<typeof passwordSchema>;

const Account = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading, subscribed, productId, subscriptionEnd } = useAuth();
  const [emailVerified, setEmailVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: "",
      phone_number: ""
    }
  });

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: ""
    }
  });

  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("name, phone_number, email_verified")
      .eq("id", user.id)
      .single();

    if (data) {
      profileForm.reset({
        name: data.name || "",
        phone_number: data.phone_number || ""
      });
      setEmailVerified(data.email_verified || false);
    }
  };

  const onProfileSubmit = async (values: ProfileFormValues) => {
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
        title: "Erfolg",
        description: "Profil erfolgreich aktualisiert"
      });
    }
  };

  const resendVerification = async () => {
    if (!user?.email) return;

    setLoading(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: user.email
    });
    setLoading(false);

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

  const onPasswordSubmit = async (values: PasswordFormValues) => {
    if (!user?.email) return;

    setLoading(true);

    // Verify current password
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: values.currentPassword
    });

    if (signInError) {
      setLoading(false);
      toast({
        title: "Fehler",
        description: "Aktuelles Passwort ist falsch",
        variant: "destructive"
      });
      return;
    }

    // Update password
    const { error } = await supabase.auth.updateUser({
      password: values.newPassword
    });

    setLoading(false);

    if (error) {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Erfolg",
        description: "Passwort erfolgreich geändert"
      });
      passwordForm.reset();
      setPasswordDialogOpen(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const planInfo = getProductInfo(productId);
  const isPro = subscribed && productId === 'prod_TDoYdYP1nOOWsN';

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 py-12 px-4">
        <div className="container max-w-4xl mx-auto space-y-6">
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-2">Account-Einstellungen</h1>
            <p className="text-muted-foreground">Verwalten Sie Ihr Profil und Abonnement</p>
          </div>

          {/* Personal Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Persönliche Informationen
              </CardTitle>
              <CardDescription>
                Aktualisieren Sie Ihre persönlichen Daten
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...profileForm}>
                <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
                  <FormField
                    control={profileForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Ihr Name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-2">
                    <FormLabel>E-Mail</FormLabel>
                    <div className="flex items-center gap-2">
                      <Input value={user.email} disabled className="flex-1" />
                      {emailVerified ? (
                        <Badge variant="default">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Verifiziert
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Nicht verifiziert
                        </Badge>
                      )}
                    </div>
                    <FormDescription>
                      Ihre E-Mail-Adresse kann nicht geändert werden
                    </FormDescription>
                  </div>

                  <FormField
                    control={profileForm.control}
                    name="phone_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Telefonnummer (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="+49 123 456789" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Änderungen speichern
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          {/* Email Verification */}
          {!emailVerified && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  E-Mail-Verifizierung
                </CardTitle>
                <CardDescription>
                  Verifizieren Sie Ihre E-Mail-Adresse für zusätzliche Sicherheit
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">E-Mail noch nicht verifiziert</p>
                    <p className="text-sm text-muted-foreground">
                      Prüfen Sie Ihren Posteingang auf die Verifizierungs-E-Mail
                    </p>
                  </div>
                  <Button variant="outline" onClick={resendVerification} disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    E-Mail erneut senden
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Password & Security */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Passwort & Sicherheit
              </CardTitle>
              <CardDescription>
                Ändern Sie Ihr Passwort für zusätzliche Sicherheit
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Lock className="h-4 w-4 mr-2" />
                    Passwort ändern
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Passwort ändern</DialogTitle>
                    <DialogDescription>
                      Geben Sie Ihr aktuelles Passwort und Ihr neues Passwort ein
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...passwordForm}>
                    <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                      <FormField
                        control={passwordForm.control}
                        name="currentPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Aktuelles Passwort</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="••••••••" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={passwordForm.control}
                        name="newPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Neues Passwort</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="••••••••" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={passwordForm.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Passwort bestätigen</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="••••••••" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="flex gap-2 justify-end">
                        <Button type="button" variant="outline" onClick={() => setPasswordDialogOpen(false)}>
                          Abbrechen
                        </Button>
                        <Button type="submit" disabled={loading}>
                          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Passwort aktualisieren
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          {/* Current Plan */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {isPro && <Crown className="h-5 w-5 text-warning" />}
                Aktueller Plan: {planInfo.name}
              </CardTitle>
              <CardDescription>
                {subscribed 
                  ? "Sie haben Zugriff auf Premium-Funktionen"
                  : "Upgraden Sie für Premium-Funktionen"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <p className="font-medium">E-Mail</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
              </div>

              {subscribed ? (
                <>
                  {subscriptionEnd && (
                    <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <div>
                        <p className="font-medium">Nächster Abrechnungstermin</p>
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          {new Date(subscriptionEnd).toLocaleDateString('de-DE')}
                        </p>
                      </div>
                    </div>
                  )}
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => navigate('/billing')}
                  >
                    Abonnement verwalten
                  </Button>
                </>
              ) : (
                <Button 
                  className="w-full" 
                  size="lg"
                  onClick={() => navigate('/pricing')}
                >
                  Auf Pro upgraden - {pricingPlans.pro.price.EUR}€/Monat
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Support SLA */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Headphones className="h-5 w-5" />
                Support-SLA
              </CardTitle>
              <CardDescription>
                Ihre Support-Priorität basierend auf Ihrem Plan
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!subscribed && (
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">Basic Support</p>
                    <p className="text-sm text-muted-foreground">Community-Support via Discord</p>
                  </div>
                  <Badge variant="secondary">Basic</Badge>
                </div>
              )}
              {subscribed && productId === 'prod_TDoYdYP1nOOWsN' && (
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg border-2 border-primary/20">
                  <div>
                    <p className="font-medium">Pro Support</p>
                    <p className="text-sm text-muted-foreground">Antwort innerhalb von 24 Stunden</p>
                  </div>
                  <Badge variant="default">Pro</Badge>
                </div>
              )}
              {subscribed && productId === 'prod_TDoY2RvK6Xd0fV' && (
                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-primary/10 to-accent/10 rounded-lg border-2 border-primary">
                  <div>
                    <p className="font-medium">Enterprise Support</p>
                    <p className="text-sm text-muted-foreground">Antwort innerhalb von 8 Stunden • Prioritäts-Support</p>
                  </div>
                  <Badge variant="default" className="bg-gradient-to-r from-primary to-accent">
                    Enterprise
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Subscription Details */}
          <Card>
            <CardHeader>
              <CardTitle>Abonnement-Details</CardTitle>
              <CardDescription>
                {subscribed ? `${planInfo.name} Plan - ${planInfo.currency}${planInfo.price}/Monat` : 'Kein aktives Abonnement'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {subscribed 
                  ? "Verwalten Sie Ihr Abonnement und Rechnungsdetails auf der Rechnungsseite" 
                  : "Upgraden Sie auf einen kostenpflichtigen Plan, um alle Funktionen freizuschalten"}
              </p>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Account;
