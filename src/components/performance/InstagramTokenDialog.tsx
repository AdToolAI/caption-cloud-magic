import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, AlertCircle, ExternalLink, Loader2 } from "lucide-react";

interface InstagramTokenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const InstagramTokenDialog = ({ open, onOpenChange, onSuccess }: InstagramTokenDialogProps) => {
  const { toast } = useToast();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [validationResult, setValidationResult] = useState<any>(null);

  const handleTest = async () => {
    if (!token.trim()) {
      toast({
        title: "Fehler",
        description: "Bitte gib einen Token ein",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    setValidationResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('instagram-token-update', {
        body: { newToken: token.trim(), action: 'validate' }
      });

      if (error) throw error;

      setValidationResult(data);

      if (data.valid) {
        toast({
          title: "✅ Token gültig!",
          description: `Instagram Account: @${data.username} (${data.length} Zeichen)`
        });
      }
    } catch (error: any) {
      const errorData = error.message ? JSON.parse(error.message) : error;
      setValidationResult({ valid: false, error: errorData.error || 'Validation failed' });
      toast({
        title: "Token ungültig",
        description: errorData.error || error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!validationResult?.valid) {
      toast({
        title: "Fehler",
        description: "Bitte teste den Token zuerst",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('instagram-token-update', {
        body: { newToken: token.trim(), action: 'save' }
      });

      if (error) throw error;

      toast({
        title: "Erfolg!",
        description: "Instagram Token wurde erfolgreich aktualisiert"
      });

      onSuccess();
      onOpenChange(false);
      setToken("");
      setValidationResult(null);
    } catch (error: any) {
      toast({
        title: "Fehler beim Speichern",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Instagram Access Token erneuern</DialogTitle>
          <DialogDescription>
            Generiere einen neuen Long-Lived Access Token für dein Instagram Business Account
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step-by-step instructions */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2 text-sm">
                <p className="font-semibold">Schritt-für-Schritt Anleitung:</p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>Gehe zum <a href="https://developers.facebook.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                    Facebook Developer Portal <ExternalLink className="h-3 w-3" />
                  </a></li>
                  <li>Wähle deine App aus</li>
                  <li>Gehe zu <strong>Tools → Graph API Explorer</strong></li>
                  <li>Wähle deine <strong>Facebook Page</strong> aus (die mit Instagram verbunden ist)</li>
                  <li>Füge diese Permissions hinzu:
                    <ul className="list-disc list-inside ml-4 mt-1">
                      <li><code className="text-xs bg-muted px-1 rounded">instagram_basic</code></li>
                      <li><code className="text-xs bg-muted px-1 rounded">instagram_manage_comments</code></li>
                      <li><code className="text-xs bg-muted px-1 rounded">pages_read_engagement</code></li>
                      <li><code className="text-xs bg-muted px-1 rounded">pages_show_list</code></li>
                    </ul>
                  </li>
                  <li>Klicke auf <strong>Generate Access Token</strong></li>
                  <li>Konvertiere in einen <strong>Long-Lived Token</strong> (60 Tage):<br/>
                    <code className="text-xs bg-muted px-2 py-1 rounded block mt-1 break-all">
                      https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=YOUR_APP_ID&client_secret=YOUR_APP_SECRET&fb_exchange_token=SHORT_TOKEN
                    </code>
                  </li>
                  <li>Kopiere den Long-Lived Token und füge ihn unten ein</li>
                </ol>
              </div>
            </AlertDescription>
          </Alert>

          {/* Token input */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Instagram Access Token</label>
            <Textarea
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Füge deinen Instagram Access Token hier ein..."
              rows={4}
              className="font-mono text-xs"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {token.length > 0 && `${token.length} Zeichen ${token.length >= 250 ? '✓' : `(min. 250 benötigt)`}`}
              </span>
              {token.length > 0 && token.length < 250 && (
                <Badge variant="destructive" className="text-xs">Zu kurz</Badge>
              )}
              {token.length >= 250 && (
                <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">Länge OK</Badge>
              )}
            </div>
          </div>

          {/* Validation result */}
          {validationResult && (
            <Alert variant={validationResult.valid ? "default" : "destructive"}>
              {validationResult.valid ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <AlertDescription>
                {validationResult.valid ? (
                  <div className="space-y-1">
                    <p className="font-semibold">Token ist gültig! ✓</p>
                    <p className="text-sm">Account: <strong>@{validationResult.username}</strong></p>
                    <p className="text-xs text-muted-foreground">Account ID: {validationResult.accountId}</p>
                  </div>
                ) : (
                  <div>
                    <p className="font-semibold">Token ungültig</p>
                    <p className="text-sm">{validationResult.error}</p>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 justify-end pt-4">
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                setToken("");
                setValidationResult(null);
              }}
              disabled={loading}
            >
              Abbrechen
            </Button>
            <Button
              variant="secondary"
              onClick={handleTest}
              disabled={loading || token.length < 250}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Token testen
            </Button>
            <Button
              onClick={handleSave}
              disabled={loading || !validationResult?.valid}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Token speichern
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};