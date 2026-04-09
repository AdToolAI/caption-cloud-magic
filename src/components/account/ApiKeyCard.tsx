import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useTranslation } from "@/hooks/useTranslation";
import { Key, Loader2, Copy, RefreshCw, Eye, EyeOff } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const ApiKeyCard = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);

  useEffect(() => {
    const loadApiKey = async () => {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("api_key")
          .eq("id", user.id)
          .single();
        if (error) throw error;
        setApiKey(data?.api_key || null);
      } catch (error) {
        console.error("Error loading API key:", error);
      } finally {
        setLoading(false);
      }
    };
    loadApiKey();
  }, [user]);

  const generateApiKey = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let key = "ak_";
    for (let i = 0; i < 32; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
  };

  const handleGenerateKey = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const newKey = generateApiKey();
      const { error } = await supabase
        .from("profiles")
        .update({ api_key: newKey })
        .eq("id", user.id);
      if (error) throw error;
      setApiKey(newKey);
      setShowKey(true);
      toast.success(t("accountApiKey.generated"));
    } catch (error: any) {
      toast.error(error.message || t("accountApiKey.generateError"));
    } finally {
      setGenerating(false);
      setShowRegenerateDialog(false);
    }
  };

  const handleCopy = async () => {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey);
      toast.success(t("accountApiKey.copied"));
    } catch (error) {
      toast.error(t("accountApiKey.copyError"));
    }
  };

  const getMaskedKey = (key: string) => {
    if (key.length <= 10) return key;
    return key.substring(0, 6) + "•".repeat(key.length - 10) + key.substring(key.length - 4);
  };

  if (loading) {
    return (
      <Card className="bg-card/60 backdrop-blur-xl border-white/10">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-card/60 backdrop-blur-xl border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            {t("accountApiKey.title")}
          </CardTitle>
          <CardDescription>
            {t("accountApiKey.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {apiKey ? (
            <>
              <div className="flex items-center gap-2">
                <Input
                  value={showKey ? apiKey : getMaskedKey(apiKey)}
                  readOnly
                  className="font-mono bg-muted/20 border-white/10"
                />
                <Button variant="ghost" size="icon" onClick={() => setShowKey(!showKey)} className="shrink-0">
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={handleCopy} className="shrink-0">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <Button variant="outline" onClick={() => setShowRegenerateDialog(true)} className="w-full border-white/10">
                <RefreshCw className="mr-2 h-4 w-4" />
                {t("accountApiKey.regenerateButton")}
              </Button>
              <p className="text-xs text-muted-foreground">
                {t("accountApiKey.regenerateWarning")}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {t("accountApiKey.noKeyYet")}
              </p>
              <Button onClick={handleGenerateKey} disabled={generating} className="w-full">
                {generating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("accountApiKey.generating")}
                  </>
                ) : (
                  <>
                    <Key className="mr-2 h-4 w-4" />
                    {t("accountApiKey.generateButton")}
                  </>
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showRegenerateDialog} onOpenChange={setShowRegenerateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("accountApiKey.regenerateTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("accountApiKey.regenerateDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("accountApiKey.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleGenerateKey} disabled={generating}>
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t("accountApiKey.regenerate")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
