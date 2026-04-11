import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Instagram, 
  Linkedin, 
  Youtube, 
  Facebook,
  Calendar,
  TrendingUp,
  Sparkles,
  Info
} from 'lucide-react';
import { usePostingTimes, useSyncPostsHistory, PostingSlot } from '@/hooks/usePostingTimes';
import { HeatmapCalendarPremium } from '@/components/posting-times/HeatmapCalendarPremium';
import { TopSlotsListPremium } from '@/components/posting-times/TopSlotsListPremium';
import { PostingTimesHeroHeader } from '@/components/posting-times/PostingTimesHeroHeader';
import { Banner } from '@/components/ui/Banner';
import { toast } from 'sonner';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/useTranslation';

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
  const { t } = useTranslation();
  const [selectedPlatform, setSelectedPlatform] = useState('instagram');
  const [isSyncing, setIsSyncing] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  
  const { data, isLoading, refetch } = usePostingTimes({
    platform: selectedPlatform,
    days: 14,
  });

  const syncHistory = useSyncPostsHistory();

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await syncHistory();
      toast.success(t('postingTimes.syncSuccess'));
      refetch();
    } catch (error) {
      console.error('Sync error:', error);
      toast.error(t('postingTimes.syncError'));
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

  const platformsData = data?.platforms || {};
  const currentPlatformData = platformsData[selectedPlatform] || [];
  
  const slotsForHeatmap = currentPlatformData.reduce((acc, day) => {
    acc[day.date] = day.slots;
    return acc;
  }, {} as Record<string, PostingSlot[]>);

  const showBenchmarkBanner = data?.metadata && !data.metadata.hasHistory && !bannerDismissed;
  const dataSource = data?.metadata?.dataSource;

  return (
    <PageWrapper>
      <div className="container max-w-7xl mx-auto p-6 space-y-6">
        <PostingTimesHeroHeader
          metadata={data?.metadata}
          isSyncing={isSyncing}
          onSync={handleSync}
        />

        <AnimatePresence>
          {showBenchmarkBanner && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <Banner
                type="info"
                title={t('postingTimes.industryRecsActive')}
                dismissible
                onDismiss={() => setBannerDismissed(true)}
                action={{
                  label: t('postingTimes.syncAccounts'),
                  onClick: handleSync,
                }}
              >
                {t('postingTimes.industryRecsDesc')}
              </Banner>
            </motion.div>
          )}
        </AnimatePresence>

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
                    <div className="backdrop-blur-xl bg-card/40 border border-white/10 rounded-2xl p-6">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h2 className="text-xl font-bold flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-primary" />
                            <span className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                              {t('postingTimes.forecast14')}
                            </span>
                          </h2>
                          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                            {t('postingTimes.clickToSchedule')}
                            {dataSource === 'industry_benchmark' && (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary">
                                <Info className="w-3 h-3" />
                                {t('postingTimes.industryData')}
                              </span>
                            )}
                            {dataSource === 'blended' && (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                                <Sparkles className="w-3 h-3" />
                                {t('postingTimes.personalized')}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      <HeatmapCalendarPremium
                        slots={slotsForHeatmap}
                        platform={platform.id}
                        onSlotClick={handleSlotClick}
                      />
                    </div>

                    <div className="backdrop-blur-xl bg-card/40 border border-white/10 rounded-2xl p-6">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h2 className="text-xl font-bold flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-cyan-400" />
                            <span>{t('postingTimes.topTimesNext7')}</span>
                          </h2>
                          <p className="text-sm text-muted-foreground mt-1">
                            {t('postingTimes.best3Slots')}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30">
                          <Sparkles className="w-3 h-3 text-cyan-400" />
                          <span className="text-xs font-medium text-cyan-400">{t('postingTimes.aiOptimized')}</span>
                        </div>
                      </div>

                      <TopSlotsListPremium days={currentPlatformData} platform={platform.id} />
                    </div>
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