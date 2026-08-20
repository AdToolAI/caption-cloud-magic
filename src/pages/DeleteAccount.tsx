import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/useAuth";
import { useFounderStatus } from "@/hooks/useFounderStatus";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, AlertTriangle, ArrowLeft, FileDown, Trash2, ShieldAlert, Crown } from "lucide-react";
import { tx } from "@/lib/i18nText";

const DeleteAccount = () => {
  const { user, signOut } = useAuth();
  const founder = useFounderStatus();
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

      toast({ title: tx({ de: "Export erfolgreich", en: "Export successful", es: "Exportación exitosa" }), description: tx({ de: "Ihre Daten wurden heruntergeladen.", en: "Your data has been downloaded.", es: "Tus datos han sido descargados." }) });
    } catch {
      toast({ title: tx({ de: "Fehler", en: "Error", es: "Error" }), description: tx({ de: "Export fehlgeschlagen.", en: "Export failed.", es: "Error en la exportación." }), variant: "destructive" });
    }
    setExporting(false);
  };

  const handleDeleteAccount = async () => {
    if (!canDelete) return;
    setLoading(true);
    try {
      toast({
        title: tx({ de: "Löschanfrage gesendet", en: "Deletion request sent", es: "Solicitud de eliminación enviada" }),
        description: tx({ de: "Ihr Konto wird innerhalb von 30 Tagen gelöscht. Sie erhalten eine Bestätigungs-E-Mail. Innerhalb dieser Frist können Sie die Löschung widerrufen.", en: "Your account will be deleted within 30 days. You will receive a confirmation email. You can revoke the deletion within this period.", es: "Tu cuenta se eliminará en un plazo de 30 días. Recibirás un correo de confirmación. Puedes revocar la eliminación dentro de ese plazo." }),
      });
      await signOut();
      navigate("/");
    } catch {
      toast({ title: tx({ de: "Fehler", en: "Error", es: "Error" }), description: tx({ de: "Löschung fehlgeschlagen.", en: "Deletion failed.", es: "Error en la eliminación." }), variant: "destructive" });
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
          {tx({ de: "Zurück zu den Einstellungen", en: "Back to settings", es: "Volver a los ajustes" })}
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
              <h1 className="text-2xl font-bold text-foreground">{tx({ de: "Account unwiderruflich löschen", en: "Permanently delete account", es: "Eliminar cuenta de forma permanente" })}</h1>
              <p className="text-muted-foreground text-sm">{tx({ de: "Dieser Vorgang kann nicht rückgängig gemacht werden.", en: "This action cannot be undone.", es: "Esta acción no se puede deshacer." })}</p>
            </div>
          </div>

          {/* 30-Tage Hinweis */}
          <Card className="backdrop-blur-xl bg-amber-500/5 border border-amber-500/20">
            <CardContent className="p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-amber-400 mb-1">{tx({ de: "30-Tage-Widerrufsfrist", en: "30-day revocation period", es: "Período de revocación de 30 días" })}</p>
                <p>{tx({ de: "Nach Absenden der Löschanfrage haben Sie 30 Tage Zeit, die Löschung zu widerrufen. Danach werden alle Daten unwiderruflich entfernt.", en: "After submitting the deletion request you have 30 days to revoke it. After that, all data is removed irreversibly.", es: "Tras enviar la solicitud de eliminación dispones de 30 días para revocarla. Después, todos los datos se eliminan de forma irreversible." })}</p>
              </div>
            </CardContent>
          </Card>

          {/* Founder-Status Warnung */}
          {founder.isActive && (
            <Card className="backdrop-blur-xl bg-primary/5 border border-primary/30">
              <CardContent className="p-4 flex items-start gap-3">
                <Crown className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium text-primary mb-1">{tx({ de: "Sie verlieren Ihren Gründer-Status", en: "You lose your founder status", es: "Pierdes tu estatus de fundador" })}</p>
                  <p>{tx({ de: "Mit der Löschung endet Ihr 24-Monats-Founders-Vorteil (20 % Rabatt auf alle KI-Credits). Ihr Slot wird für einen neuen Nutzer freigegeben und kann nicht wiederhergestellt werden.", en: "Deleting your account ends your 24-month founders benefit (20% off all AI credits). Your slot is released to a new user and cannot be restored.", es: "Al eliminar la cuenta finaliza tu ventaja de fundador de 24 meses (20 % de descuento en todos los créditos de IA). Tu plaza se libera para otro usuario y no se puede recuperar." })}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Was wird gelöscht */}
          <Card className="backdrop-blur-xl bg-card/60 border border-destructive/20">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-destructive">
                <Trash2 className="h-5 w-5" />
                {tx({ de: "Folgende Daten werden permanent gelöscht:", en: "The following data will be permanently deleted:", es: "Se eliminarán permanentemente los siguientes datos:" })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">• {tx({ de: "Alle Projekte und Medien", en: "All projects and media", es: "Todos los proyectos y medios" })}</li>
                <li className="flex items-center gap-2">• {tx({ de: "Alle Credits und Transaktionen", en: "All credits and transactions", es: "Todos los créditos y transacciones" })}</li>
                <li className="flex items-center gap-2">• {tx({ de: "Persönliche Einstellungen und Profile", en: "Personal settings and profiles", es: "Ajustes personales y perfiles" })}</li>
                <li className="flex items-center gap-2">• {tx({ de: "Aktives Abonnement wird gekündigt", en: "Active subscription will be canceled", es: "Se cancelará la suscripción activa" })}</li>
                <li className="flex items-center gap-2">• {tx({ de: "Verknüpfte Social-Media-Verbindungen", en: "Linked social media connections", es: "Conexiones de redes sociales vinculadas" })}</li>
              </ul>
            </CardContent>
          </Card>

          {/* Datenexport */}
          <Card className="backdrop-blur-xl bg-card/60 border border-white/10">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground text-sm">{tx({ de: "Daten vorher exportieren", en: "Export data first", es: "Exportar datos antes" })}</p>
                <p className="text-xs text-muted-foreground">{tx({ de: "Wir empfehlen, Ihre Daten vor der Löschung herunterzuladen.", en: "We recommend downloading your data before deletion.", es: "Recomendamos descargar tus datos antes de la eliminación." })}</p>
              </div>
              <Button variant="outline" onClick={handleExportData} disabled={exporting} size="sm">
                {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileDown className="h-4 w-4 mr-2" />}
                {tx({ de: "Exportieren", en: "Export", es: "Exportar" })}
              </Button>
            </CardContent>
          </Card>

          {/* Checkboxen */}
          <Card className="backdrop-blur-xl bg-card/60 border border-white/10">
            <CardContent className="p-6 space-y-5">
              <p className="text-sm font-medium text-foreground">{tx({ de: "Bitte bestätigen Sie folgende Punkte:", en: "Please confirm the following points:", es: "Confirma los siguientes puntos:" })}</p>

              <div className="flex items-start gap-3">
                <Checkbox id="check-data" checked={checkDataLoss} onCheckedChange={(v) => setCheckDataLoss(v === true)} />
                <Label htmlFor="check-data" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
                  {tx({ de: "Ich verstehe, dass alle meine Daten nach Ablauf der 30-Tage-Frist unwiderruflich gelöscht werden und nicht wiederhergestellt werden können.", en: "I understand that all my data will be irreversibly deleted after the 30-day period and cannot be restored.", es: "Entiendo que todos mis datos se eliminarán de forma irreversible tras el plazo de 30 días y no se podrán recuperar." })}
                </Label>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox id="check-legal" checked={checkLegal} onCheckedChange={(v) => setCheckLegal(v === true)} />
                <Label htmlFor="check-legal" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
                  {tx({ de: "Ich habe die", en: "I have read the", es: "He leído los" })}{" "}
                  <Link to="/legal/terms" className="text-primary underline">AGB</Link>{" "}
                  {tx({ de: "und", en: "and", es: "y" })}{" "}
                  <Link to="/privacy" className="text-primary underline">Datenschutzbestimmungen</Link>{" "}
                  {tx({ de: "zur Kenntnis genommen.", en: "noticed.", es: "avisos." })}
                </Label>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox id="check-sub" checked={checkSubscription} onCheckedChange={(v) => setCheckSubscription(v === true)} />
                <Label htmlFor="check-sub" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
                  {tx({ de: "Ich bestätige, dass mein aktives Abonnement gekündigt wird und verbleibende Credits verfallen.", en: "I confirm that my active subscription will be canceled and remaining credits will expire.", es: "Confirmo que se cancelará mi suscripción activa y que los créditos restantes caducarán." })}
                </Label>
              </div>
            </CardContent>
          </Card>

          {/* E-Mail Bestätigung */}
          <Card className="backdrop-blur-xl bg-card/60 border border-white/10">
            <CardContent className="p-6 space-y-3">
              <Label className="text-sm">
                {tx({ de: "Geben Sie", en: "Enter", es: "Introduce" })} <strong className="text-foreground">{user.email}</strong> {tx({ de: "ein, um die Löschung zu bestätigen:", en: "to confirm deletion:", es: "para confirmar la eliminación:" })}
              </Label>
              <Input
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder={tx({ de: "E-Mail-Adresse eingeben", en: "Enter email address", es: "Introduce la dirección de correo electrónico" })}
                className="bg-muted/20 border-white/10"
              />
            </CardContent>
          </Card>

          {/* Aktions-Buttons */}
          <div className="flex items-center justify-between pt-2 pb-8">
            <Button variant="outline" onClick={() => navigate("/account")}>
              {tx({ de: "Abbrechen", en: "Cancel", es: "Cancelar" })}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={!canDelete}
              className="gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              <Trash2 className="h-4 w-4" />
              {tx({ de: "Account endgültig löschen", en: "Permanently delete account", es: "Eliminar cuenta definitivamente" })}
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default DeleteAccount;
