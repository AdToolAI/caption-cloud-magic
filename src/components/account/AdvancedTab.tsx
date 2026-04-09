import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { Loader2, Trash2, Download, FileDown, LogOut } from "lucide-react";

export const AdvancedTab = () => {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleExportData = async () => {
    setLoading(true);
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user?.id)
        .single();

      const exportData = {
        email: user?.email,
        profile,
        exportedAt: new Date().toISOString()
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `adtool-data-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({ title: t("accountAdvanced.exportSuccess"), description: t("accountAdvanced.exportSuccessDesc") });
    } catch {
      toast({ title: t("accountAdvanced.exportError"), description: t("accountAdvanced.exportErrorDesc"), variant: "destructive" });
    }
    setLoading(false);
  };

  const handleLogoutAllDevices = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut({ scope: 'global' });
      toast({
        title: t("accountAdvanced.loggedOut"),
        description: t("accountAdvanced.loggedOutDesc")
      });
      navigate("/auth");
    } catch (error) {
      toast({
        title: t("accountAdvanced.logoutError"),
        description: t("accountAdvanced.logoutErrorDesc"),
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
      <Card className="backdrop-blur-xl bg-card/60 border border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-cyan-400" />
            {t("accountAdvanced.exportTitle")}
          </CardTitle>
          <CardDescription>
            {t("accountAdvanced.exportDesc")}
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
            {t("accountAdvanced.exportButton")}
          </Button>
        </CardContent>
      </Card>

      <Card className="backdrop-blur-xl bg-card/60 border border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LogOut className="h-5 w-5 text-amber-400" />
            {t("accountAdvanced.logoutAllTitle")}
          </CardTitle>
          <CardDescription>
            {t("accountAdvanced.logoutAllDesc")}
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
            {t("accountAdvanced.logoutAllButton")}
          </Button>
        </CardContent>
      </Card>

      <Card className="backdrop-blur-xl bg-card/60 border border-destructive/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" />
            {t("accountAdvanced.deleteAccountTitle")}
          </CardTitle>
          <CardDescription>
            {t("accountAdvanced.deleteAccountDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            variant="outline" 
            className="h-12 border-destructive/20 text-destructive hover:bg-destructive/10"
            onClick={() => navigate("/account/delete")}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {t("accountAdvanced.deleteAccountButton")}
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
};
