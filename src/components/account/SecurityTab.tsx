import { useState } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Loader2, Lock, Shield, Eye, EyeOff, Key, Smartphone, History } from "lucide-react";

const passwordSchema = z.object({
  currentPassword: z.string().min(6, "Passwort muss mindestens 6 Zeichen haben"),
  newPassword: z.string().min(6, "Passwort muss mindestens 6 Zeichen haben"),
  confirmPassword: z.string()
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Passwörter stimmen nicht überein",
  path: ["confirmPassword"]
});

type PasswordFormValues = z.infer<typeof passwordSchema>;

export const SecurityTab = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: ""
    }
  });

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
        title: "Passwort geändert!",
        description: "Ihr Passwort wurde erfolgreich aktualisiert"
      });
      passwordForm.reset();
      setPasswordDialogOpen(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Password Section */}
      <Card className="backdrop-blur-xl bg-card/60 border border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            Passwort
          </CardTitle>
          <CardDescription>
            Ändern Sie Ihr Passwort regelmäßig für optimale Sicherheit
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="flex-1 h-12 border-white/10 hover:bg-white/5">
                  <Key className="h-4 w-4 mr-2" />
                  Passwort ändern
                </Button>
              </DialogTrigger>
              <DialogContent className="backdrop-blur-xl bg-card/95 border border-white/10">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    Passwort ändern
                  </DialogTitle>
                  <DialogDescription>
                    Geben Sie Ihr aktuelles und neues Passwort ein
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
                            <div className="relative">
                              <Input 
                                type={showCurrentPassword ? "text" : "password"} 
                                placeholder="••••••••" 
                                {...field}
                                className="h-11 pr-10 bg-muted/20 border-white/10"
                              />
                              <button
                                type="button"
                                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              >
                                {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
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
                            <div className="relative">
                              <Input 
                                type={showNewPassword ? "text" : "password"} 
                                placeholder="Mindestens 6 Zeichen" 
                                {...field}
                                className="h-11 pr-10 bg-muted/20 border-white/10"
                              />
                              <button
                                type="button"
                                onClick={() => setShowNewPassword(!showNewPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              >
                                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
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
                            <div className="relative">
                              <Input 
                                type={showConfirmPassword ? "text" : "password"} 
                                placeholder="Passwort wiederholen" 
                                {...field}
                                className="h-11 pr-10 bg-muted/20 border-white/10"
                              />
                              <button
                                type="button"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              >
                                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex gap-2 justify-end pt-2">
                      <Button type="button" variant="outline" onClick={() => setPasswordDialogOpen(false)}>
                        Abbrechen
                      </Button>
                      <Button 
                        type="submit" 
                        disabled={loading}
                        className="bg-gradient-to-r from-primary to-primary/80"
                      >
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Passwort aktualisieren
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>

            <Button 
              variant="outline" 
              className="flex-1 h-12 border-white/10 hover:bg-white/5"
              onClick={() => navigate("/forgot-password")}
            >
              <History className="h-4 w-4 mr-2" />
              Passwort zurücksetzen
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Two-Factor Authentication (Coming Soon) */}
      <Card className="backdrop-blur-xl bg-card/60 border border-white/10 opacity-60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-cyan-400" />
            Zwei-Faktor-Authentifizierung
            <span className="text-xs bg-cyan-500/10 text-cyan-400 px-2 py-0.5 rounded-full ml-2">
              Demnächst
            </span>
          </CardTitle>
          <CardDescription>
            Fügen Sie eine zusätzliche Sicherheitsebene zu Ihrem Konto hinzu
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" disabled className="h-12 border-white/10">
            <Shield className="h-4 w-4 mr-2" />
            2FA aktivieren
          </Button>
        </CardContent>
      </Card>

      {/* Active Sessions (Coming Soon) */}
      <Card className="backdrop-blur-xl bg-card/60 border border-white/10 opacity-60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-amber-400" />
            Aktive Sitzungen
            <span className="text-xs bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full ml-2">
              Demnächst
            </span>
          </CardTitle>
          <CardDescription>
            Verwalten Sie Ihre angemeldeten Geräte und Sitzungen
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" disabled className="h-12 border-white/10">
            Sitzungen anzeigen
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
};
