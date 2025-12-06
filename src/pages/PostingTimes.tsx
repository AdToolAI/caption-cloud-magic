import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
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
import { HeatmapCalendarPremium } from '@/components/posting-times/HeatmapCalendarPremium';
import { TopSlotsListPremium } from '@/components/posting-times/TopSlotsListPremium';
import { PostingTimesHeroHeader } from '@/components/posting-times/PostingTimesHeroHeader';
import { toast } from 'sonner';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { cn } from '@/lib/utils';

const PLATFORMS = [
  { id: 'instagram', name: 'Instagram', icon: Instagram, color: 'text-pink-500' },
  { id: 'tiktok', name: 'TikTok', icon: Facebook, color: 'text-foreground' },
  { id: 'linkedin', name: 'LinkedIn', icon: Linkedin, color: 'text-blue-500' },
  { id: 'x', name: 'X', icon: Facebook, color: 'text-foreground' },
  { id: 'facebook', name: 'Facebook', icon: Facebook, color: 'text-blue-600' },
  { id: 'youtube', name: 'YouTube', icon: Youtube, color: 'text-red-500' },
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

  // Safe access with null checks
  const platformsData = data?.platforms || {};
  const currentPlatformData = platformsData[selectedPlatform] || [];
  
  // Transform data for HeatmapCalendar
  const slotsForHeatmap = currentPlatformData.reduce((acc, day) => {
    acc[day.date] = day.slots;
    return acc;
  }, {} as Record<string, PostingSlot[]>);

  const platformData = currentPlatformData;

  return (
    <PageWrapper>
      <div className="container max-w-7xl mx-auto p-6 space-y-6">
        {/* Hero Header */}
        <PostingTimesHeroHeader
          metadata={data?.metadata}
          isSyncing={isSyncing}
          onSync={handleSync}
        />

        {/* Status Alert */}
        <AnimatePresence>
          {data?.metadata && !data.metadata.hasHistory && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <Alert className="backdrop-blur-xl bg-amber-500/10 border-amber-500/30">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                <AlertDescription>
                  <div className="flex items-center justify-between">
                    <div>
                      <strong className="text-amber-500">Noch keine Historie</strong>
                      <span className="text-muted-foreground ml-2">
                        – Empfehlungen basieren auf Branchen-Durchschnitten.
                      </span>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleSync}
                      className="border-amber-500/30 hover:bg-amber-500/10"
                    >
                      Jetzt synchronisieren
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Platform Tabs - Premium Style */}
        <Tabs value={selectedPlatform} onValueChange={setSelectedPlatform}>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <TabsList className="h-auto p-1.5 backdrop-blur-xl bg-card/40 border border-white/10 rounded-xl grid grid-cols-6 gap-1">
              {PLATFORMS.map((platform) => {
                const Icon = platform.icon;
                const isActive = selectedPlatform === platform.id;
                
                return (
                  <TabsTrigger 
                    key={platform.id} 
                    value={platform.id} 
                    className={cn(
                      "gap-2 py-3 rounded-lg transition-all duration-300 data-[state=active]:shadow-none",
                      isActive && "bg-primary/20 border border-primary/30 shadow-[0_0_15px_rgba(245,199,106,0.2)]"
                    )}
                  >
                    <Icon className={cn("w-4 h-4", isActive ? "text-primary" : platform.color)} />
                    <span className={cn(
                      "hidden sm:inline font-medium",
                      isActive && "text-primary"
                    )}>
                      {platform.name}
                    </span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </motion.div>

          <AnimatePresence mode="wait">
            {PLATFORMS.map((platform) => (
              <TabsContent key={platform.id} value={platform.id} className="space-y-6 mt-6">
                {isLoading ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-6"
                  >
                    <div className="backdrop-blur-xl bg-card/40 border border-white/10 rounded-2xl p-6">
                      <Skeleton className="h-6 w-48 mb-4" />
                      <div className="grid grid-cols-7 gap-3">
                        {Array.from({ length: 14 }).map((_, i) => (
                          <Skeleton key={i} className="h-32 rounded-xl" />
                        ))}
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key={platform.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="space-y-6"
                  >
                    {/* Heatmap Calendar */}
                    <div className="backdrop-blur-xl bg-card/40 border border-white/10 rounded-2xl p-6">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h2 className="text-xl font-bold flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-primary" />
                            <span className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                              14-Tage-Prognose
                            </span>
                          </h2>
                          <p className="text-sm text-muted-foreground mt-1">
                            Klicke auf eine Zeit, um direkt im Kalender zu planen
                          </p>
                        </div>
                      </div>

                      {platformData.length > 0 ? (
                        <HeatmapCalendarPremium
                          slots={slotsForHeatmap}
                          platform={platform.id}
                          onSlotClick={handleSlotClick}
                        />
                      ) : (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="text-center py-16 backdrop-blur-md bg-muted/10 rounded-xl border border-white/5"
                        >
                          <motion.div
                            animate={{ rotate: [0, 10, -10, 0] }}
                            transition={{ repeat: Infinity, duration: 4 }}
                          >
                            <Clock className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
                          </motion.div>
                          <h3 className="text-lg font-semibold mb-2">
                            Noch keine Daten verfügbar
                          </h3>
                          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                            Synchronisiere deine Posts, um personalisierte Empfehlungen zu erhalten
                          </p>
                          <Button 
                            onClick={handleSync} 
                            disabled={isSyncing}
                            className="gap-2 bg-gradient-to-r from-primary to-primary/80 shadow-[0_0_20px_rgba(245,199,106,0.3)]"
                          >
                            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                            Jetzt synchronisieren
                          </Button>
                        </motion.div>
                      )}
                    </div>

                    {/* Top Slots List */}
                    {platformData.length > 0 && (
                      <div className="backdrop-blur-xl bg-card/40 border border-white/10 rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-6">
                          <div>
                            <h2 className="text-xl font-bold flex items-center gap-2">
                              <Calendar className="w-5 h-5 text-cyan-400" />
                              <span>Top-Zeiten der nächsten 7 Tage</span>
                            </h2>
                            <p className="text-sm text-muted-foreground mt-1">
                              Die besten 3 Zeitfenster pro Tag
                            </p>
                          </div>
                          <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30">
                            <Sparkles className="w-3 h-3 text-cyan-400" />
                            <span className="text-xs font-medium text-cyan-400">KI-optimiert</span>
                          </div>
                        </div>

                        <TopSlotsListPremium days={platformData} platform={platform.id} />
                      </div>
                    )}
                  </motion.div>
                )}
              </TabsContent>
            ))}
          </AnimatePresence>
        </Tabs>
      </div>
    </PageWrapper>
  );
}