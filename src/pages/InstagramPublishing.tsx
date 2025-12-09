import { useState } from "react";
import { Header } from "@/components/Header";
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
      title: "Kopiert!",
      description: `${label} wurde in die Zwischenablage kopiert.`,
    });
  };

  const testConnection = async () => {
    setTesting(true);
    setError(null);
    setTokenDiagnostics(null);
    
    try {
      if (!igUserId) {
        toast({
          title: "Fehler",
          description: "Bitte Instagram User ID eingeben.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Einstellungen OK",
        description: "Instagram User ID ist konfiguriert. Bereit zum Testen.",
      });
    } catch (err: any) {
      setError(err.message || "Validierung fehlgeschlagen");
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
          title: "✅ Token gültig",
          description: `Instagram Account: @${data.user?.username || 'unknown'}`,
        });
      } else {
        toast({
          title: "❌ Token ungültig",
          description: data.error || "Token-Validierung fehlgeschlagen",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      console.error('Token diagnostics error:', err);
      const errorMessage = err.message || 'Token-Diagnose fehlgeschlagen';
      setError(errorMessage);
      toast({
        title: "Diagnose-Fehler",
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
          title: warnings ? "⚠️ Token hat Warnungen" : "✅ Token Status OK",
          description: warnings 
            ? data.recommendations.join(' • ') 
            : "Alle Scopes vorhanden, Token ist gültig",
          variant: warnings ? "default" : "default",
        });
        
        // Also load backups
        await loadBackups();
      } else {
        toast({
          title: "❌ Scope-Check fehlgeschlagen",
          description: data.error || "Konnte Token nicht überprüfen",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      console.error('Token debug error:', err);
      const errorMessage = err.message || 'Scope-Check fehlgeschlagen';
      setError(errorMessage);
      toast({
        title: "Debug-Fehler",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setDebugLoading(false);
    }
  };

  const handleRestoreBackup = async (backupId: number) => {
    if (!confirm('Möchtest du diesen Token wirklich wiederherstellen?')) {
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('instagram-token-backups', {
        body: { action: 'restore', id: backupId }
      });

      if (error) throw error;

      if (data?.ok) {
        toast({
          title: "✅ Wiederhergestellt",
          description: "Token wurde erfolgreich wiederhergestellt",
        });
        await checkScopesAndExpiry();
      } else {
        throw new Error(data?.error || 'Wiederherstellung fehlgeschlagen');
      }
    } catch (err: any) {
      console.error('Restore error:', err);
      toast({
        title: "❌ Fehler",
        description: err.message || 'Wiederherstellung fehlgeschlagen',
        variant: "destructive",
      });
    }
  };

  const renewToken = async () => {
    if (!shortUserToken.trim()) {
      toast({
        title: "Fehler",
        description: "Bitte gib einen Access Token ein",
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
        const backupMsg = data.backup_created ? " Backup erstellt." : "";
        toast({
          title: "Erfolg!",
          description: `Token erfolgreich erneuert und gespeichert!${backupMsg}`,
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
        throw new Error(data?.error || 'Token-Erneuerung fehlgeschlagen');
      }
    } catch (err: any) {
      console.error('Token renewal error:', err);
      
      // Map common error codes
      let errorMessage = err.message || 'Fehler bei Token-Erneuerung';
      if (err.message?.includes('190')) {
        errorMessage = 'Token ungültig/abgelaufen – bitte neu generieren';
      } else if (err.message?.includes('100') || err.message?.includes('10')) {
        errorMessage = 'Berechtigungen fehlen – beim Generieren alle Häkchen setzen + richtige Seite auswählen';
      } else if (err.message?.includes('Invalid platform')) {
        errorMessage = 'App/Website-Domain/Business-Modus in Meta Developer Console prüfen';
      }
      
      toast({
        title: "Fehler",
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
        throw new Error(data.error || 'Unbekannter Fehler');
      }

      setResult(data);
      
      if (dryRun) {
        toast({
          title: "Dry-Run erfolgreich",
          description: "Container wurde erstellt, aber nicht veröffentlicht.",
        });
      } else {
        toast({
          title: "Erfolgreich veröffentlicht! 🎉",
          description: "Dein Post wurde auf Instagram veröffentlicht.",
        });
      }
    } catch (err: any) {
      console.error('Instagram publish error:', err);
      const errorMessage = err.message || 'Fehler beim Veröffentlichen';
      setError(errorMessage);
      toast({
        title: "Fehler",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <Instagram className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold">Instagram Publishing</h1>
        </div>

        <div className="space-y-6">
          {/* Settings Card */}
          <Card>
            <CardHeader>
              <CardTitle>Einstellungen</CardTitle>
              <CardDescription>
                Konfiguriere deine Instagram API-Einstellungen
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
                  Deine Instagram Business Account ID
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="testImage">Test-Bild URL</Label>
                <Input
                  id="testImage"
                  value={testImageUrl}
                  onChange={(e) => setTestImageUrl(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                />
                <p className="text-sm text-muted-foreground">
                  Öffentlich zugängliche Bild-URL für Test-Posts
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="caption">Standard-Caption</Label>
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
                  <Label htmlFor="dryRun">Dry-Run Modus</Label>
                  <p className="text-sm text-muted-foreground">
                    Nur Container anlegen, nicht veröffentlichen
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
                    Token diagnostizieren
                  </Button>
                  
                  <Button 
                    onClick={checkScopesAndExpiry}
                    variant="outline"
                    disabled={debugLoading}
                  >
                    {debugLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Shield className="mr-2 h-4 w-4" />
                    Scopes & Ablauf prüfen
                  </Button>

                  <Button 
                    onClick={() => setRenewModalOpen(true)}
                    variant="outline"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Token erneuern
                  </Button>
                </div>
                
                <Button 
                  onClick={handleTestPost}
                  disabled={loading || !igUserId || !testImageUrl}
                  className="w-full"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Test-Post jetzt veröffentlichen
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
                  Token-Diagnose
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {tokenDiagnostics.ok ? (
                  <>
                    <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                      <p className="text-sm font-medium text-green-900 dark:text-green-100">
                        ✅ Token ist gültig und korrekt verknüpft
                      </p>
                    </div>
                    {tokenDiagnostics.user?.username && (
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div>
                          <p className="text-sm font-medium">Instagram Username</p>
                          <p className="text-sm text-muted-foreground">
                            @{tokenDiagnostics.user.username}
                          </p>
                        </div>
                      </div>
                    )}
                    {tokenDiagnostics.user?.id && (
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div>
                          <p className="text-sm font-medium">Instagram User ID</p>
                          <p className="text-sm text-muted-foreground font-mono">
                            {tokenDiagnostics.user.id}
                          </p>
                        </div>
                      </div>
                    )}
                    {tokenDiagnostics.link && (
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-sm font-medium mb-1">Verknüpfung</p>
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
                        {tokenDiagnostics.error || 'Token-Validierung fehlgeschlagen'}
                      </AlertDescription>
                    </Alert>
                    {tokenDiagnostics.details && (
                      <div className="p-3 bg-muted rounded-lg">
                        <p className="text-sm font-medium mb-2">Fehlerdetails:</p>
                        {tokenDiagnostics.details.code && (
                          <p className="text-xs text-muted-foreground mb-1">
                            <strong>Code:</strong> {tokenDiagnostics.details.code}
                            {tokenDiagnostics.details.subcode && ` (Subcode: ${tokenDiagnostics.details.subcode})`}
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
                        💡 Häufige Probleme:
                      </p>
                      <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
                        <li>Token ist ein User Token statt Page Token</li>
                        <li>Token ist abgelaufen (Short-lived statt Long-lived)</li>
                        <li>Fehlende Permissions: instagram_basic, instagram_content_publish</li>
                        <li>Instagram Account ist kein Business Account</li>
                        <li>Facebook Page nicht mit Instagram verknüpft</li>
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
                  {result.dryRun ? 'Dry-Run Erfolgreich' : 'Erfolgreich Veröffentlicht'}
                </CardTitle>
                <CardDescription>
                  {result.dryRun 
                    ? 'Container wurde erstellt, aber nicht veröffentlicht'
                    : 'Dein Post ist jetzt auf Instagram live'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.creationId && (
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <p className="text-sm font-medium">Creation ID</p>
                      <p className="text-sm text-muted-foreground font-mono">
                        {result.creationId}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(result.creationId, 'Creation ID')}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {result.postId && (
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <p className="text-sm font-medium">Post ID</p>
                      <p className="text-sm text-muted-foreground font-mono">
                        {result.postId}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(result.postId, 'Post ID')}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {result.permalink && (
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Permalink</p>
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
                      onClick={() => copyToClipboard(result.permalink, 'Permalink')}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {result.timestamp && (
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm font-medium">Veröffentlicht</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(result.timestamp).toLocaleString('de-DE')}
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
                  Token Status & Scopes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Validity & Expiration */}
                <div className="flex items-start gap-3">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div>
                        <p className="text-sm font-medium">Gültigkeit</p>
                        <p className="text-sm text-muted-foreground">
                          {debugResult.token.is_valid ? "✅ Gültig" : "❌ Ungültig"}
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
                            Läuft ab
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(debugResult.token.expires_at * 1000).toLocaleDateString('de-DE', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                          {debugResult.token.days_until_expiration !== null && (
                            <p className="text-xs text-muted-foreground mt-1">
                              In {debugResult.token.days_until_expiration} Tagen
                            </p>
                          )}
                        </div>
                        {debugResult.token.expiration_warning && (
                          <Badge variant="destructive">Warnung</Badge>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Scopes */}
                <div className="space-y-2">
                  <p className="text-sm font-medium">Berechtigungen (Scopes)</p>
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
                        <strong>Fehlende Scopes:</strong> {debugResult.token.missing_scopes.join(', ')}
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
                  Token-Backups
                </CardTitle>
                <CardDescription>
                  Vorherige Token-Versionen zur Wiederherstellung
                </CardDescription>
              </CardHeader>
              <CardContent>
                {backupsLoading ? (
                  <div className="text-center text-muted-foreground py-4">
                    Lade Backups...
                  </div>
                ) : backups.length === 0 ? (
                  <div className="text-center text-muted-foreground py-4">
                    Keine Backups vorhanden
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
                              {new Date(backup.created_at).toLocaleString("de-DE")}
                            </span>
                          </div>
                          {backup.expires_at && (
                            <div className="text-xs text-muted-foreground">
                              Ablauf:{" "}
                              {new Date(backup.expires_at).toLocaleString("de-DE")}
                            </div>
                          )}
                          {backup.scopes && (
                            <div className="text-xs text-muted-foreground">
                              {backup.scopes.length} Scopes
                            </div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRestoreBackup(backup.id)}
                        >
                          Wiederherstellen
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
              <CardTitle>Scopes & Berechtigungen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm">
                Stelle sicher, dass dein Facebook-App folgende Scopes hat:
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
                  <strong>Wichtig:</strong> Der PAGE_ACCESS_TOKEN wird serverseitig gespeichert und nie im Client ausgeliefert.
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
              Instagram Token erneuern
            </DialogTitle>
            <DialogDescription>
              Um deinen Token zu erneuern, brauchst du einen neuen <strong>User Access Token</strong> aus dem Meta Graph API Explorer.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Token Type Selection */}
            <Card className="border-2">
              <CardHeader>
                <CardTitle className="text-base">1️⃣ Welchen Token-Typ hast du?</CardTitle>
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
                          ✅ Page Token (Empfohlen)
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Ich habe bereits einen Page Access Token aus dem Graph API Explorer
                        </p>
                        <Badge variant="secondary" className="mt-2">Einfacher & schneller</Badge>
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
                          User Token (Erweitert)
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Ich habe einen User Access Token und möchte ihn in einen Page Token umwandeln
                        </p>
                        <Badge variant="outline" className="mt-2">Mehr Schritte erforderlich</Badge>
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
                  <CardTitle className="text-base">📋 So bekommst du deinen Page Token:</CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="space-y-3 text-sm">
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">1</span>
                      <div>
                        <p className="font-medium">Öffne den Meta Graph API Explorer</p>
                        <a 
                          href="https://developers.facebook.com/tools/explorer/" 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-primary underline hover:no-underline"
                        >
                          → Graph API Explorer öffnen
                        </a>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">2</span>
                      <div>
                        <p className="font-medium">Wähle deine App</p>
                        <p className="text-muted-foreground">Oben rechts im Dropdown: <strong>AdTool AI Integration</strong></p>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">3</span>
                      <div>
                        <p className="font-medium">Klicke auf "Get Page Access Token"</p>
                        <p className="text-muted-foreground">Im Token-Dropdown → <strong>"Get Page Access Token"</strong> auswählen</p>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">4</span>
                      <div>
                        <p className="font-medium">Wähle deine Facebook-Seite</p>
                        <p className="text-muted-foreground">Die Seite, die mit deinem Instagram Business Account verknüpft ist</p>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">5</span>
                      <div>
                        <p className="font-medium">Kopiere den generierten Token</p>
                        <p className="text-muted-foreground">Der Token wird direkt angezeigt - einfach kopieren!</p>
                      </div>
                    </li>
                  </ol>
                  
                  <Alert className="mt-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      <strong>Tipp:</strong> Mit einem Page Token brauchst du keine zusätzlichen Scopes auswählen - alles ist bereits enthalten!
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            )}

            {/* Step-by-Step Guide - User Token */}
            {tokenTypeChoice === "user" && (
              <Card className="bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                <CardHeader>
                  <CardTitle className="text-base">📋 So bekommst du deinen User Token:</CardTitle>
                </CardHeader>
                <CardContent>
                  <ol className="space-y-3 text-sm">
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">1</span>
                      <div>
                        <p className="font-medium">Öffne den Meta Graph API Explorer</p>
                        <a 
                          href="https://developers.facebook.com/tools/explorer/" 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-primary underline hover:no-underline"
                        >
                          → Graph API Explorer öffnen
                        </a>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">2</span>
                      <div>
                        <p className="font-medium">Wähle deine App</p>
                        <p className="text-muted-foreground">Oben rechts: <strong>AdTool AI Integration</strong></p>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">3</span>
                      <div>
                        <p className="font-medium">Klicke auf "Generate Access Token"</p>
                        <p className="text-muted-foreground">Neben dem Token-Feld</p>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">4</span>
                      <div>
                        <p className="font-medium">Wähle ALLE Berechtigungen aus:</p>
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
                        <p className="font-medium">Bestätige im Popup</p>
                        <p className="text-muted-foreground">Klicke auf "Als {'{'}Dein Name{'}'} fortfahren"</p>
                      </div>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold">6</span>
                      <div>
                        <p className="font-medium">Kopiere den generierten Token</p>
                        <p className="text-muted-foreground">Beginnt mit "EAAG…" oder "EAABsb…"</p>
                      </div>
                    </li>
                  </ol>
                  
                  <Alert variant="destructive" className="mt-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      <strong>Achtung:</strong> User Token Modus benötigt die Permission <code>pages_show_list</code>. Falls dieser Fehler auftritt, verwende stattdessen einen Page Token (Option 1).
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            )}

            {/* Token Input */}
            <div className="space-y-2">
              <Label htmlFor="shortToken" className="text-base font-semibold">
                2️⃣ Füge deinen {tokenTypeChoice === "page" ? "Page" : "User"} Access Token ein
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
                ℹ️ Dieser Token wird {tokenTypeChoice === "page" ? "direkt in einen Long-Lived Page Token umgewandelt" : "verwendet, um einen Long-Lived Page Token zu generieren"} und nicht gespeichert.
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
              {renewLoading ? "Token wird geprüft und erneuert..." : `3️⃣ ${tokenTypeChoice === "page" ? "Page" : "User"} Token prüfen und speichern`}
            </Button>

            {/* Success Result */}
            {renewResult && renewResult.saved && (
              <div className="mt-4 space-y-4">
                <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <AlertDescription className="text-green-800 dark:text-green-200 font-medium">
                    ✅ Token erfolgreich erneuert und automatisch gespeichert!
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
                    {renewResult.debug?.is_valid ? 'Token gültig' : 'Token ungültig'}
                  </span>
                </div>

                {renewResult.debug?.expires_at && renewResult.debug.expires_at > 0 && (
                  <div className="text-sm">
                    <strong>Ablaufdatum:</strong>{' '}
                    <span className="text-muted-foreground">
                      {new Date(renewResult.debug.expires_at * 1000).toLocaleDateString('de-DE', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                    {renewResult.debug.expires_at * 1000 < Date.now() + 7 * 24 * 60 * 60 * 1000 && (
                      <Badge variant="destructive" className="ml-2">Läuft bald ab!</Badge>
                    )}
                  </div>
                )}

                {renewResult.debug?.expires_at === 0 && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-sm">
                      <strong>⚠️ Short-Lived Token!</strong>
                      <p className="mt-1">Dieser Token läuft nach ~2 Stunden ab. Falls du einen Page Token eingegeben hast, probiere es nochmal mit der Option "Get Page Access Token" im Graph API Explorer.</p>
                    </AlertDescription>
                  </Alert>
                )}

                {renewResult.debug?.scopes && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Berechtigungen:</div>
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
                    Die Diagnose wird automatisch aktualisiert. Du kannst jetzt wieder automatisch posten! 🚀
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>❌ Token konnte nicht validiert werden.</strong>
                  <p className="mt-1 text-sm">{error}</p>
                  <p className="mt-2 text-sm">
                    Bitte prüfe:
                  </p>
                  <ul className="list-disc list-inside text-sm mt-1">
                    <li>Hast du die richtige App gewählt?</li>
                    <li>Hast du den richtigen Token-Typ ausgewählt (Page vs. User)?</li>
                    {tokenTypeChoice === "user" && (
                      <li>Sind alle Berechtigungen ausgewählt (besonders pages_show_list)?</li>
                    )}
                    <li>Ist die Facebook-Seite mit Instagram verknüpft?</li>
                  </ul>
                  {tokenTypeChoice === "user" && error.includes("accounts") && (
                    <Alert className="mt-3 border-orange-500">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        <strong>💡 Tipp:</strong> Dieser Fehler tritt oft auf, wenn <code>pages_show_list</code> fehlt. Verwende stattdessen einen <strong>Page Token</strong> (Option 1 oben) - das ist einfacher!
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
