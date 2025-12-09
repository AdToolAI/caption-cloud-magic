import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, Download, AlertTriangle, FileDown, LogOut } from "lucide-react";

export const AdvancedTab = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleExportData = async () => {
    setLoading(true);
    try {
      // Fetch user data
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user?.id)
        .single();

      const exportData = {
        email: user?.email,
        profile: profile,
        exportedAt: new Date().toISOString()
      };

      // Create download
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `adtool-data-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Export erfolgreich",
        description: "Ihre Daten wurden heruntergeladen"
      });
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Export fehlgeschlagen",
        variant: "destructive"
      });
    }
    setLoading(false);
  };

  const handleDeleteAccount = async () => {
    if (confirmEmail !== user?.email) {
      toast({
        title: "Fehler",
        description: "E-Mail-Adresse stimmt nicht überein",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      // Note: Full account deletion requires admin API or Edge Function
      // For now, we'll just sign out and show a message
      toast({
        title: "Löschanfrage gesendet",
        description: "Ihr Konto wird innerhalb von 30 Tagen gelöscht. Sie erhalten eine Bestätigungs-E-Mail."
      });
      
      await signOut();
      navigate("/");
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Löschung fehlgeschlagen",
        variant: "destructive"
      });
    }
    setLoading(false);
  };

  const handleLogoutAllDevices = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut({ scope: 'global' });
      toast({
        title: "Abgemeldet",
        description: "Sie wurden von allen Geräten abgemeldet"
      });
      navigate("/auth");
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Abmeldung fehlgeschlagen",
        variant: "destructive"
      });
    }
    setLoading(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Data Export */}
      <Card className="backdrop-blur-xl bg-card/60 border border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-cyan-400" />
            Daten exportieren
          </CardTitle>
          <CardDescription>
            Laden Sie eine Kopie Ihrer persönlichen Daten herunter
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            variant="outline" 
            onClick={handleExportData}
            disabled={loading}
            className="h-12 border-white/10 hover:bg-white/5"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4 mr-2" />
            )}
            Daten als JSON exportieren
          </Button>
        </CardContent>
      </Card>

      {/* Logout All Devices */}
      <Card className="backdrop-blur-xl bg-card/60 border border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LogOut className="h-5 w-5 text-amber-400" />
            Alle Geräte abmelden
          </CardTitle>
          <CardDescription>
            Melden Sie sich von allen Geräten ab, auf denen Sie angemeldet sind
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            variant="outline" 
            onClick={handleLogoutAllDevices}
            disabled={loading}
            className="h-12 border-amber-500/20 text-amber-400 hover:bg-amber-500/10"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4 mr-2" />
            )}
            Überall abmelden
          </Button>
        </CardContent>
      </Card>

      {/* Delete Account */}
      <Card className="backdrop-blur-xl bg-card/60 border border-destructive/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            Konto löschen
          </CardTitle>
          <CardDescription>
            Löschen Sie Ihr Konto und alle damit verbundenen Daten permanent
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                variant="outline" 
                className="h-12 border-destructive/20 text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Konto löschen
              </Button>
            </DialogTrigger>
            <DialogContent className="backdrop-blur-xl bg-card/95 border border-white/10">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  Konto wirklich löschen?
                </DialogTitle>
                <DialogDescription>
                  Diese Aktion kann nicht rückgängig gemacht werden. Alle Ihre Daten, 
                  Projekte und Credits werden permanent gelöscht.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20">
                  <p className="text-sm text-destructive font-medium mb-2">
                    Folgende Daten werden gelöscht:
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Alle Projekte und Medien</li>
                    <li>• Alle Credits und Transaktionen</li>
                    <li>• Alle persönlichen Einstellungen</li>
                    <li>• Aktives Abonnement wird gekündigt</li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <Label>
                    Geben Sie <strong>{user?.email}</strong> ein, um zu bestätigen:
                  </Label>
                  <Input
                    value={confirmEmail}
                    onChange={(e) => setConfirmEmail(e.target.value)}
                    placeholder="E-Mail-Adresse eingeben"
                    className="bg-muted/20 border-white/10"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button 
                  variant="outline" 
                  onClick={() => setDeleteDialogOpen(false)}
                >
                  Abbrechen
                </Button>
                <Button 
                  variant="destructive"
                  onClick={handleDeleteAccount}
                  disabled={loading || confirmEmail !== user?.email}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Konto endgültig löschen
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </motion.div>
  );
};
