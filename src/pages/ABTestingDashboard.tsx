import { dateFnsLocale } from '@/lib/uiLocale';
import { Footer } from '@/components/Footer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, CheckCircle2, Loader2 } from 'lucide-react';
import { useABTests } from '@/hooks/useABTests';
import { CreateTestDialog } from '@/components/abtesting/CreateTestDialog';
import { CreateVariantDialog } from '@/components/abtesting/CreateVariantDialog';
import { TestVariantCard } from '@/components/abtesting/TestVariantCard';
import { TestPerformanceComparison } from '@/components/abtesting/TestPerformanceComparison';
import { format } from 'date-fns';
import { tx } from '@/lib/i18nText';

export default function ABTestingDashboard() {
  const { tests, loading, createTest, createVariant, startTest, stopTest, declareWinner } = useABTests();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
        <Footer />
      </div>
    );
  }

  const activeTests = tests.filter(t => t.status === 'running');
  const draftTests = tests.filter(t => t.status === 'draft');
  const completedTests = tests.filter(t => t.status === 'completed');

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">🧪 A/B Testing Dashboard</h1>
            <p className="text-muted-foreground">
              {tx({ de: 'Erstelle und analysiere A/B Tests für deine Video-Content-Varianten', en: 'Create and analyze A/B tests for your video content variants', es: 'Crea y analiza pruebas A/B para tus variantes de contenido de video' })}
            </p>
          </div>
          <CreateTestDialog onCreateTest={createTest} />
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-1">{tx({ de: 'Gesamt Tests', en: 'Total tests', es: 'Total de pruebas' })}</p>
            <p className="text-3xl font-bold">{tests.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-1">{tx({ de: 'Aktive Tests', en: 'Active tests', es: 'Pruebas activas' })}</p>
            <p className="text-3xl font-bold text-success">{activeTests.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-1">{tx({ de: 'Entwürfe', en: 'Drafts', es: 'Borradores' })}</p>
            <p className="text-3xl font-bold text-muted-foreground">{draftTests.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-1">{tx({ de: 'Abgeschlossen', en: 'Completed', es: 'Completadas' })}</p>
            <p className="text-3xl font-bold">{completedTests.length}</p>
          </Card>
        </div>

        <Tabs defaultValue="active" className="space-y-6">
          <TabsList>
            <TabsTrigger value="active">{tx({ de: 'Aktive Tests', en: 'Active tests', es: 'Pruebas activas' })} ({activeTests.length})</TabsTrigger>
            <TabsTrigger value="drafts">{tx({ de: 'Entwürfe', en: 'Drafts', es: 'Borradores' })} ({draftTests.length})</TabsTrigger>
            <TabsTrigger value="completed">{tx({ de: 'Abgeschlossen', en: 'Completed', es: 'Completadas' })} ({completedTests.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            {activeTests.length === 0 ? (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground">{tx({ de: 'Keine aktiven Tests', en: 'No active tests', es: 'No hay pruebas activas' })}</p>
              </Card>
            ) : (
              <div className="space-y-6">
                {activeTests.map(test => (
                  <Card key={test.id} className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <h2 className="text-2xl font-bold">{test.test_name}</h2>
                          <Badge variant="default">{tx({ de: 'Läuft', en: 'Running', es: 'En curso' })}</Badge>
                        </div>
                        {test.hypothesis && (
                          <p className="text-sm text-muted-foreground mb-2">
                            💡 {tx({ de: 'Hypothese', en: 'Hypothesis', es: 'Hipótesis' })}: {test.hypothesis}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {tx({ de: 'Gestartet', en: 'Started', es: 'Iniciado' })}: {test.started_at && format(new Date(test.started_at), 'dd.MM.yyyy HH:mm', { locale: dateFnsLocale() })}
                        </p>
                      </div>
                      <Button variant="outline" onClick={() => stopTest(test.id)}>
                        <Pause className="h-4 w-4 mr-2" />
                        {tx({ de: 'Test beenden', en: 'End test', es: 'Finalizar prueba' })}
                      </Button>
                    </div>

                    {test.variants.length > 0 && (
                      <>
                        <TestPerformanceComparison 
                          variants={test.variants}
                          targetMetric={test.target_metric || 'engagement_rate'}
                        />

                        <div className="mt-6 grid grid-cols-2 gap-4">
                          {test.variants.map(variant => (
                            <TestVariantCard
                              key={variant.id}
                              variant={variant}
                              isWinner={test.winner_variant_id === variant.id}
                              onDeclareWinner={() => declareWinner(test.id, variant.id)}
                              showActions={true}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="drafts">
            {draftTests.length === 0 ? (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground">{tx({ de: 'Keine Entwürfe vorhanden', en: 'No drafts available', es: 'No hay borradores disponibles' })}</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {draftTests.map(test => (
                  <Card key={test.id} className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="text-xl font-semibold mb-1">{test.test_name}</h3>
                        {test.hypothesis && (
                          <p className="text-sm text-muted-foreground">💡 {test.hypothesis}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <CreateVariantDialog testId={test.id} onCreateVariant={createVariant} />
                        <Button 
                          onClick={() => startTest(test.id)}
                          disabled={test.variants.length < 2}
                        >
                          <Play className="h-4 w-4 mr-2" />
                          {tx({ de: 'Test starten', en: 'Start test', es: 'Iniciar prueba' })}
                        </Button>
                      </div>
                    </div>

                    {test.variants.length === 0 ? (
                      <div className="p-6 border-2 border-dashed rounded-lg text-center text-muted-foreground">
                        {tx({ de: 'Füge mindestens 2 Varianten hinzu um den Test zu starten', en: 'Add at least 2 variants to start the test', es: 'Añade al menos 2 variantes para iniciar la prueba' })}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        {test.variants.map(variant => (
                          <TestVariantCard key={variant.id} variant={variant} />
                        ))}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="completed">
            {completedTests.length === 0 ? (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground">{tx({ de: 'Keine abgeschlossenen Tests', en: 'No completed tests', es: 'No hay pruebas completadas' })}</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {completedTests.map(test => {
                  const winner = test.variants.find(v => v.id === test.winner_variant_id);
                  
                  return (
                    <Card key={test.id} className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-xl font-semibold">{test.test_name}</h3>
                            <Badge variant="secondary">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              {tx({ de: 'Abgeschlossen', en: 'Completed', es: 'Completada' })}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {tx({ de: 'Beendet', en: 'Ended', es: 'Finalizada' })}: {test.ended_at && format(new Date(test.ended_at), 'dd.MM.yyyy HH:mm', { locale: dateFnsLocale() })}
                          </p>
                          {winner && (
                            <p className="text-sm mt-2">
                              🏆 Winner: <span className="font-semibold">{winner.variant_name}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        {test.variants.map(variant => (
                          <TestVariantCard
                            key={variant.id}
                            variant={variant}
                            isWinner={test.winner_variant_id === variant.id}
                          />
                        ))}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <Footer />
    </div>
  );
}
