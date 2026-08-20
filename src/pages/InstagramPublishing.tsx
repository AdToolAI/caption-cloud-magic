import { useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Copy, CheckCircle2, Instagram, AlertCircle, RefreshCw, Shield, Clock, XCircle, History } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { tx } from "@/lib/i18nText";
import { uiLocale } from '@/lib/uiLocale';

// Required Instagram API scopes
const requiredScopes = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_manage_metadata',
];

export default function InstagramPublishing() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  
  // Settings
  const [igUserId, setIgUserId] = useState("17841477402452109");
  const [testImageUrl, setTestImageUrl] = useState("https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg");
  const [defaultCaption, setDefaultCaption] = useState("Posted via AdTool AI 🚀");
  const [dryRun, setDryRun] = useState(false);
  
  // Results
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [tokenDiagnostics, setTokenDiagnostics] = useState<any>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  
  // Token renewal states
  const [renewModalOpen, setRenewModalOpen] = useState(false);
  const [shortUserToken, setShortUserToken] = useState("");
  const [renewLoading, setRenewLoading] = useState(false);
  const [renewResult, setRenewResult] = useState<any>(null);
  const [tokenTypeChoice, setTokenTypeChoice] = useState<"page" | "user">("page");
  
  // Token debug states
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugResult, setDebugResult] = useState<any>(null);
  
  // Token backup states
  const [backups, setBackups] = useState<any[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: tx({ de: 'Kopiert!', en: 'Copied!', es: '¡Copiado!' }),
      description: tx({ de: `${label} wurde in die Zwischenablage kopiert.`, en: `${label} has been copied to the clipboard.`, es: `${label} se ha copiado al portapapeles.` }),
    });
  };

  const testConnection = async () => {
    setTesting(true);
    setError(null);
    setTokenDiagnostics(null);
    
    try {
      if (!igUserId) {
        toast({
          title: tx({ de: "Fehler", en: "Error", es: "Error" }),
          description: tx({ de: "Bitte Instagram User ID eingeben.", en: "Please enter the Instagram User ID.", es: "Por favor, introduce el ID de usuario de Instagram." }),
          variant: "destructive",
        });
        return;
      }

      toast({
        title: tx({ de: "Einstellungen OK", en: "Settings OK", es: "Configuración correcta" }),
        description: tx({ de: "Instagram User ID ist konfiguriert. Bereit zum Testen.", en: "Instagram User ID is configured. Ready to test.", es: "El ID de usuario de Instagram está configurado. Listo para probar." }),
      });
    } catch (err: any) {
      setError(err.message || tx({ de: "Validierung fehlgeschlagen", en: "Validation failed", es: "Error de validación" }));
    } finally {
      setTesting(false);
    }
  };

  const diagnoseToken = async () => {
    setDiagnosticsLoading(true);
    setError(null);
    setTokenDiagnostics(null);

    try {
      // Call edge function to validate token (mit Cache-Bust)
      const { data, error: functionError } = await supabase.functions.invoke('instagram-token-test', {
        body: { igUserId },
      });

      if (functionError) {
        throw functionError;
      }

      setTokenDiagnostics(data);
      
      if (data.ok) {
        toast({
          title: tx({ de: "✅ Token gültig", en: "✅ Token valid", es: "✅ Token válido" }),
          description: `${tx({ de: "Instagram Account", en: "Instagram account", es: "Cuenta de Instagram" })}: @${data.user?.username || 'unknown'}`,
        });
      } else {
        toast({
          title: tx({ de: "❌ Token ungültig", en: "❌ Token invalid", es: "❌ Token inválido" }),
          description: data.error || tx({ de: "Token-Validierung fehlgeschlagen", en: "Token validation failed", es: "Error al validar el token" }),
          variant: "destructive",
        });
      }
    } catch (err: any) {
      console.error('Token diagnostics error:', err);
      const errorMessage = err.message || tx({ de: 'Token-Diagnose fehlgeschlagen', en: 'Token diagnostics failed', es: 'Error en el diagnóstico del token' });
      setError(errorMessage);
      toast({
        title: tx({ de: "Diagnose-Fehler", en: "Diagnostics error", es: "Error de diagnóstico" }),
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setDiagnosticsLoading(false);
    }
  };

  const loadBackups = async () => {
    setBackupsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('instagram-token-backups', {
        method: 'GET'
      });

      if (error) throw error;

      if (data?.ok) {
        setBackups(data.items || []);
      }
    } catch (err: any) {
      console.error('Load backups error:', err);
    } finally {
      setBackupsLoading(false);
    }
  };

  const checkScopesAndExpiry = async () => {
    setDebugLoading(true);
    setError(null);
    setDebugResult(null);

    try {
      const { data, error: functionError } = await supabase.functions.invoke('instagram-token-debug');

      if (functionError) {
        throw functionError;
      }

      setDebugResult(data);
      
      if (data.ok) {
        const warnings = data.recommendations?.length > 0;
        toast({
          title: warnings ? tx({ de: "⚠️ Token hat Warnungen", en: "⚠️ Token has warnings", es: "⚠️ El token tiene advertencias" }) : tx({ de: "✅ Token Status OK", en: "✅ Token status OK", es: "✅ Estado del token correcto" }),
          description: warnings 
            ? data.recommendations.join(' • ') 
            : tx({ de: "Alle Scopes vorhanden, Token ist gültig", en: "All scopes present, token is valid", es: "Todos los permisos están presentes, el token es válido" }),
          variant: warnings ? "default" : "default",
        });
        
        // Also load backups
        await loadBackups();
      } else {
        toast({
          title: tx({ de: "❌ Scope-Check fehlgeschlagen", en: "❌ Scope check failed", es: "❌ Error al comprobar los permisos" }),
          description: data.error || tx({ de: "Konnte Token nicht überprüfen", en: "Could not verify token", es: "No se pudo verificar el token" }),
          variant: "destructive",
        });
      }
    } catch (err: any) {
      console.error('Token debug error:', err);
      const errorMessage = err.message || tx({ de: 'Scope-Check fehlgeschlagen', en: 'Scope check failed', es: 'Error al comprobar los permisos' });
      setError(errorMessage);
      toast({
        title: tx({ de: "Debug-Fehler", en: "Debug error", es: "Error de depuración" }),
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setDebugLoading(false);
    }
  };

  const handleRestoreBackup = async (backupId: number) => {
    if (!confirm(tx({ de: 'Möchtest du diesen Token wirklich wiederherstellen?', en: 'Do you really want to restore this token?', es: '¿Realmente quieres restaurar este token?' }))) {
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('instagram-token-backups', {
        body: { action: 'restore', id: backupId }
      });

      if (error) throw error;

      if (data?.ok) {
        toast({
          title: tx({ de: "✅ Wiederhergestellt", en: "✅ Restored", es: "✅ Restaurado" }),
          description: tx({ de: "Token wurde erfolgreich wiederhergestellt", en: "Token was successfully restored", es: "El token se restauró correctamente" }),
        });
        await checkScopesAndExpiry();
      } else {
        throw new Error(data?.error || tx({ de: tx({ de: "Wiederherstellung fehlgeschlagen", en: "Restore failed", es: "Error al restaurar" }), en: 'Restore failed', es: 'Error al restaurar' }));
      }
    } catch (err: any) {
      console.error('Restore error:', err);
      toast({
        title: tx({ de: "❌ Fehler", en: "❌ Error", es: "❌ Error" }),
        description: err.message || tx({ de: 'Wiederherstellung fehlgeschlagen', en: 'Restore failed', es: 'Error al restaurar' }),
        variant: "destructive",
      });
    }
  };

  const renewToken = async () => {
    if (!shortUserToken.trim()) {
      toast({
        title: tx({ de: "Fehler", en: "Error", es: "Error" }),
        description: tx({ de: "Bitte gib einen Access Token ein", en: "Please enter an access token", es: "Por favor, introduce un token de acceso" }),
        variant: "destructive"
      });
      return;
    }

    setRenewLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('instagram-token-renew', {
        body: { 
          shortUserToken: shortUserToken.trim(),
          tokenType: tokenTypeChoice 
        }
      });

      if (error) throw error;

      if (data?.ok && data?.saved) {
        setRenewResult(data);
        const backupMsg = data.backup_created ? tx({ de: tx({ de: " Backup erstellt.", en: "Backup created.", es: "Copia de seguridad creada." }), en: " Backup created.", es: " Copia de seguridad creada." }) : "";
        toast({
          title: tx({ de: "Erfolg!", en: "Success!", es: "¡Éxito!" }),
          description: tx({ de: `${"Token erfolgreich erneuert und gespeichert!"}${backupMsg}`, en: `${"Token successfully renewed and saved!"}${backupMsg}`, es: `${"¡Token renovado y guardado correctamente!"}${backupMsg}` }),
        });
        
        // Automatically refresh diagnostics after successful save
        setTimeout(() => {
          checkScopesAndExpiry();
        }, 500);
        
        // Close modal after short delay
        setTimeout(() => {
          setRenewModalOpen(false);
          setShortUserToken('');
        }, 2000);
      } else {
        throw new Error(data?.error || tx({ de: tx({ de: "Token-Erneuerung fehlgeschlagen", en: "Token renewal failed", es: "Error al renovar el token" }), en: 'Token renewal failed', es: 'Error al renovar el token' }));
      }
    } catch (err: any) {
      console.error('Token renewal error:', err);
      
      // Map common error codes
      let errorMessage = err.message || tx({ de: 'Fehler bei Token-Erneuerung', en: 'Error renewing token', es: 'Error al renovar el token' });
      if (err.message?.includes('190')) {
        errorMessage = tx({ de: 'Token ungültig/abgelaufen – bitte neu generieren', en: 'Token invalid/expired – please regenerate', es: 'Token inválido o caducado; genera uno nuevo' });
      } else if (err.message?.includes('100') || err.message?.includes('10')) {
        errorMessage = tx({ de: 'Berechtigungen fehlen – beim Generieren alle Häkchen setzen + richtige Seite auswählen', en: 'Missing permissions – check all boxes when generating and select the correct page', es: 'Faltan permisos: marca todas las casillas al generar y selecciona la página correcta' });
      } else if (err.message?.includes('Invalid platform')) {
        errorMessage = tx({ de: 'App/Website-Domain/Business-Modus in Meta Developer Console prüfen', en: 'Check app/website domain/business mode in Meta Developer Console', es: 'Comprueba el dominio de la app/sitio web y el modo empresarial en Meta Developer Console' });
      }
      
      toast({
        title: tx({ de: "Fehler", en: "Error", es: "Error" }),
        description: errorMessage,
        variant: "destructive"
      });
      setRenewResult(null);
    } finally {
      setRenewLoading(false);
    }
  };

  const handleTestPost = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const { data, error: functionError } = await supabase.functions.invoke('instagram-publish', {
        body: {
          imageUrl: testImageUrl,
          caption: defaultCaption,
          dryRun,
          igUserId,
        },
      });

      if (functionError) {
        throw functionError;
      }

      if (!data.ok) {
        throw new Error(data.error || tx({ de: 'Unbekannter Fehler', en: 'Unknown error', es: 'Error desconocido' }));
      }

      setResult(data);
      
      if (dryRun) {
        toast({
          title: tx({ de: "Dry-Run erfolgreich", en: "Dry run successful", es: "Prueba en seco exitosa" }),
          description: tx({ de: "Container wurde erstellt, aber nicht veröffentlicht.", en: "Container was created but not published.", es: "El contenedor se creó pero no se publicó." }),
        });
      } else {
        toast({
          title: tx({ de: "Erfolgreich veröffentlicht! 🎉", en: "Successfully published! 🎉", es: "¡Publicado con éxito! 🎉" }),
          description: tx({ de: "Dein Post wurde auf Instagram veröffentlicht.", en: "Your post was published on Instagram.", es: "Tu publicación se publicó en Instagram." }),
        });
      }
    } catch (err: any) {
      console.error('Instagram publish error:', err);
      const errorMessage = err.message || tx({ de: 'Fehler beim Veröffentlichen', en: 'Error while publishing', es: 'Error al publicar' });
      setError(errorMessage);
      toast({
        title: tx({ de: "Fehler", en: "Error", es: "Error" }),
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <Instagram className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold">Instagram Publishing</h1>
        </div>

        <div className="space-y-6">
          {/* Settings Card */}
          <Card>
            <CardHeader>
              <CardTitle>{tx({ de: "Einstellungen", en: "Settings", es: "Ajustes" })}</CardTitle>
              <CardDescription>
                {tx({ de: "Konfiguriere deine Instagram API-Einstellungen", en: "Configure your Instagram API settings", es: "Configura los ajustes de la API de Instagram" })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="igUserId">Instagram User ID</Label>
                <Input
                  id="igUserId"
                  value={igUserId}
                  onChange={(e) => setIgUserId(e.target.value)}
                  placeholder="17841477402452109"
                />
                <p className="text-sm text-muted-foreground">
                  {tx({ de: "Deine Instagram Business Account ID", en: "Your Instagram Business Account ID", es: "El ID de tu cuenta profesional de Instagram" })}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="testImage">{tx({ de: "Test-Bild URL", en: "Test image URL", es: "URL de imagen de prueba" })}</Label>
                <Input
                  id="testImage"
                  value={testImageUrl}
                  onChange={(e) => setTestImageUrl(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                />
                <p className="text-sm text-muted-foreground">
                  {tx({ de: "Öffentlich zugängliche Bild-URL für Test-Posts", en: "Publicly accessible image URL for test posts", es: "URL de imagen accesible públicamente para publicaciones de prueba" })}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="caption">{tx({ de: "Standard-Caption", en: "Default caption", es: "Descripción predeterminada" })}</Label>
                <Textarea
                  id="caption"
                  value={defaultCaption}
                  onChange={(e) => setDefaultCaption(e.target.value)}
                  placeholder="Posted via AdTool AI 🚀"
                  rows={3}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="dryRun">{tx({ de: "Dry-Run Modus", en: "Dry run mode", es: "Modo de prueba en seco" })}</Label>
                  <p className="text-sm text-muted-foreground">
                    {tx({ de: "Nur Container anlegen, nicht veröffentlichen", en: "Only create the container, do not publish", es: "Solo crear el contenedor, sin publicar" })}
                  </p>
                </div>
                <Switch
                  id="dryRun"
                  checked={dryRun}
                  onCheckedChange={setDryRun}
                />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <Button 
                    onClick={diagnoseToken} 
                    variant="outline"
                    disabled={diagnosticsLoading || !igUserId}
                  >
                    {diagnosticsLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {tx({ de: "Token diagnostizieren", en: "Diagnose token", es: "Diagnosticar token" })}
                  </Button>
                  
                  <Button 
                    onClick={checkScopesAndExpiry}
                    variant="outline"
                    disabled={debugLoading}
                  >
                    {debugLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Shield className="mr-2 h-4 w-4" />
                    {tx({ de: "Scopes & Ablauf prüfen", en: "Check scopes & expiry", es: "Comprobar permisos y caducidad" })}
                  </Button>

                  <Button 
                    onClick={() => setRenewModalOpen(true)}
                    variant="outline"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {tx({ de: "Token erneuern", en: "Renew token", es: "Renovar token" })}
                  </Button>
                </div>
                
                <Button 
                  onClick={handleTestPost}
                  disabled={loading || !igUserId || !testImageUrl}
                  className="w-full"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {tx({ de: "Test-Post jetzt veröffentlichen", en: "Publish test post now", es: "Publicar publicación de prueba ahora" })}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Token Diagnostics */}
          {tokenDiagnostics && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {tokenDiagnostics.ok ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-destructive" />
                  )}
                  {tx({ de: "Token-Diagnose", en: "Token diagnostics", es: "Diagnóstico de token" })}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {tokenDiagnostics.ok ? (
                  <>
                    <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                      <p className="text-sm font-medium text-green-900 dark:text-green-100">
                        {tx({ de: "✅ Token ist gültig und korrekt verknüpft", en: "✅ Token is valid and correctly linked", es: "✅ El token es válido y está correctamente vinculado" })}
                      </p>
                    </div>
                    {tokenDiagnostics.user?.username && (
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div>
                          <p className="text-sm font-medium">{tx({ de: "Instagram Username", en: "Instagram username", es: "Nombre de usuario de Instagram" })}</p>
                          <p className="text-sm text-muted-foreground">
                            @{tokenDiagnostics.user.username}
                          </p>
                        </div>
                      </div>
                    )}
                    {tokenDiagnostics.user?.id && (
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div>
                          <p className="text-sm font-medium">{tx({ de: "Instagram User ID", en: "Instagram user ID", es: "ID de usuario de Instagram" })}</p>
                          <p className="text-sm text-muted-foreground font-mono">
                            {tokenDiagnostics.user.id}
                          </p>
                        </div>
                      </div>
                    )}
                    {tokenDiagnostics.link && (
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-sm font-medium mb-1">{tx({ de: "Verknüpfung", en: "Link", es: "Vinculación" })}</p>
                        <p className="text-xs text-muted-foreground">
                          Page: {tokenDiagnostics.link.page_id}
                        </p>
                        {tokenDiagnostics.link.instagram_business_account_id && (
                          <p className="text-xs text-muted-foreground">
                            IG Business Account: {tokenDiagnostics.link.instagram_business_account_id}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        {tokenDiagnostics.error || tx({ de: 'Token-Validierung fehlgeschlagen', en: 'Token validation failed', es: 'Error al validar el token' })}
                      </AlertDescription>
                    </Alert>
                    {tokenDiagnostics.details && (
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-sm font-medium mb-2">{tx({ de: "Fehlerdetails:", en: "Error details:", es: "Detalles del error:" })}</p>
                        {tokenDiagnostics.details.code && (
                          <p className="text-xs text-muted-foreground mb-1">
                            <strong>Code:</strong> {tokenDiagnostics.details.code}
                            {tokenDiagnostics.details.subcode && ` (${tx({ de: "Subcode", en: "Subcode", es: "Subcódigo" })}: ${tokenDiagnostics.details.subcode})`}
                          </p>
                        )}
                        {tokenDiagnostics.details.type && (
                          <p className="text-xs text-muted-foreground mb-1">
                            <strong>Type:</strong> {tokenDiagnostics.details.type}
                          </p>
                        )}
                        <pre className="text-xs text-muted-foreground overflow-x-auto mt-2">
                          {JSON.stringify(tokenDiagnostics.details, null, 2)}
                        </pre>
                      </div>
                    )}
                    <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                      <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                        {tx({ de: "💡 Häufige Probleme:", en: "💡 Common issues:", es: "💡 Problemas comunes:" })}
                      </p>
                      <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
                        <li>{tx({ de: "Token ist ein User Token statt Page Token", en: "Token is a user token instead of a page token", es: "El token es un token de usuario en lugar de un token de página" })}</li>
                        <li>{tx({ de: "Token ist abgelaufen (Short-lived statt Long-lived)", en: "Token has expired (short-lived instead of long-lived)", es: "El token ha caducado (de corta duración en lugar de larga duración)" })}</li>
                        <li>{tx({ de: "Fehlende Permissions: instagram_basic, instagram_content_publish", en: "Missing permissions: instagram_basic, instagram_content_publish", es: "Faltan permisos: instagram_basic, instagram_content_publish" })}</li>
                        <li>{tx({ de: "Instagram Account ist kein Business Account", en: "Instagram account is not a business account", es: "La cuenta de Instagram no es una cuenta profesional" })}</li>
                        <li>{tx({ de: "Facebook Page nicht mit Instagram verknüpft", en: "Facebook page not linked to Instagram", es: "La página de Facebook no está vinculada a Instagram" })}</li>
                      </ul>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {error}
              </AlertDescription>
            </Alert>
          )}

          {/* Results Card */}
          {result && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  {result.dryRun ? tx({ de: tx({ de: "Dry-Run Erfolgreich", en: "Dry run successful", es: "Simulación correcta" }), en: 'Dry Run Successful', es: 'Prueba en Seco Exitosa' }) : tx({ de: 'Erfolgreich Veröffentlicht', en: 'Successfully Published', es: 'Publicado con Éxito' })}
                </CardTitle>
                <CardDescription>
                  {result.dryRun 
                    ? tx({ de: tx({ de: "Container wurde erstellt, aber nicht veröffentlicht", en: "Container was created but not published", es: "El contenedor se creó pero no se publicó" }), en: 'Container was created but not published', es: 'El contenedor se creó pero no se publicó' })
                    : tx({ de: 'Dein Post ist jetzt auf Instagram live', en: 'Your post is now live on Instagram', es: 'Tu publicación ya está en vivo en Instagram' })}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.creationId && (
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <p className="text-sm font-medium">{tx({ de: "Creation ID", en: "Creation ID", es: "ID de creación" })}</p>
                      <p className="text-sm text-muted-foreground font-mono">
                        {result.creationId}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(result.creationId, tx({ de: 'Creation ID', en: 'Creation ID', es: 'ID de creación' }))}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {result.postId && (
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <p className="text-sm font-medium">{tx({ de: "Post ID", en: "Post ID", es: "ID de publicación" })}</p>
                      <p className="text-sm text-muted-foreground font-mono">
                        {result.postId}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(result.postId, tx({ de: 'Post ID', en: 'Post ID', es: 'ID de publicación' }))}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {result.permalink && (
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{tx({ de: "Permalink", en: "Permalink", es: "Enlace permanente" })}</p>
                      <a 
                        href={result.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline truncate block"
                      >
                        {result.permalink}
                      </a>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(result.permalink, tx({ de: 'Permalink', en: 'Permalink', es: 'Enlace permanente' }))}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {result.timestamp && (
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm font-medium">{tx({ de: "Veröffentlicht", en: "Published", es: "Publicado" })}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(result.timestamp).toLocaleString(uiLocale())}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Debug Result Card */}
          {debugResult && debugResult.ok && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-primary" />
                  {tx({ de: "Token Status & Scopes", en: "Token Status & Scopes", es: "Estado del token y permisos" })}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Validity & Expiration */}
                <div className="flex items-start gap-3">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div>
                        <p className="text-sm font-medium">{tx({ de: "Gültigkeit", en: "Validity", es: "Validez" })}</p>
                        <p className="text-sm text-muted-foreground">
                          {debugResult.token.is_valid ? tx({ de: "✅ Gültig", en: "✅ Valid", es: "✅ Válido" }) : tx({ de: "❌ Ungültig", en: "❌ Invalid", es: "❌ Inválido" })}
                        </p>
                      </div>
                      {debugResult.token.is_valid && (
                        <Badge variant="default">OK</Badge>
                      )}
                    </div>

                    {debugResult.token.expires_at && (
                      <div className={`flex items-center justify-between p-3 rounded-lg ${
                        debugResult.token.expiration_warning 
                          ? "bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800" 
                          : "bg-muted"
                      }`}>
                        <div>
                          <p className="text-sm font-medium flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            {tx({ de: "Läuft ab", en: "Expires", es: "Caduca" })}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(debugResult.token.expires_at * 1000).toLocaleDateString(uiLocale(), {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                          {debugResult.token.days_until_expiration !== null && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {tx({ de: "In", en: "In", es: "En" })} {debugResult.token.days_until_expiration} {tx({ de: "Tagen", en: "days", es: "días" })}
                            </p>
                          )}
                        </div>
                        {debugResult.token.expiration_warning && (
                          <Badge variant="destructive">{tx({ de: "Warnung", en: "Warning", es: "Advertencia" })}</Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Scopes */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">{tx({ de: "Berechtigungen (Scopes)", en: "Permissions (Scopes)", es: "Permisos (Scopes)" })}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'pages_manage_metadata'].map(scope => {
                      const hasScope = debugResult.token.scopes?.includes(scope);
                      return (
                        <div 
                          key={scope}
                          className={`p-2 rounded-lg text-sm flex items-center gap-2 ${
                            hasScope 
                              ? "bg-green-50 dark:bg-green-950 text-green-900 dark:text-green-100" 
                              : "bg-red-50 dark:bg-red-950 text-red-900 dark:text-red-100"
                          }`}
                        >
                          {hasScope ? "✅" : "❌"}
                          <span className="text-xs font-mono">{scope}</span>
                        </div>
                      );
                    })}
                  </div>
                  
                  {debugResult.token.missing_scopes?.length > 0 && (
                    <Alert variant="destructive" className="mt-2">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>{tx({ de: "Fehlende Scopes:", en: "Missing scopes:", es: "Permisos faltantes:" })}</strong> {debugResult.token.missing_scopes.join(', ')}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                {/* Recommendations */}
                {debugResult.recommendations?.length > 0 && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <ul className="list-disc list-inside space-y-1 text-sm">
                        {debugResult.recommendations.map((rec: string, i: number) => (
                          <li key={i}>{rec}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}

          {/* Token Backups Section */}
          {debugResult && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  {tx({ de: "Token-Backups", en: "Token backups", es: "Copias de seguridad de tokens" })}
                </CardTitle>
                <CardDescription>
                  {tx({ de: "Vorherige Token-Versionen zur Wiederherstellung", en: "Previous token versions for restoring", es: "Versiones anteriores del token para restaurar" })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {backupsLoading ? (
                  <div className="text-center text-muted-foreground py-4">
                    {tx({ de: "Lade Backups...", en: "Loading backups...", es: "Cargando copias de seguridad..." })}
                  </div>
                ) : backups.length === 0 ? (
                  <div className="text-center text-muted-foreground py-4">
                    {tx({ de: "Keine Backups vorhanden", en: "No backups available", es: "No hay copias de seguridad disponibles" })}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {backups.map((backup) => (
                      <div
                        key={backup.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-xs">
                              ...{backup.token_last6}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {new Date(backup.created_at).toLocaleString(uiLocale())}
                            </span>
                          </div>
                          {backup.expires_at && (
                            <div className="text-xs text-muted-foreground">
                              {tx({ de: "Ablauf:", en: "Expires:", es: "Caduca:" })}{" "}
                              {new Date(backup.expires_at).toLocaleString(uiLocale())}
                            </div>
                          )}
                          {backup.scopes && (
                            <div className="text-xs text-muted-foreground">
                              {backup.scopes.length} {tx({ de: "Scopes", en: "scopes", es: "permisos" })}
                            </div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRestoreBackup(backup.id)}
                        >
                          {tx({ de: "Wiederherstellen", en: "Restore", es: "Restaurar" })}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Info Card */}
          <Card>
            <CardHeader>
              <CardTitle>{tx({ de: "Scopes & Berechtigungen", en: "Scopes & Permissions", es: "Permisos y Scopes" })}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm">
                {tx({ de: "Stelle sicher, dass dein Facebook-App folgende Scopes hat:", en: "Make sure your Facebook app has the following scopes:", es: "Asegúrate de que tu app de Facebook tenga los siguientes permisos:" })}
              </p>
              <ul className="list-disc list-inside text-sm space-y-1 text-muted-foreground">
                <li>instagram_basic</li>
                <li>instagram_content_publish</li>
                <li>pages_show_list</li>
                <li>pages_read_engagement</li>
                <li>pages_manage_posts</li>
                <li>pages_manage_metadata</li>
              </ul>
              <Alert className="mt-4">
                <AlertDescription>
                  <strong>{tx({ de: "Wichtig:", en: "Important:", es: "Importante:" })}</strong> {tx({ de: "Der PAGE_ACCESS_TOKEN wird serverseitig gespeichert und nie im Client ausgeliefert.", en: "The PAGE_ACCESS_TOKEN is stored server-side and is never delivered to the client.", es: "El PAGE_ACCESS_TOKEN se almacena en el servidor y nunca se entrega al cliente." })}
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Token Renewal Modal */}
      <Dialog open={renewModalOpen} onOpenChange={setRenewModalOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5" />
              {tx({ de: "Instagram Token erneuern", en: "Renew Instagram token", es: "Renovar token de Instagram" })}
            </DialogTitle>
            <DialogDescription>
              {tx({ de: "Um deinen Token zu erneuern, brauchst du einen neuen", en: "To renew your token, you need a new", es: "Para renovar tu token, necesitas un nuevo" })} <strong>User Access Token</strong> {tx({ de: "aus dem Meta Graph API Explorer.", en: "from the Meta Graph API Explorer.", es: "del Meta Graph API Explorer." })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Token Type Selection */}
            <Card className="border-2">
              <CardHeader>
                <CardTitle className="text-base">1️⃣ {tx({ de: "Welchen Token-Typ hast du?", en: "Which token type do you have?", es: "¿Qué tipo de token tienes?" })}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <button
                    onClick={() => setTokenTypeChoice("page")}
                    className={`w-full p-4 border-2 rounded-lg text-left transition-all ${
                      tokenTypeChoice === "page"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 ${
                        tokenTypeChoice === "page" ? "border-primary" : "border-muted-foreground"
                      }`}>
                        {tokenTypeChoice === "page" && (
                          <div className="w-3 h-3 rounded-full bg-primary" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-base mb-1">
                          ✅ {tx({ de: "Page Token (Empfohlen)", en: "Page Token (Recommended)", es: "Token de página (Recomendado)" })}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {tx({ de: "Ich habe bereits einen Page Access Token aus dem Graph API Explorer", en: "I already have a Page Access Token from the Graph API Explorer", es: "Ya tengo un token de acceso de página del Graph API Explorer" })}
                        </p>
                        <Badge variant="secondary" className="mt-2">{tx({ de: "Einfacher & schneller", en: "Simpler & faster", es: "Más simple y rápido" })}</Badge>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => setTokenTypeChoice("user")}
                    className={`w-full p-4 border-2 rounded-lg text-left transition-all ${
                      tokenTypeChoice === "user"
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 ${
                        tokenTypeChoice === "user" ? "border-primary" : "border-muted-foreground"
                      }`}>
                        {tokenTypeChoice === "user" && (
                          <div className="w-3 h-3 rounded-full bg-primary" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="font-semibold text-base mb-1">
                          {tx({ de: "User Token (Erweitert)", en: "User Token (Advanced)", es: "Token de usuario (Avanzado)" })}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {tx({ de: "Ich habe einen User Access Token und möchte ihn in einen Page Token umwandeln", en: "I have a User Access Token and want to convert it into a Page Token", es: "Tengo un token de acceso de usuario y quiero convertirlo en un token de página" })}
                        </p>
                        <Badge variant="outline" className="mt-2">{tx({ de: "Mehr Schritte erforderlich", en: "More steps required", es: "Se requieren más pasos" })}</Badge>
                      </div>
                    </div>
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Step-by-Step Guide - Page Token */}
            {tokenTypeChoice === "page" && (
              <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                <CardHeader>
                  <CardTitle className="text-base">📋 {tx({ de: "So bekommst du deinen Page Token:", en: "How to get your Page Token:", es: "Cómo obtener tu token de página:" })}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="space-y-3 text-sm">
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">1</span>
                      <div>
                        <p className="font-medium">{tx({ de: "Öffne den Meta Graph API Explorer", en: "Open Meta Graph API Explorer", es: "Abrir el Explorador de la API de Meta Graph" })}</p>
                        <a 
                          href="https://developers.facebook.com/tools/explorer/" 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-primary underline hover:no-underline"
                        >
                          {tx({ de: "→ Graph API Explorer öffnen", en: "→ Open Graph API Explorer", es: "→ Abrir Explorador de API de Graph" })}
                        </a>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">2</span>
                      <div>
                        <p className="font-medium">{tx({ de: "Wähle deine App", en: "Choose your app", es: "Elige tu aplicación" })}</p>
                        <p className="text-muted-foreground">{tx({ de: "Oben rechts im Dropdown:", en: "Top right in the dropdown:", es: "Arriba a la derecha en el desplegable:" })} <strong>AdTool AI Integration</strong></p>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">3</span>
                      <div>
                        <p className="font-medium">{tx({ de: "Klicke auf \"Get Page Access Token\"", en: "Click on “Get Page Access Token”", es: "Haga clic en \"Obtener token de acceso a la página\"" })}</p>
                        <p className="text-muted-foreground">{tx({ de: "Im Token-Dropdown → ", en: "In the token dropdown → select ", es: "En el menú desplegable de tokens → seleccionar " })}<strong>"Get Page Access Token"</strong>{tx({ de: " auswählen", en: "", es: "" })}</p>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">4</span>
                      <div>
                        <p className="font-medium">{tx({ de: "Wähle deine Facebook-Seite", en: "Choose your Facebook page", es: "Elige tu página de Facebook" })}</p>
                        <p className="text-muted-foreground">{tx({ de: "Die Seite, die mit deinem Instagram Business Account verknüpft ist", en: "The page linked to your Instagram Business Account", es: "La página vinculada a tu cuenta de Instagram Business" })}</p>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">5</span>
                      <div>
                        <p className="font-medium">{tx({ de: "Kopiere den generierten Token", en: "Copy the generated token", es: "Copia el token generado" })}</p>
                        <p className="text-muted-foreground">{tx({ de: "Der Token wird direkt angezeigt - einfach kopieren!", en: "The token is displayed directly - just copy it!", es: "El token se muestra directamente, ¡simplemente cópielo!" })}</p>
                      </div>
                    </li>
                  </ol>
                  
                  <Alert className="mt-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      <strong>Tipp:</strong> {tx({ de: 'Mit einem Page Token brauchst du keine zusätzlichen Scopes auswählen - alles ist bereits enthalten!', en: 'With a page token you do not need to select extra scopes — everything is already included!', es: 'Con un token de página no necesitas seleccionar permisos adicionales: ya está todo incluido.' })}
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            )}

            {/* Step-by-Step Guide - User Token */}
            {tokenTypeChoice === "user" && (
              <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                <CardHeader>
                  <CardTitle className="text-base">📋 {tx({ de: "So bekommst du deinen User Token:", en: "How to get your User Token:", es: "Cómo obtener tu token de usuario:" })}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="space-y-3 text-sm">
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">1</span>
                      <div>
                        <p className="font-medium">{tx({ de: "Öffne den Meta Graph API Explorer", en: "Open Meta Graph API Explorer", es: "Abrir el Explorador de la API de Meta Graph" })}</p>
                        <a 
                          href="https://developers.facebook.com/tools/explorer/" 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-primary underline hover:no-underline"
                        >
                          {tx({ de: "→ Graph API Explorer öffnen", en: "→ Open Graph API Explorer", es: "→ Abrir Explorador de API de Graph" })}
                        </a>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">2</span>
                      <div>
                        <p className="font-medium">{tx({ de: "Wähle deine App", en: "Choose your app", es: "Elige tu aplicación" })}</p>
                        <p className="text-muted-foreground">{tx({ de: 'Oben rechts:', en: 'Top right:', es: 'Arriba a la derecha:' })} <strong>AdTool AI Integration</strong></p>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">3</span>
                      <div>
                        <p className="font-medium">{tx({ de: "Klicke auf \"Generate Access Token\"", en: "Click on “Generate Access Token”", es: "Haga clic en \"Generar token de acceso\"" })}</p>
                        <p className="text-muted-foreground">{tx({ de: 'Neben dem Token-Feld', en: 'Next to the token field', es: 'Junto al campo de token' })}</p>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">4</span>
                      <div>
                        <p className="font-medium">{tx({ de: "Wähle ALLE Berechtigungen aus:", en: "Select ALL permissions:", es: "Selecciona TODOS los permisos:" })}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <Badge variant="secondary" className="text-xs">instagram_basic</Badge>
                          <Badge variant="secondary" className="text-xs">instagram_content_publish</Badge>
                          <Badge variant="secondary" className="text-xs">pages_show_list</Badge>
                          <Badge variant="secondary" className="text-xs">pages_read_engagement</Badge>
                          <Badge variant="secondary" className="text-xs">pages_manage_posts</Badge>
                          <Badge variant="secondary" className="text-xs">pages_manage_metadata</Badge>
                        </div>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">5</span>
                      <div>
                        <p className="font-medium">{tx({ de: "Bestätige im Popup", en: "Confirm in the popup", es: "Confirmar en la ventana emergente" })}</p>
                        <p className="text-muted-foreground">{tx({ de: "Klicke auf \"Als {'{'}Dein Name{'}'} fortfahren\"", en: "Click on \"Continue as {'{'}Your Name{'}'}\"", es: "Haz clic en \"Continuar como {'{'}Tu Nombre{'}'}\"" })}</p>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">6</span>
                      <div>
                        <p className="font-medium">{tx({ de: "Kopiere den generierten Token", en: "Copy the generated token", es: "Copia el token generado" })}</p>
                        <p className="text-muted-foreground">{tx({ de: "Beginnt mit \"EAAG…\" oder \"EAABsb…\"", en: "Starts with \"EAAG…\" or \"EAABsb…\"", es: "Comienza con \"EAAG…\" o \"EAABsb…\"" })}</p>
                      </div>
                    </li>
                  </ol>
                  
                  <Alert variant="destructive" className="mt-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      <strong>{tx({ de: "Achtung:", en: "Attention:", es: "Atención:" })}</strong> {tx({ de: "User Token Modus benötigt die Permission", en: "User token mode requires permission", es: "El modo token de usuario requiere permiso" })} <code>pages_show_list</code>{tx({ de: ". Falls dieser Fehler auftritt, verwende stattdessen einen Page Token (Option 1).", en: ". If this error occurs, use a Page Token instead (Option 1).", es: ". Si ocurre este error, usa un Page Token en su lugar (Opción 1)." })}
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            )}

            {/* Token Input */}
            <div className="space-y-2">
              <Label htmlFor="shortToken" className="text-base font-semibold">
                2️⃣ {tx({ de: 'Füge deinen', en: 'Paste your', es: 'Pega tu' })} {tokenTypeChoice === "page" ? "Page" : "User"} {tx({ de: 'Access Token ein', en: 'access token', es: 'token de acceso' })}
              </Label>
              <Textarea
                id="shortToken"
                value={shortUserToken}
                onChange={(e) => setShortUserToken(e.target.value)}
                placeholder={tokenTypeChoice === "page" ? "EAAG... (Page Token)" : "EAAG... (User Token)"}
                rows={4}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                {tx({ de: "ℹ️ Dieser Token wird", en: "ℹ️ This token will", es: "ℹ️ Este token se" })} {tokenTypeChoice === "page" ? tx({ de: tx({ de: "direkt in einen Long-Lived Page Token umgewandelt", en: "converted directly into a long-lived page token", es: "convertido directamente en un token de página de larga duración" }), en: "converted directly into a long-lived page token", es: "convertido directamente en un token de página de larga duración" }) : tx({ de: "verwendet, um einen Long-Lived Page Token zu generieren", en: "used to generate a long-lived page token", es: "utilizado para generar un token de página de larga duración" })} {tx({ de: "und nicht gespeichert.", en: "and not saved.", es: "y no guardado." })}
              </p>
            </div>

            {/* Action Button */}
            <Button
              onClick={renewToken}
              disabled={renewLoading || !shortUserToken.trim()}
              className="w-full"
              size="lg"
            >
              {renewLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {renewLoading ? tx({ de: tx({ de: "Token wird geprüft und erneuert...", en: "Checking and renewing token...", es: "Comprobando y renovando el token..." }), en: "Token is being checked and renewed...", es: "El token se está verificando y renovando..." }) : tx({ de: `3️⃣ ${tokenTypeChoice === "page" ? "Page" : "User"}-Token prüfen und speichern`, en: `3️⃣ Check and save ${tokenTypeChoice === "page" ? "Page" : "User"} token`, es: `3️⃣ Verificar y guardar el token de ${tokenTypeChoice === "page" ? "página" : "usuario"}` })}
            </Button>

            {/* Success Result */}
            {renewResult && renewResult.saved && (
              <div className="mt-4 space-y-4">
                <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <AlertDescription className="text-green-800 dark:text-green-200 font-medium">
                    {tx({ de: "✅ Token erfolgreich erneuert und automatisch gespeichert!", en: "✅ Token successfully renewed and automatically saved!", es: "✅ ¡Token renovado y guardado automáticamente con éxito!" })}
                  </AlertDescription>
                </Alert>

                {renewResult.renewal_mode && (
                  <div className="text-sm">
                    <strong>Modus:</strong>{" "}
                    <Badge variant="outline">
                      {renewResult.renewal_mode === "direct_page_token" ? "Direct Page Token" : "User → Page Token"}
                    </Badge>
                  </div>
                )}

                <div className="flex items-center gap-2 text-sm">
                  {renewResult.debug?.is_valid ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span className="font-medium">
                    {renewResult.debug?.is_valid ? tx({ de: "Token gültig", en: "Token valid", es: "Token válido" }) : tx({ de: "Token ungültig", en: "Token invalid", es: "Token inválido" })}
                  </span>
                </div>

                {renewResult.debug?.expires_at && renewResult.debug.expires_at > 0 && (
                  <div className="text-sm">
                    <strong>Ablaufdatum:</strong>{' '}
                    <span className="text-muted-foreground">
                      {new Date(renewResult.debug.expires_at * 1000).toLocaleDateString(uiLocale(), {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                    {renewResult.debug.expires_at * 1000 < Date.now() + 7 * 24 * 60 * 60 * 1000 && (
                      <Badge variant="destructive" className="ml-2">{tx({ de: "Läuft bald ab!", en: "Expires soon!", es: "¡Expira pronto!" })}</Badge>
                    )}
                  </div>
                )}

                {renewResult.debug?.expires_at === 0 && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-sm">
                      <strong>⚠️ Short-Lived Token!</strong>
                      <p className="mt-1">{tx({ de: "Dieser Token läuft nach ~2 Stunden ab. Falls du einen Page Token eingegeben hast, probiere es nochmal mit der Option \"Get Page Access Token\" im Graph API Explorer.", en: "This token expires after ~2 hours. If you entered a Page Token, please try again with the option \"Get Page Access Token\" in the Graph API Explorer.", es: "Este token caduca después de ~2 horas. Si ingresaste un token de página, inténtalo de nuevo con la opción \"Get Page Access Token\" en el Graph API Explorer." })}</p>
                    </AlertDescription>
                  </Alert>
                )}

                {renewResult.debug?.scopes && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">{tx({ de: "Berechtigungen:", en: "Permissions:", es: "Permisos:" })}</div>
                    <div className="flex flex-wrap gap-2">
                      {requiredScopes.map(scope => {
                        const hasScope = renewResult.debug.scopes.includes(scope);
                        return (
                          <Badge
                            key={scope}
                            variant={hasScope ? "default" : "destructive"}
                            className="text-xs"
                          >
                            {hasScope ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                            {scope}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                )}

                {renewResult.page_info && (
                  <div className="text-sm">
                    <strong>Facebook-Seite:</strong>{' '}
                    <span className="text-muted-foreground">
                      {renewResult.page_info.name} (ID: {renewResult.page_info.id})
                    </span>
                  </div>
                )}

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    {tx({ de: "Die Diagnose wird automatisch aktualisiert. Du kannst jetzt wieder automatisch posten! 🚀", en: "The diagnosis is automatically updated. You can now post automatically again! 🚀", es: "El diagnóstico se actualiza automáticamente. ¡Ahora puedes volver a publicar automáticamente! 🚀" })}
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>{tx({ de: "❌ Token konnte nicht validiert werden.", en: "❌ Token could not be validated.", es: "❌ No se pudo validar el token." })}</strong>
                  <p className="mt-1 text-sm">{error}</p>
                  <p className="mt-2 text-sm">
                    {tx({ de: "Bitte prüfe:", en: "Please check:", es: "Por favor, verifica:" })}
                  </p>
                  <ul className="list-disc list-inside text-sm mt-1">
                    <li>{tx({ de: "Hast du die richtige App gewählt?", en: "Did you choose the right app?", es: "¿Elegiste la aplicación correcta?" })}</li>
                    <li>{tx({ de: "Hast du den richtigen Token-Typ ausgewählt (Page vs. User)?", en: "Did you select the correct token type (Page vs. User)?", es: "¿Seleccionó el tipo de token correcto (Página versus Usuario)?" })}</li>
                    {tokenTypeChoice === "user" && (
                      <li>{tx({ de: "Sind alle Berechtigungen ausgewählt (besonders pages_show_list)?", en: "Are all permissions selected (especially pages_show_list)?", es: "¿Están seleccionados todos los permisos (especialmente páginas_show_list)?" })}</li>
                    )}
                    <li>{tx({ de: "Ist die Facebook-Seite mit Instagram verknüpft?", en: "Is the Facebook page linked to Instagram?", es: "¿La página de Facebook está vinculada a Instagram?" })}</li>
                  </ul>
                  {tokenTypeChoice === "user" && error.includes("accounts") && (
                    <Alert className="mt-3 border-orange-500">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        <strong>💡 Tipp:</strong> {tx({ de: "Dieser Fehler tritt oft auf, wenn", en: "This error often occurs when", es: "Este error ocurre a menudo cuando" })} <code>pages_show_list</code> {tx({ de: "fehlt. Verwende stattdessen einen", en: "missing. Use one instead", es: "desaparecido. Utilice uno en su lugar" })} <strong>Page Token</strong> {tx({ de: "(Option 1 oben) - das ist einfacher!", en: "(Option 1 above) - that's easier!", es: "(Opción 1 arriba) - ¡es más fácil!" })}
                      </AlertDescription>
                    </Alert>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
