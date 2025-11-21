import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useABTesting, ABTest, ABTestResults } from "@/hooks/useABTesting";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play, Pause, CheckCircle, TrendingUp, Trophy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ABTestManagerProps {
  templateId: string;
}

export function ABTestManager({ templateId }: ABTestManagerProps) {
  const { toast } = useToast();
  const { tests, loading, createTest, getTestResults, startTest, pauseTest, completeTest, fetchActiveTests } = useABTesting();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedTest, setSelectedTest] = useState<ABTest | null>(null);
  const [testResults, setTestResults] = useState<ABTestResults | null>(null);
  const [loadingResults, setLoadingResults] = useState(false);

  // Form state
  const [testName, setTestName] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [variantAName, setVariantAName] = useState('Original');
  const [variantBName, setVariantBName] = useState('Variant B');
  const [targetSampleSize, setTargetSampleSize] = useState(1000);

  const handleCreateTest = async () => {
    if (!testName) {
      toast({
        title: "Fehler",
        description: "Bitte geben Sie einen Test-Namen ein",
        variant: "destructive",
      });
      return;
    }

    const result = await createTest({
      template_id: templateId,
      test_name: testName,
      hypothesis,
      variant_a_config: { name: variantAName, template_id: templateId },
      variant_b_config: { name: variantBName, template_id: templateId },
      target_sample_size: targetSampleSize,
    });

    if (result) {
      toast({
        title: "Test erstellt",
        description: "A/B Test wurde erfolgreich erstellt",
      });
      setShowCreateDialog(false);
      resetForm();
      fetchActiveTests(templateId);
    }
  };

  const resetForm = () => {
    setTestName('');
    setHypothesis('');
    setVariantAName('Original');
    setVariantBName('Variant B');
    setTargetSampleSize(1000);
  };

  const handleStartTest = async (testId: string) => {
    const success = await startTest(testId);
    if (success) {
      toast({
        title: "Test gestartet",
        description: "A/B Test wurde gestartet",
      });
      fetchActiveTests(templateId);
    }
  };

  const handlePauseTest = async (testId: string) => {
    const success = await pauseTest(testId);
    if (success) {
      toast({
        title: "Test pausiert",
        description: "A/B Test wurde pausiert",
      });
      fetchActiveTests(templateId);
    }
  };

  const handleCompleteTest = async (testId: string, winnerVariant?: string) => {
    const success = await completeTest(testId, winnerVariant);
    if (success) {
      toast({
        title: "Test abgeschlossen",
        description: "A/B Test wurde abgeschlossen",
      });
      fetchActiveTests(templateId);
    }
  };

  const handleViewResults = async (test: ABTest) => {
    setSelectedTest(test);
    setLoadingResults(true);
    const results = await getTestResults(test.id);
    setTestResults(results);
    setLoadingResults(false);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>A/B Testing Manager</CardTitle>
              <CardDescription>Erstelle und verwalte A/B Tests für deine Templates</CardDescription>
            </div>
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button>
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Neuer Test
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Neuen A/B Test erstellen</DialogTitle>
                  <DialogDescription>
                    Erstelle einen neuen Test um verschiedene Varianten zu vergleichen
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="testName">Test Name</Label>
                    <Input
                      id="testName"
                      value={testName}
                      onChange={(e) => setTestName(e.target.value)}
                      placeholder="z.B. Header Text Test"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hypothesis">Hypothese (Optional)</Label>
                    <Textarea
                      id="hypothesis"
                      value={hypothesis}
                      onChange={(e) => setHypothesis(e.target.value)}
                      placeholder="z.B. Ein kürzerer Header wird die Conversion-Rate erhöhen"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="variantA">Variante A (Original)</Label>
                      <Input
                        id="variantA"
                        value={variantAName}
                        onChange={(e) => setVariantAName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="variantB">Variante B</Label>
                      <Input
                        id="variantB"
                        value={variantBName}
                        onChange={(e) => setVariantBName(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sampleSize">Ziel Sample Size</Label>
                    <Input
                      id="sampleSize"
                      type="number"
                      value={targetSampleSize}
                      onChange={(e) => setTargetSampleSize(parseInt(e.target.value))}
                      min={100}
                      max={10000}
                    />
                  </div>
                  <Button onClick={handleCreateTest} className="w-full" disabled={loading}>
                    {loading ? "Erstelle..." : "Test erstellen"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : tests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Keine aktiven Tests. Erstelle einen neuen Test um zu starten.
            </div>
          ) : (
            <div className="space-y-4">
              {tests.map((test) => (
                <Card key={test.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">{test.test_name}</CardTitle>
                        {test.hypothesis && (
                          <CardDescription className="mt-1">{test.hypothesis}</CardDescription>
                        )}
                      </div>
                      <Badge variant={test.status === 'active' ? 'default' : 'secondary'}>
                        {test.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">
                        Gestartet: {test.started_at ? new Date(test.started_at).toLocaleDateString('de-DE') : 'Noch nicht gestartet'}
                      </div>
                      <div className="flex gap-2">
                        {test.status === 'draft' && (
                          <Button size="sm" onClick={() => handleStartTest(test.id)}>
                            <Play className="h-4 w-4 mr-1" />
                            Starten
                          </Button>
                        )}
                        {test.status === 'active' && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => handlePauseTest(test.id)}>
                              <Pause className="h-4 w-4 mr-1" />
                              Pausieren
                            </Button>
                            <Button size="sm" onClick={() => handleViewResults(test)}>
                              Ergebnisse
                            </Button>
                          </>
                        )}
                        {test.status === 'completed' && (
                          <Button size="sm" variant="outline" onClick={() => handleViewResults(test)}>
                            Ergebnisse anzeigen
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results Dialog */}
      {selectedTest && testResults && (
        <Dialog open={!!selectedTest} onOpenChange={() => setSelectedTest(null)}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedTest.test_name} - Ergebnisse</DialogTitle>
              <DialogDescription>
                Statistische Analyse der Test-Varianten
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              {/* Progress */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Sample Progress</span>
                  <span>{testResults.results.sample_progress.toFixed(0)}%</span>
                </div>
                <Progress value={testResults.results.sample_progress} />
              </div>

              {/* Winner Badge */}
              {testResults.results.winner && (
                <div className="flex items-center justify-center gap-2 p-4 bg-primary/10 rounded-lg">
                  <Trophy className="h-5 w-5 text-primary" />
                  <span className="font-medium">
                    Gewinner: Variante {testResults.results.winner} 
                    (+{testResults.results.winner_lift.toFixed(1)}% Improvement)
                  </span>
                </div>
              )}

              {/* Variants Comparison */}
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Variante A</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Views:</span>
                      <span className="font-medium">{testResults.results.variant_a.views}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Auswahlen:</span>
                      <span className="font-medium">{testResults.results.variant_a.selections}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Projekte:</span>
                      <span className="font-medium">{testResults.results.variant_a.creates}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Conversion Rate:</span>
                      <span className="font-bold text-lg">{testResults.results.variant_a.conversionRate.toFixed(2)}%</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Variante B</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Views:</span>
                      <span className="font-medium">{testResults.results.variant_b.views}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Auswahlen:</span>
                      <span className="font-medium">{testResults.results.variant_b.selections}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Projekte:</span>
                      <span className="font-medium">{testResults.results.variant_b.creates}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Conversion Rate:</span>
                      <span className="font-bold text-lg">{testResults.results.variant_b.conversionRate.toFixed(2)}%</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Statistical Significance */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Statistische Signifikanz</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">P-Value:</span>
                    <span className="font-medium">{testResults.results.statistical_test.pValue.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Z-Score:</span>
                    <span className="font-medium">{testResults.results.statistical_test.z.toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Signifikant (p &lt; 0.05):</span>
                    <Badge variant={testResults.results.statistical_test.isSignificant ? 'default' : 'secondary'}>
                      {testResults.results.statistical_test.isSignificant ? 'Ja' : 'Nein'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Actions */}
              {testResults.results.is_complete && selectedTest.status === 'active' && (
                <div className="flex gap-2 justify-end">
                  <Button onClick={() => handleCompleteTest(selectedTest.id, testResults.results.winner || undefined)}>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Test abschließen
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
