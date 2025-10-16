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
import { Loader2, Copy, CheckCircle2, Instagram, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function InstagramPublishing() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  
  // Settings
  const [igUserId, setIgUserId] = useState("17841477402452109");
  const [testImageUrl, setTestImageUrl] = useState("https://upload.wikimedia.org/wikipedia/commons/a/a9/Example.jpg");
  const [defaultCaption, setDefaultCaption] = useState("Posted via CaptionGenie 🚀");
  const [dryRun, setDryRun] = useState(false);
  
  // Results
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

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
                  placeholder="Posted via CaptionGenie 🚀"
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

              <div className="flex gap-2">
                <Button 
                  onClick={testConnection} 
                  variant="outline"
                  disabled={testing || !igUserId}
                >
                  {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Verbindung testen
                </Button>
                
                <Button 
                  onClick={handleTestPost}
                  disabled={loading || !igUserId || !testImageUrl}
                  className="flex-1"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Test-Post jetzt veröffentlichen
                </Button>
              </div>
            </CardContent>
          </Card>

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
    </div>
  );
}
