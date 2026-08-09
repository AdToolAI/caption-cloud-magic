import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, AlertCircle, ExternalLink, Loader2 } from "lucide-react";
import { tx } from "@/lib/i18nText";

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
        title: tx({ de: "Fehler", en: "Error", es: "Error" }),
        description: tx({ de: "Bitte gib einen Token ein", en: "Please enter a token", es: "Por favor, introduce un token" }),
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
          title: tx({ de: "✅ Token gültig!", en: "✅ Token valid!", es: "✅ ¡Token válido!" }),
          description: tx({
            de: `Instagram Account: @${data.username} (${data.length} Zeichen)`,
            en: `Instagram account: @${data.username} (${data.length} characters)`,
            es: `Cuenta de Instagram: @${data.username} (${data.length} caracteres)`,
          })
        });
      }
    } catch (error: any) {
      const errorData = error.message ? JSON.parse(error.message) : error;
      setValidationResult({ valid: false, error: errorData.error || 'Validation failed' });
      toast({
        title: tx({ de: "Token ungültig", en: "Invalid token", es: "Token no válido" }),
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
        title: tx({ de: "Fehler", en: "Error", es: "Error" }),
        description: tx({ de: "Bitte teste den Token zuerst", en: "Please test the token first", es: "Por favor, prueba el token primero" }),
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
        title: tx({ de: "Erfolg!", en: "Success!", es: "¡Éxito!" }),
        description: tx({ de: "Instagram Token wurde erfolgreich aktualisiert", en: "Instagram token was updated successfully", es: "El token de Instagram se actualizó correctamente" })
      });

      onSuccess();
      onOpenChange(false);
      setToken("");
      setValidationResult(null);
    } catch (error: any) {
      toast({
        title: tx({ de: "Fehler beim Speichern", en: "Error saving", es: "Error al guardar" }),
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
          <DialogTitle>{tx({ de: "Instagram Access Token erneuern", en: "Renew Instagram access token", es: "Renovar el token de acceso de Instagram" })}</DialogTitle>
          <DialogDescription>
            {tx({ de: "Generiere einen neuen Long-Lived Access Token für dein Instagram Business Account", en: "Generate a new long-lived access token for your Instagram business account", es: "Genera un nuevo token de acceso de larga duración para tu cuenta comercial de Instagram" })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step-by-step instructions */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2 text-sm">
                <p className="font-semibold">{tx({ de: "Schritt-für-Schritt Anleitung:", en: "Step-by-step guide:", es: "Guía paso a paso:" })}</p>
                <ol className="list-decimal list-inside space-y-1 ml-2">
                  <li>{tx({ de: "Gehe zum", en: "Go to the", es: "Ve al" })} <a href="https://developers.facebook.com/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                    Facebook Developer Portal <ExternalLink className="h-3 w-3" />
                  </a></li>
                  <li>{tx({ de: "Wähle deine App aus", en: "Select your app", es: "Selecciona tu app" })}</li>
                  <li>{tx({ de: "Gehe zu", en: "Go to", es: "Ve a" })} <strong>Tools → Graph API Explorer</strong></li>
                  <li>{tx({ de: "Wähle deine", en: "Select your", es: "Selecciona tu" })} <strong>Facebook Page</strong> {tx({ de: "aus (die mit Instagram verbunden ist)", en: "(the one connected to Instagram)", es: "(la que está conectada a Instagram)" })}</li>
                  <li>{tx({ de: "Füge diese Permissions hinzu:", en: "Add these permissions:", es: "Añade estos permisos:" })}
                    <ul className="list-disc list-inside ml-4 mt-1">
                      <li><code className="text-xs bg-muted px-1 rounded">instagram_basic</code></li>
                      <li><code className="text-xs bg-muted px-1 rounded">instagram_manage_comments</code></li>
                      <li><code className="text-xs bg-muted px-1 rounded">pages_read_engagement</code></li>
                      <li><code className="text-xs bg-muted px-1 rounded">pages_show_list</code></li>
                    </ul>
                  </li>
                  <li>{tx({ de: "Klicke auf", en: "Click on", es: "Haz clic en" })} <strong>Generate Access Token</strong></li>
                  <li>{tx({ de: "Konvertiere in einen", en: "Convert it into a", es: "Conviértelo en un" })} <strong>Long-Lived Token</strong> {tx({ de: "(60 Tage):", en: "(60 days):", es: "(60 días):" })}<br/>
                    <code className="text-xs bg-muted px-2 py-1 rounded block mt-1 break-all">
                      https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=YOUR_APP_ID&client_secret=YOUR_APP_SECRET&fb_exchange_token=SHORT_TOKEN
                    </code>
                  </li>
                  <li>{tx({ de: "Kopiere den Long-Lived Token und füge ihn unten ein", en: "Copy the long-lived token and paste it below", es: "Copia el token de larga duración y pégalo abajo" })}</li>
                </ol>
              </div>
            </AlertDescription>
          </Alert>

          {/* Token input */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{tx({ de: "Instagram Access Token", en: "Instagram access token", es: "Token de acceso de Instagram" })}</label>
            <Textarea
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={tx({ de: "Füge deinen Instagram Access Token hier ein...", en: "Paste your Instagram access token here...", es: "Pega aquí tu token de acceso de Instagram..." })}
              rows={4}
              className="font-mono text-xs"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {token.length > 0 && `${token.length} ${tx({ de: "Zeichen", en: "characters", es: "caracteres" })} ${token.length >= 250 ? '✓' : `(${tx({ de: "min. 250 benötigt", en: "min. 250 required", es: "mín. 250 requeridos" })})`}`}
              </span>
              {token.length > 0 && token.length < 250 && (
                <Badge variant="destructive" className="text-xs">{tx({ de: "Zu kurz", en: "Too short", es: "Demasiado corto" })}</Badge>
              )}
              {token.length >= 250 && (
                <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">{tx({ de: "Länge OK", en: "Length OK", es: "Longitud OK" })}</Badge>
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
                    <p className="font-semibold">{tx({ de: "Token ist gültig! ✓", en: "Token is valid! ✓", es: "¡Token válido! ✓" })}</p>
                    <p className="text-sm">{tx({ de: "Account:", en: "Account:", es: "Cuenta:" })} <strong>@{validationResult.username}</strong></p>
                    <p className="text-xs text-muted-foreground">{tx({ de: "Account ID:", en: "Account ID:", es: "ID de cuenta:" })} {validationResult.accountId}</p>
                  </div>
                ) : (
                  <div>
                    <p className="font-semibold">{tx({ de: "Token ungültig", en: "Invalid token", es: "Token no válido" })}</p>
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
              {tx({ de: "Abbrechen", en: "Cancel", es: "Cancelar" })}
            </Button>
            <Button
              variant="secondary"
              onClick={handleTest}
              disabled={loading || token.length < 250}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tx({ de: "Token testen", en: "Test token", es: "Probar token" })}
            </Button>
            <Button
              onClick={handleSave}
              disabled={loading || !validationResult?.valid}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tx({ de: "Token speichern", en: "Save token", es: "Guardar token" })}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};