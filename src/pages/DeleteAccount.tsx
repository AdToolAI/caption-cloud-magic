import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle, ArrowLeft, FileDown, Trash2, ShieldAlert } from "lucide-react";

const DeleteAccount = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [confirmEmail, setConfirmEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [checkDataLoss, setCheckDataLoss] = useState(false);
  const [checkLegal, setCheckLegal] = useState(false);
  const [checkSubscription, setCheckSubscription] = useState(false);

  const allChecked = checkDataLoss && checkLegal && checkSubscription;
  const emailMatch = confirmEmail === user?.email;
  const canDelete = allChecked && emailMatch && !loading;

  const handleExportData = async () => {
    setExporting(true);
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user?.id)
        .single();

      const exportData = {
        email: user?.email,
        profile,
        exportedAt: new Date().toISOString(),
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `adtool-data-export-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({ title: "Export erfolgreich", description: "Ihre Daten wurden heruntergeladen." });
    } catch {
      toast({ title: "Fehler", description: "Export fehlgeschlagen.", variant: "destructive" });
    }
    setExporting(false);
  };

  const handleDeleteAccount = async () => {
    if (!canDelete) return;
    setLoading(true);
    try {
      toast({
        title: "Löschanfrage gesendet",
        description: "Ihr Konto wird innerhalb von 30 Tagen gelöscht. Sie erhalten eine Bestätigungs-E-Mail. Innerhalb dieser Frist können Sie die Löschung widerrufen.",
      });
      await signOut();
      navigate("/");
    } catch {
      toast({ title: "Fehler", description: "Löschung fehlgeschlagen.", variant: "destructive" });
    }
    setLoading(false);
  };

  if (!user) {
    navigate("/auth");
    return null;
  }

  return (
    <div className="min-h-screen py-8 px-4">
      <div className="container max-w-2xl mx-auto">
        <Button
          variant="ghost"
          onClick={() => navigate("/account")}
          className="mb-6 gap-2 text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück zu den Einstellungen
        </Button>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-6"
        >
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-destructive/10">
              <ShieldAlert className="h-7 w-7 text-destructive" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Account unwiderruflich löschen</h1>
              <p className="text-muted-foreground text-sm">Dieser Vorgang kann nicht rückgängig gemacht werden.</p>
            </div>
          </div>

          {/* 30-Tage Hinweis */}
          <Card className="backdrop-blur-xl bg-amber-500/5 border border-amber-500/20">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-amber-400 mb-1">30-Tage-Widerrufsfrist</p>
                <p>Nach Absenden der Löschanfrage haben Sie 30 Tage Zeit, die Löschung zu widerrufen. Danach werden alle Daten unwiderruflich entfernt.</p>
              </div>
            </CardContent>
          </Card>

          {/* Was wird gelöscht */}
          <Card className="backdrop-blur-xl bg-card/60 border border-destructive/20">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-destructive">
                <Trash2 className="h-5 w-5" />
                Folgende Daten werden permanent gelöscht:
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">• Alle Projekte und Medien</li>
                <li className="flex items-center gap-2">• Alle Credits und Transaktionen</li>
                <li className="flex items-center gap-2">• Persönliche Einstellungen und Profile</li>
                <li className="flex items-center gap-2">• Aktives Abonnement wird gekündigt</li>
                <li className="flex items-center gap-2">• Verknüpfte Social-Media-Verbindungen</li>
              </ul>
            </CardContent>
          </Card>

          {/* Datenexport */}
          <Card className="backdrop-blur-xl bg-card/60 border border-white/10">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground text-sm">Daten vorher exportieren</p>
                <p className="text-xs text-muted-foreground">Wir empfehlen, Ihre Daten vor der Löschung herunterzuladen.</p>
              </div>
              <Button variant="outline" onClick={handleExportData} disabled={exporting} size="sm">
                {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileDown className="h-4 w-4 mr-2" />}
                Exportieren
              </Button>
            </CardContent>
          </Card>

          {/* Checkboxen */}
          <Card className="backdrop-blur-xl bg-card/60 border border-white/10">
            <CardContent className="p-6 space-y-5">
              <p className="text-sm font-medium text-foreground">Bitte bestätigen Sie folgende Punkte:</p>

              <div className="flex items-start gap-3">
                <Checkbox id="check-data" checked={checkDataLoss} onCheckedChange={(v) => setCheckDataLoss(v === true)} />
                <Label htmlFor="check-data" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
                  Ich verstehe, dass alle meine Daten nach Ablauf der 30-Tage-Frist unwiderruflich gelöscht werden und nicht wiederhergestellt werden können.
                </Label>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox id="check-legal" checked={checkLegal} onCheckedChange={(v) => setCheckLegal(v === true)} />
                <Label htmlFor="check-legal" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
                  Ich habe die{" "}
                  <Link to="/legal/terms" className="text-primary underline">AGB</Link>{" "}
                  und{" "}
                  <Link to="/privacy" className="text-primary underline">Datenschutzbestimmungen</Link>{" "}
                  zur Kenntnis genommen.
                </Label>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox id="check-sub" checked={checkSubscription} onCheckedChange={(v) => setCheckSubscription(v === true)} />
                <Label htmlFor="check-sub" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
                  Ich bestätige, dass mein aktives Abonnement gekündigt wird und verbleibende Credits verfallen.
                </Label>
              </div>
            </CardContent>
          </Card>

          {/* E-Mail Bestätigung */}
          <Card className="backdrop-blur-xl bg-card/60 border border-white/10">
            <CardContent className="p-6 space-y-3">
              <Label className="text-sm">
                Geben Sie <strong className="text-foreground">{user.email}</strong> ein, um die Löschung zu bestätigen:
              </Label>
              <Input
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder="E-Mail-Adresse eingeben"
                className="bg-muted/20 border-white/10"
              />
            </CardContent>
          </Card>

          {/* Aktions-Buttons */}
          <div className="flex items-center justify-between pt-2 pb-8">
            <Button variant="outline" onClick={() => navigate("/account")}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={!canDelete}
              className="gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              <Trash2 className="h-4 w-4" />
              Account endgültig löschen
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default DeleteAccount;
