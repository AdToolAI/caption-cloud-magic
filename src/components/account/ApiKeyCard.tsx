import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
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
    // Generate a random API key
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
      toast.success("API-Schlüssel generiert");
    } catch (error: any) {
      toast.error(error.message || "Fehler beim Generieren");
    } finally {
      setGenerating(false);
      setShowRegenerateDialog(false);
    }
  };

  const handleCopy = async () => {
    if (!apiKey) return;
    
    try {
      await navigator.clipboard.writeText(apiKey);
      toast.success("API-Schlüssel kopiert");
    } catch (error) {
      toast.error("Fehler beim Kopieren");
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
            API-Schlüssel
          </CardTitle>
          <CardDescription>
            Für externe Integrationen und Automatisierungen
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
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowKey(!showKey)}
                  className="shrink-0"
                >
                  {showKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleCopy}
                  className="shrink-0"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>

              <Button
                variant="outline"
                onClick={() => setShowRegenerateDialog(true)}
                className="w-full border-white/10"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Schlüssel regenerieren
              </Button>

              <p className="text-xs text-muted-foreground">
                ⚠️ Beim Regenerieren wird der alte Schlüssel ungültig
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Noch kein API-Schlüssel generiert.
              </p>
              <Button
                onClick={handleGenerateKey}
                disabled={generating}
                className="w-full"
              >
                {generating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Wird generiert...
                  </>
                ) : (
                  <>
                    <Key className="mr-2 h-4 w-4" />
                    API-Schlüssel generieren
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
            <AlertDialogTitle>Schlüssel regenerieren?</AlertDialogTitle>
            <AlertDialogDescription>
              Der aktuelle API-Schlüssel wird ungültig. Alle Integrationen, die
              diesen Schlüssel verwenden, müssen aktualisiert werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleGenerateKey} disabled={generating}>
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Regenerieren"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
