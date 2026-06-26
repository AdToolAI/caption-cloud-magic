import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSocialPublishing, Platform } from '@/hooks/useSocialPublishing';
import { useScheduledPublishing } from '@/hooks/useScheduledPublishing';
import { usePlatformCredentials } from '@/hooks/usePlatformCredentials';
import { PlatformOptimizationHelper } from '@/components/publishing/PlatformOptimizationHelper';
import { CrossPostMagicPanel } from './CrossPostMagicPanel';
import { Instagram, Music, Linkedin, Youtube, Clock, Send, CalendarIcon, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { es } from 'date-fns/locale';
import { enUS } from 'date-fns/locale';
import { useTranslation } from '@/hooks/useTranslation';

interface PublishToSocialTabProps {
  videoUrl: string;
  videoId?: string;
  briefingPlan?: unknown;
  briefingText?: string;
  defaultCaption?: string;
  defaultHashtags?: string[];
  onPublished?: () => void;
}

export function PublishToSocialTab({ videoUrl, videoId, briefingPlan, briefingText, defaultCaption = '', defaultHashtags = [], onPublished }: PublishToSocialTabProps) {
  const { t, language } = useTranslation();
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);
  const [caption, setCaption] = useState(defaultCaption);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [hashtags, setHashtags] = useState(defaultHashtags.join(' '));
  const [publishMode, setPublishMode] = useState<'now' | 'schedule'>('now');
  const [scheduledDate, setScheduledDate] = useState<Date>();
  const [scheduledTime, setScheduledTime] = useState('12:00');
  const [magicMode, setMagicMode] = useState<boolean>(Boolean(briefingPlan || briefingText));

  const { publishToMultiplePlatforms, publishing } = useSocialPublishing();
  const { schedulePublication, loading: scheduling } = useScheduledPublishing();
  const { isConnected } = usePlatformCredentials();

  const dateLocale = language === 'de' ? de : language === 'es' ? es : enUS;

  const platforms = [
    { id: 'instagram' as Platform, name: 'Instagram', icon: Instagram, color: 'text-pink-500' },
    { id: 'tiktok' as Platform, name: 'TikTok', icon: Music, color: 'text-black dark:text-white' },
    { id: 'linkedin' as Platform, name: 'LinkedIn', icon: Linkedin, color: 'text-blue-600' },
    { id: 'youtube' as Platform, name: 'YouTube', icon: Youtube, color: 'text-red-600' },
  ];

  const togglePlatform = (platform: Platform) => {
    setSelectedPlatforms(prev => prev.includes(platform) ? prev.filter(p => p !== platform) : [...prev, platform]);
  };

  const handlePublish = async () => {
    if (selectedPlatforms.length === 0) return;
    const hashtagArray = hashtags.split(/[\s,]+/).filter(h => h.startsWith('#')).map(h => h.slice(1));

    if (publishMode === 'schedule' && scheduledDate) {
      const [hours, minutes] = scheduledTime.split(':');
      const publishAt = new Date(scheduledDate);
      publishAt.setHours(parseInt(hours), parseInt(minutes));
      await Promise.all(selectedPlatforms.map(platform => schedulePublication({ platform, videoUrl, caption, title, description, hashtags: hashtagArray, publishAt })));
    } else {
      await publishToMultiplePlatforms({ videoUrl, caption, title, description, hashtags: hashtagArray }, selectedPlatforms);
    }
    onPublished?.();
  };

  const handleMagicPublishAll = async (perChannel: Record<Platform, { caption: string; hashtags: string[]; title?: string; description?: string; tags?: string[] }>) => {
    if (selectedPlatforms.length === 0) return;
    await publishToMultiplePlatforms(
      { videoUrl, caption, title, description, hashtags: [] },
      selectedPlatforms,
      Object.fromEntries(
        selectedPlatforms.map((p) => [p, { ...perChannel[p], videoUrl }])
      ) as Partial<Record<Platform, { videoUrl: string; caption: string; hashtags: string[]; title?: string; description?: string; tags?: string[] }>>,
    );
    onPublished?.();
  };

  const isPublishing = Object.values(publishing).some(v => v) || scheduling;
  const canPublish = selectedPlatforms.length > 0 && !isPublishing;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">{t('composer.selectPlatforms')}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {platforms.map(platform => {
            const Icon = platform.icon;
            const connected = isConnected(platform.id);
            return (
              <div key={platform.id} className={`relative p-4 rounded-lg border-2 transition-all cursor-pointer ${selectedPlatforms.includes(platform.id) ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'} ${!connected ? 'opacity-50' : ''}`} onClick={() => connected && togglePlatform(platform.id)}>
                <div className="flex items-center gap-3">
                  <Checkbox checked={selectedPlatforms.includes(platform.id)} disabled={!connected} />
                  <Icon className={`h-5 w-5 ${platform.color}`} />
                  <span className="font-medium">{platform.name}</span>
                </div>
                {!connected && <span className="absolute top-2 right-2 text-xs text-muted-foreground">{t('composer.notConnected')}</span>}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Cross-Post Magic toggle */}
      <Card className="p-4 border-[#F5C76A]/30 bg-gradient-to-r from-[#1a1208]/40 via-black/30 to-[#1a1208]/40">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-gradient-to-br from-[#F5C76A] to-[#b8862f] text-black">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Cross-Post Magic</div>
              <div className="text-xs text-muted-foreground">KI-optimierte Caption pro Plattform · 1 Klick veröffentlichen</div>
            </div>
          </div>
          <Switch checked={magicMode} onCheckedChange={setMagicMode} />
        </div>
      </Card>

      {magicMode ? (
        <CrossPostMagicPanel
          videoId={videoId}
          videoUrl={videoUrl}
          briefingPlan={briefingPlan}
          briefingText={briefingText}
          language={language}
          selectedChannels={selectedPlatforms}
          onPublishAll={handleMagicPublishAll}
          publishing={isPublishing}
        />
      ) : (
        <Card className="p-6 space-y-4">
          <div>
            <Label htmlFor="title">{t('composer.titleYoutube')}</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('composer.titleYoutubePlaceholder')} maxLength={100} />
          </div>
          <div>
            <Label htmlFor="caption">Caption</Label>
            <Textarea id="caption" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder={t('composer.captionPlaceholder')} rows={4} />
          </div>
          <div>
            <Label htmlFor="description">{t('composer.descYoutube')}</Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('composer.descYoutubePlaceholder')} rows={3} />
          </div>
          <div>
            <Label htmlFor="hashtags">Hashtags</Label>
            <Input id="hashtags" value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#hashtag1 #hashtag2 #hashtag3" />
          </div>
        </Card>
      )}

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">{t('composer.publication')}</h3>
        <div className="flex gap-4 mb-4">
          <Button variant={publishMode === 'now' ? 'default' : 'outline'} onClick={() => setPublishMode('now')} className="flex-1">
            <Send className="mr-2 h-4 w-4" />{t('composer.publishImmediately')}
          </Button>
          <Button variant={publishMode === 'schedule' ? 'default' : 'outline'} onClick={() => setPublishMode('schedule')} className="flex-1">
            <Clock className="mr-2 h-4 w-4" />{t('composer.schedule')}
          </Button>
        </div>

        {publishMode === 'schedule' && (
          <div className="space-y-4">
            <div>
              <Label>{t('composer.selectDate')}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {scheduledDate ? format(scheduledDate, 'PPP', { locale: dateLocale }) : t('composer.chooseDate')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={scheduledDate} onSelect={setScheduledDate} disabled={(date) => date < new Date()} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label htmlFor="time">{t('composer.time')}</Label>
              <Input id="time" type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
            </div>
          </div>
        )}
      </Card>

      <Button onClick={handlePublish} disabled={!canPublish || (publishMode === 'schedule' && !scheduledDate)} className="w-full" size="lg">
        {isPublishing ? <>{t('composer.publishingNow')}</> : publishMode === 'schedule' ? <>{t('composer.schedulePubBtn')}</> : <>{t('composer.publishNowBtn')}</>}
      </Button>
    </div>
  );
}
