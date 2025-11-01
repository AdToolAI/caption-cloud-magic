import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Instagram, 
  Linkedin, 
  Youtube, 
  Facebook,
  RefreshCw,
  Calendar,
  TrendingUp,
  Clock,
  AlertCircle,
  Sparkles
} from 'lucide-react';
import { usePostingTimes, useSyncPostsHistory, PostingSlot } from '@/hooks/usePostingTimes';
import { HeatmapCalendar } from '@/components/posting-times/HeatmapCalendar';
import { TopSlotsList } from '@/components/posting-times/TopSlotsList';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { toast } from 'sonner';
import { PageWrapper } from '@/components/layout/PageWrapper';

const PLATFORMS = [
  { id: 'instagram', name: 'Instagram', icon: Instagram, color: 'text-pink-600' },
  { id: 'tiktok', name: 'TikTok', icon: Facebook, color: 'text-black' }, // TikTok icon placeholder
  { id: 'linkedin', name: 'LinkedIn', icon: Linkedin, color: 'text-blue-600' },
  { id: 'x', name: 'X', icon: Facebook, color: 'text-gray-900' }, // X icon placeholder
  { id: 'facebook', name: 'Facebook', icon: Facebook, color: 'text-blue-700' },
  { id: 'youtube', name: 'YouTube', icon: Youtube, color: 'text-red-600' },
];

export default function PostingTimes() {
  const navigate = useNavigate();
  const [selectedPlatform, setSelectedPlatform] = useState('instagram');
  const [isSyncing, setIsSyncing] = useState(false);
  
  const { data, isLoading, refetch } = usePostingTimes({
    platform: selectedPlatform,
    days: 14,
  });

  const syncHistory = useSyncPostsHistory();

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await syncHistory();
      toast.success('Posts synchronisiert');
      refetch();
    } catch (error) {
      console.error('Sync error:', error);
      toast.error('Fehler beim Synchronisieren');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSlotClick = (slot: PostingSlot) => {
    navigate('/calendar', {
      state: {
        prefillTime: slot.start,
        platform: selectedPlatform,
        source: 'posting-times'
      }
    });
  };

  // Transform data for HeatmapCalendar
  const slotsForHeatmap = data?.platforms[selectedPlatform]?.reduce((acc, day) => {
    acc[day.date] = day.slots;
    return acc;
  }, {} as Record<string, PostingSlot[]>) || {};

  const platformData = data?.platforms[selectedPlatform] || [];

  return (
    <PageWrapper>
      <div className="container max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">Beste Posting-Zeiten</h1>
              <Badge variant="secondary" className="gap-1">
                <Sparkles className="w-3 h-3" />
                Live-Prognose
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Basierend auf deiner Performance-Historie und Plattform-Peaks
            </p>
          </div>

          <div className="flex items-center gap-2">
            {data?.metadata && (
              <div className="text-right text-xs text-muted-foreground">
                <div>Aktualisiert: {format(new Date(data.metadata.generatedAt), 'HH:mm', { locale: de })}</div>
                {data.metadata.hasHistory && (
                  <div>{data.metadata.historyDays} Tage Historie</div>
                )}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={isSyncing}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
              Sync
            </Button>
          </div>
        </div>

        {/* Status Alert */}
        {data?.metadata && !data.metadata.hasHistory && (
          <Alert>
            <AlertCircle className="w-4 h-4" />
            <AlertDescription>
              <div className="flex items-center justify-between">
                <div>
                  <strong>Noch keine Historie</strong> – Empfehlungen basieren auf Branchen-Durchschnitten.
                  Verbinde deine Accounts für personalisierte Zeiten.
                </div>
                <Button variant="outline" size="sm" onClick={handleSync}>
                  Jetzt synchronisieren
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Platform Tabs */}
        <Tabs value={selectedPlatform} onValueChange={setSelectedPlatform}>
          <TabsList className="grid grid-cols-6 w-full max-w-3xl">
            {PLATFORMS.map((platform) => {
              const Icon = platform.icon;
              return (
                <TabsTrigger key={platform.id} value={platform.id} className="gap-2">
                  <Icon className={`w-4 h-4 ${platform.color}`} />
                  <span className="hidden sm:inline">{platform.name}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {PLATFORMS.map((platform) => (
            <TabsContent key={platform.id} value={platform.id} className="space-y-6">
              {isLoading ? (
                <Card>
                  <CardHeader>
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-4 w-96" />
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {Array.from({ length: 2 }).map((_, i) => (
                        <Skeleton key={i} className="h-32 w-full" />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Heatmap Calendar */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <TrendingUp className="w-5 h-5" />
                            14-Tage-Prognose
                          </CardTitle>
                          <CardDescription>
                            Klicke auf eine Zeit, um direkt im Kalender zu planen
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {platformData.length > 0 ? (
                        <HeatmapCalendar
                          slots={slotsForHeatmap}
                          platform={platform.id}
                          onSlotClick={handleSlotClick}
                        />
                      ) : (
                        <div className="text-center py-12">
                          <Clock className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                          <h3 className="text-lg font-semibold mb-2">
                            Noch keine Daten verfügbar
                          </h3>
                          <p className="text-muted-foreground mb-4">
                            Synchronisiere deine Posts, um Empfehlungen zu erhalten
                          </p>
                          <Button onClick={handleSync} disabled={isSyncing}>
                            <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                            Jetzt synchronisieren
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Top Slots List */}
                  {platformData.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Calendar className="w-5 h-5" />
                          Top-Zeiten der nächsten 7 Tage
                        </CardTitle>
                        <CardDescription>
                          Die besten 3 Zeitfenster pro Tag
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <TopSlotsList days={platformData} platform={platform.id} />
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </PageWrapper>
  );
}
