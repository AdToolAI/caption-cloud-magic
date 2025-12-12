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
import { de } from 'date-fns/locale';

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
              Erstelle und analysiere A/B Tests für deine Video-Content-Varianten
            </p>
          </div>
          <CreateTestDialog onCreateTest={createTest} />
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-1">Gesamt Tests</p>
            <p className="text-3xl font-bold">{tests.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-1">Aktive Tests</p>
            <p className="text-3xl font-bold text-success">{activeTests.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-1">Entwürfe</p>
            <p className="text-3xl font-bold text-muted-foreground">{draftTests.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-1">Abgeschlossen</p>
            <p className="text-3xl font-bold">{completedTests.length}</p>
          </Card>
        </div>

        <Tabs defaultValue="active" className="space-y-6">
          <TabsList>
            <TabsTrigger value="active">Aktive Tests ({activeTests.length})</TabsTrigger>
            <TabsTrigger value="drafts">Entwürfe ({draftTests.length})</TabsTrigger>
            <TabsTrigger value="completed">Abgeschlossen ({completedTests.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            {activeTests.length === 0 ? (
              <Card className="p-12 text-center">
                <p className="text-muted-foreground">Keine aktiven Tests</p>
              </Card>
            ) : (
              <div className="space-y-6">
                {activeTests.map(test => (
                  <Card key={test.id} className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <h2 className="text-2xl font-bold">{test.test_name}</h2>
                          <Badge variant="default">Läuft</Badge>
                        </div>
                        {test.hypothesis && (
                          <p className="text-sm text-muted-foreground mb-2">
                            💡 Hypothese: {test.hypothesis}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Gestartet: {test.started_at && format(new Date(test.started_at), 'dd.MM.yyyy HH:mm', { locale: de })}
                        </p>
                      </div>
                      <Button variant="outline" onClick={() => stopTest(test.id)}>
                        <Pause className="h-4 w-4 mr-2" />
                        Test beenden
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
                <p className="text-muted-foreground">Keine Entwürfe vorhanden</p>
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
                          Test starten
                        </Button>
                      </div>
                    </div>

                    {test.variants.length === 0 ? (
                      <div className="p-6 border-2 border-dashed rounded-lg text-center text-muted-foreground">
                        Füge mindestens 2 Varianten hinzu um den Test zu starten
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
                <p className="text-muted-foreground">Keine abgeschlossenen Tests</p>
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
                              Abgeschlossen
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Beendet: {test.ended_at && format(new Date(test.ended_at), 'dd.MM.yyyy HH:mm', { locale: de })}
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
