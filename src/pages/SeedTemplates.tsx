import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Sparkles, CheckCircle2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function SeedTemplates() {
  const [isSeeding, setIsSeeding] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();

  const handleSeedTemplates = async () => {
    setIsSeeding(true);
    setIsCompleted(false);
    
    try {
      const { data, error } = await supabase.functions.invoke('seed-content-templates');

      if (error) throw error;
      if (!data.ok) throw new Error(data.error);

      setResult(data);
      setIsCompleted(true);
      
      toast({
        title: '✅ Templates erfolgreich erstellt!',
        description: `${data.breakdown.ads} Ads, ${data.breakdown.stories} Stories, ${data.breakdown.reels} Reels Templates wurden hinzugefügt.`,
      });
    } catch (error: any) {
      console.error('Seed error:', error);
      toast({
        title: '❌ Fehler beim Erstellen',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <div className="container max-w-4xl py-12">
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl font-bold mb-2">Content Templates Seeding</h1>
          <p className="text-muted-foreground">
            Erstelle 15+ spezialisierte Templates für Ads, Stories und Reels
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Template-Datenbank befüllen
            </CardTitle>
            <CardDescription>
              Dieser Prozess fügt 15 hochwertige, vorkonfigurierte Templates für verschiedene Content-Typen hinzu.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!isCompleted ? (
              <>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-4 bg-blue-500/10 rounded-lg">
                    <div className="text-3xl font-bold text-blue-600">5</div>
                    <div className="text-sm text-muted-foreground">Ad Templates</div>
                  </div>
                  <div className="p-4 bg-pink-500/10 rounded-lg">
                    <div className="text-3xl font-bold text-pink-600">5</div>
                    <div className="text-sm text-muted-foreground">Story Templates</div>
                  </div>
                  <div className="p-4 bg-purple-500/10 rounded-lg">
                    <div className="text-3xl font-bold text-purple-600">5</div>
                    <div className="text-sm text-muted-foreground">Reel Templates</div>
                  </div>
                </div>

                <Alert>
                  <AlertDescription>
                    <strong>Enthaltene Templates:</strong>
                    <ul className="mt-2 space-y-1 text-sm">
                      <li>• Product Launch, Sale & Promo, Service Explainer, App Download, Food Ad</li>
                      <li>• Behind the Scenes, Daily Update, Announcement, Poll & Question, Quote Story</li>
                      <li>• Quick Tutorial, Before & After, Trending Audio, Product Review, Viral Hook</li>
                    </ul>
                  </AlertDescription>
                </Alert>

                <Button 
                  onClick={handleSeedTemplates} 
                  disabled={isSeeding}
                  size="lg"
                  className="w-full"
                >
                  {isSeeding ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      Templates werden erstellt...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-5 w-5 mr-2" />
                      15 Templates jetzt erstellen
                    </>
                  )}
                </Button>
              </>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-3 p-6 bg-green-500/10 rounded-lg">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                  <div>
                    <div className="text-lg font-semibold text-green-600">
                      Erfolgreich abgeschlossen!
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {result?.message}
                    </div>
                  </div>
                </div>

                {result?.breakdown && (
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="p-4 bg-blue-500/10 rounded-lg">
                      <div className="text-3xl font-bold text-blue-600">{result.breakdown.ads}</div>
                      <div className="text-sm text-muted-foreground">Ads erstellt</div>
                    </div>
                    <div className="p-4 bg-pink-500/10 rounded-lg">
                      <div className="text-3xl font-bold text-pink-600">{result.breakdown.stories}</div>
                      <div className="text-sm text-muted-foreground">Stories erstellt</div>
                    </div>
                    <div className="p-4 bg-purple-500/10 rounded-lg">
                      <div className="text-3xl font-bold text-purple-600">{result.breakdown.reels}</div>
                      <div className="text-sm text-muted-foreground">Reels erstellt</div>
                    </div>
                  </div>
                )}

                <Button 
                  onClick={() => window.location.href = '/content-studio'}
                  size="lg"
                  className="w-full"
                >
                  Zu Content Studio →
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle>Nächste Schritte</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <div>1. Templates wurden in die content_templates Tabelle eingefügt</div>
            <div>2. Alle Templates sind öffentlich verfügbar (is_public = true)</div>
            <div>3. Featured Templates werden zuerst angezeigt</div>
            <div>4. User können jetzt Videos mit diesen Templates erstellen</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
