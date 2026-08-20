import { tx } from "@/lib/i18nText";
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
import { uiLocale } from '@/lib/uiLocale';

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
        title: tx({ de: "Fehler", en: "Mistake", es: "Error" }),
        description: tx({ de: "Bitte geben Sie einen Test-Namen ein", en: "Please enter a test name", es: "Por favor, introduce un nombre para la prueba" }),
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
        title: tx({ de: "Test erstellt", en: "Test created", es: "Prueba creada" }),
        description: tx({ de: "A/B Test wurde erfolgreich erstellt", en: "A/B test successfully created", es: "Prueba A/B creada con éxito" }),
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
        title: tx({ de: "Test gestartet", en: "Test started", es: "Prueba iniciada" }),
        description: tx({ de: "A/B Test wurde gestartet", en: "A/B Test started", es: "Prueba A/B iniciada" }),
      });
      fetchActiveTests(templateId);
    }
  };

  const handlePauseTest = async (testId: string) => {
    const success = await pauseTest(testId);
    if (success) {
      toast({
        title: tx({ de: "Test pausiert", en: "Test paused", es: "Prueba pausada" }),
        description: tx({ de: "A/B Test wurde pausiert", en: "A/B test was paused", es: "La prueba A/B se pausó" }),
      });
      fetchActiveTests(templateId);
    }
  };

  const handleCompleteTest = async (testId: string, winnerVariant?: string) => {
    const success = await completeTest(testId, winnerVariant);
    if (success) {
      toast({
        title: tx({ de: "Test abgeschlossen", en: "Test completed", es: "Prueba completada" }),
        description: tx({ de: "A/B Test wurde abgeschlossen", en: "A/B Test completed", es: "Prueba A/B completada" }),
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
              <CardDescription>{tx({ de: "Erstelle und verwalte A/B Tests für deine Templates", en: "Create and manage A/B tests for your templates", es: "Crea y gestiona pruebas A/B para tus plantillas" })}</CardDescription>
            </div>
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button>
                  <TrendingUp className="h-4 w-4 mr-2" />
                  {tx({ de: 'Neuer Test', en: 'New test', es: 'Nueva prueba' })}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{tx({ de: "Neuen A/B Test erstellen", en: "Create a new A/B test", es: "Crear una nueva prueba A/B" })}</DialogTitle>
                  <DialogDescription>
                    {tx({ de: "Erstelle einen neuen Test um verschiedene Varianten zu vergleichen", en: "Create a new test to compare different variants", es: "Crea una nueva prueba para comparar diferentes variantes" })}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="testName">{tx({ de: "Testname", en: "Test Name", es: "Nombre de la prueba" })}</Label>
                    <Input
                      id="testName"
                      value={testName}
                      onChange={(e) => setTestName(e.target.value)}
                      placeholder={tx({ de: "z.B. Header Text Test", en: "e.g. Header Text Test", es: "p. ej. Prueba de texto de encabezado" })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hypothesis">{tx({ de: "Hypothese (Optional)", en: "Hypothesis (Optional)", es: "Hipótesis (Opcional)" })}</Label>
                    <Textarea
                      id="hypothesis"
                      value={hypothesis}
                      onChange={(e) => setHypothesis(e.target.value)}
                      placeholder={tx({ de: "z.B. Ein kürzerer Header wird die Conversion-Rate erhöhen", en: "e.g. A shorter header will increase the conversion rate", es: "p. ej. Un encabezado más corto aumentará la tasa de conversión" })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="variantA">{tx({ de: "Variante A (Original)", en: "Variant A (Original)", es: "Variante A (Original)" })}</Label>
                      <Input
                        id="variantA"
                        value={variantAName}
                        onChange={(e) => setVariantAName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="variantB">{tx({ de: "Variante B", en: "Variant B", es: "Variante B" })}</Label>
                      <Input
                        id="variantB"
                        value={variantBName}
                        onChange={(e) => setVariantBName(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sampleSize">{tx({ de: "Ziel Sample Size", en: "Target Sample Size", es: "Tamaño de muestra objetivo" })}</Label>
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
                    {loading ? tx({ de: "Erstelle...", en: "Creating...", es: "Creando..." }) : tx({ de: "Test erstellen", en: "Create test", es: "Crear prueba" })}
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
              {tx({ de: "Keine aktiven Tests. Erstelle einen neuen Test um zu starten.", en: "No active tests. Create a new test to start.", es: "No hay pruebas activas. Crea una nueva prueba para empezar." })}
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
                        Gestartet: {test.started_at ? new Date(test.started_at).toLocaleDateString(uiLocale()) : tx({ de: 'Noch nicht gestartet', en: 'Not started yet', es: 'Aún no iniciado' })}
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
                {tx({ de: "Statistische Analyse der Test-Varianten", en: "Statistical analysis of test variants", es: "Análisis estadístico de las variantes de prueba" })}
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
                    {tx({
                      de: `Gewinner: Variante ${testResults.results.winner} (+${testResults.results.winner_lift.toFixed(1)}% Verbesserung)`,
                      en: `Winner: Variant ${testResults.results.winner} (+${testResults.results.winner_lift.toFixed(1)}% improvement)`,
                      es: `Ganador: Variante ${testResults.results.winner} (+${testResults.results.winner_lift.toFixed(1)}% de mejora)`,
                    })}
                  </span>
                </div>
              )}

              {/* Variants Comparison */}
              <div className="grid md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{tx({ de: "Variante A", en: "Variant A", es: "Variante A" })}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Views:</span>
                      <span className="font-medium">{testResults.results.variant_a.views}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">{tx({ de: "Auswahlen:", en: "Selections:", es: "Selecciones:" })}</span>
                      <span className="font-medium">{testResults.results.variant_a.selections}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">{tx({ de: "Projekte:", en: "Projects:", es: "Proyectos:" })}</span>
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
                    <CardTitle className="text-base">{tx({ de: "Variante B", en: "Variant B", es: "Variante B" })}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Views:</span>
                      <span className="font-medium">{testResults.results.variant_b.views}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">{tx({ de: "Auswahlen:", en: "Selections:", es: "Selecciones:" })}</span>
                      <span className="font-medium">{testResults.results.variant_b.selections}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">{tx({ de: "Projekte:", en: "Projects:", es: "Proyectos:" })}</span>
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
                    {tx({ de: "Test abschließen", en: "Complete test", es: "Completar prueba" })}
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
