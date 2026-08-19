import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { Play, ChevronLeft, ChevronRight, Video, Sparkles, Expand, Volume2, VolumeX, LucideIcon, Lightbulb, Infinity as InfinityIcon, Clock, CalendarPlus, CalendarDays, Edit3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVideoHistory } from '@/hooks/useVideoHistory';
import { VideoPreviewPlayer } from '@/components/video/VideoPreviewPlayer';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { PlatformBadge } from '@/components/ui/PlatformBadge';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { DEMO_VIDEO, isDemoVideo } from '@/constants/demo-video';
import { useTranslation } from '@/hooks/useTranslation';
import { AutopilotHeroBanner } from '@/components/autopilot/AutopilotHeroBanner';

interface QuickAction {
  label: string;
  icon: LucideIcon;
  to: string;
  variant?: 'default' | 'outline';
}

/** Resolve a possibly-relative storage path to a full public URL */
const resolveVideoUrl = (rawUrl: string): string => {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) return rawUrl;

  const buckets = ['universal-videos', 'video-assets', 'ai-videos'];
  for (const bucket of buckets) {
    const prefix = `${bucket}/`;
    if (rawUrl.startsWith(prefix)) {
      const path = rawUrl.slice(prefix.length);
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      return data.publicUrl;
    }
    const bucketSegment = `/${bucket}/`;
    if (rawUrl.includes(bucketSegment)) {
      const path = rawUrl.split(bucketSegment).pop() || '';
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      return data.publicUrl;
    }
  }

  const { data } = supabase.storage.from('universal-videos').getPublicUrl(rawUrl);
  console.warn('[Carousel] Could not match bucket for path, falling back to universal-videos:', rawUrl);
  return data.publicUrl;
};

export interface NextPostInfo {
  platform?: string;
  contentIdea?: string;
  caption?: string;
  mediaUrl?: string;
  hashtags?: string[];
  /** Display string e.g. "20.04. 14:30" */
  whenLabel: string;
  /** Optional ISO date for full formatting */
  isoDate?: string;
  /** Source: 'calendar' (real scheduled event) or 'strategy' (KI suggestion) */
  source?: 'calendar' | 'strategy';
  /** Reasoning text (only for strategy posts) */
  reasoning?: string;
}

interface DashboardVideoCarouselProps {
  quickActions?: QuickAction[];
  tipText?: string;
  tipLabel?: string;
  nextPostLabel?: string;
  nextPostPrefix?: string;
  nextPost?: NextPostInfo | null;
  /** Called when user clicks the next-post pill and source is 'strategy' */
  onOpenStrategyNext?: () => void;
}

interface StatusPillsProps {
  tipText?: string;
  tipLabel?: string;
  nextPostLabel?: string;
  nextPostPrefix?: string;
  nextPost?: NextPostInfo | null;
  onOpenNextPost?: () => void;
}

const StatusPills = ({
  tipText,
  tipLabel,
  nextPostLabel,
  nextPostPrefix,
  onOpenNextPost,
}: StatusPillsProps) => {
  if (!tipText && !nextPostLabel) return null;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {tipText && (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center justify-center h-11 w-11 rounded-2xl border border-border/40 bg-card/40 backdrop-blur-sm hover:bg-muted/60 hover:border-primary/40 transition-colors"
                aria-label={tipLabel}
              >
                <Lightbulb className="h-4 w-4 text-primary" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              {tipLabel && <p className="text-xs font-semibold mb-1">{tipLabel}</p>}
              <p className="text-xs leading-relaxed">{tipText}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      <span className="inline-flex items-center gap-1.5 h-11 px-3 rounded-2xl border border-warning/40 bg-warning/10 text-xs font-medium text-warning backdrop-blur-sm">
        <InfinityIcon className="h-4 w-4" />
        <span className="hidden md:inline">Unlimited</span>
      </span>
      {nextPostLabel && (
        <button
          type="button"
          onClick={onOpenNextPost}
          className="inline-flex items-center gap-2 h-11 pl-2.5 pr-3 rounded-2xl border border-border/40 bg-card/40 backdrop-blur-sm hover:bg-muted/60 hover:border-warning/50 transition-colors text-left group"
        >
          <span className="inline-flex items-center justify-center h-7 w-7 rounded-xl bg-warning/10 text-warning shrink-0">
            <Clock className="h-3.5 w-3.5" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/80 font-medium">
              {nextPostPrefix}
            </span>
            <span className="text-xs font-medium text-foreground whitespace-nowrap">
              {nextPostLabel}
            </span>
          </span>
        </button>
      )}
    </div>
  );
};

export const DashboardVideoCarousel = ({
  quickActions = [],
  tipText,
  tipLabel,
  nextPostLabel,
  nextPostPrefix,
  nextPost,
  onOpenStrategyNext,
}: DashboardVideoCarouselProps) => {
  const { videos, isLoading } = useVideoHistory();
  const { t, language } = useTranslation();
  const [selectedVideo, setSelectedVideo] = useState<{ url: string; title: string } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [nextPostDialogOpen, setNextPostDialogOpen] = useState(false);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [errorVideos, setErrorVideos] = useState<Set<string>>(new Set());
  const [retriedVideos, setRetriedVideos] = useState<Set<string>>(new Set());
  const [isMuted, setIsMuted] = useState(true);
  const wheelTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const openNextPost = useCallback(() => {
    if (nextPost?.source === 'strategy' && onOpenStrategyNext) {
      onOpenStrategyNext();
    } else {
      setNextPostDialogOpen(true);
    }
  }, [nextPost?.source, onOpenStrategyNext]);

  const sortedVideos = useMemo(() =>
    [...videos]
      .filter((v: any) => v.status === 'completed' && v.output_url)
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10),
    [videos]
  );

  // Memoize resolved URLs so <video> src stays stable across refetches
  const resolvedUrls = useMemo(() => {
    const map = new Map<string, string>();
    sortedVideos.forEach((v: any) => {
      map.set(v.id, resolveVideoUrl(v.output_url));
    });
    return map;
  }, [sortedVideos]);

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: sortedVideos.length > 2,
    align: 'center',
    skipSnaps: false,
    containScroll: false,
    slidesToScroll: 1,
    watchDrag: true,
  });

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  // Auto-play active video, pause others. While the preview dialog is open,
  // pause ALL carousel videos so we never get double audio playback.
  useEffect(() => {
    const dialogOpen = !!selectedVideo;
    videoRefs.current.forEach((el, i) => {
      if (!el) return;
      if (dialogOpen) {
        el.pause();
        el.muted = true;
        return;
      }
      if (i === selectedIndex) {
        el.muted = isMuted;
        if (el.readyState === 0) el.load();
        const tryPlay = () => { el.play().catch(() => {}); };
        if (el.readyState >= 2) {
          tryPlay();
        } else {
          const t = setTimeout(tryPlay, 300);
          return () => clearTimeout(t);
        }
      } else {
        el.pause();
        el.currentTime = 0;
      }
    });
  }, [selectedIndex, isMuted, selectedVideo]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
      emblaApi.off('reInit', onSelect);
    };
  }, [emblaApi, onSelect]);

  // Scroll-to-rotate: capture wheel on entire container so it works everywhere
  const handleWheelCapture = useCallback((e: React.WheelEvent) => {
    if (!emblaApi) return;
    e.preventDefault();
    e.stopPropagation();
    if (wheelTimeout.current) return;

    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(delta) < 2) return;

    if (delta > 0) {
      emblaApi.scrollNext();
    } else {
      emblaApi.scrollPrev();
    }

    wheelTimeout.current = setTimeout(() => {
      wheelTimeout.current = null;
    }, 200);
  }, [emblaApi]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  const getVideoTitle = (video: any) => {
    if (isDemoVideo(video)) return 'Demo Video — Universal Creator';
    return (video.metadata as any)?.title || 'Video ' + video.id.slice(0, 8);
  };

  const handleVideoError = (videoId: string, index: number, videoUrl: string) => {
    if (!retriedVideos.has(videoId)) {
      console.warn(`[Carousel] Retrying video ${videoId}:`, videoUrl);
      setRetriedVideos(prev => new Set(prev).add(videoId));
      const el = videoRefs.current[index];
      if (el) {
        el.src = videoUrl;
        el.load();
      }
    } else {
      console.error(`[Carousel] Video ${videoId} failed after retry:`, videoUrl);
      setErrorVideos(prev => new Set(prev).add(videoId));
    }
  };

  const handleCardClick = (index: number, videoUrl: string, title: string) => {
    if (index === selectedIndex) {
      if (videoUrl) setSelectedVideo({ url: videoUrl, title });
    } else {
      emblaApi?.scrollTo(index);
    }
  };

  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMuted(prev => {
      const next = !prev;
      const el = videoRefs.current[selectedIndex];
      if (el) el.muted = next;
      return next;
    });
  }, [selectedIndex]);

  // Signed distance for 3D rotation
  const getSignedDist = (index: number): number => {
    const len = sortedVideos.length;
    let diff = index - selectedIndex;
    if (len > 2) {
      if (diff > len / 2) diff -= len;
      if (diff < -len / 2) diff += len;
    }
    return diff;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusPills tipText={tipText} tipLabel={tipLabel} nextPostLabel={nextPostLabel} nextPostPrefix={nextPostPrefix} nextPost={nextPost} onOpenNextPost={openNextPost} />
          {quickActions.length > 0 && (
            <div className="flex items-center gap-1.5 ml-auto">
              {quickActions.map((action, i) => (
                <Button key={i} asChild variant={action.variant || 'outline'} size="sm" className="h-7 px-2.5 text-xs rounded-lg gap-1.5">
                  <Link to={action.to}>
                    <action.icon className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">{action.label}</span>
                  </Link>
                </Button>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-center gap-4 py-8">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-56 h-36 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
        <NextPostDialog open={nextPostDialogOpen} onOpenChange={setNextPostDialogOpen} nextPost={nextPost} whenLabel={nextPostLabel} title={nextPostPrefix} />
      </div>
    );
  }

  if (sortedVideos.length === 0) {
    const demoVideoUrl = DEMO_VIDEO.output_url;

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusPills tipText={tipText} tipLabel={tipLabel} nextPostLabel={nextPostLabel} nextPostPrefix={nextPostPrefix} nextPost={nextPost} onOpenNextPost={openNextPost} />
          {quickActions.length > 0 && (
            <div className="flex items-center gap-1.5 ml-auto">
              {quickActions.map((action, i) => (
                <Button key={i} asChild variant={action.variant || 'outline'} size="sm" className="h-7 px-2.5 text-xs rounded-lg gap-1.5">
                  <Link to={action.to}>
                    <action.icon className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">{action.label}</span>
                  </Link>
                </Button>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-center" style={{ perspective: '1200px' }}>
          <div
            className="relative rounded-2xl overflow-hidden ring-2 ring-primary/60 shadow-2xl shadow-primary/30 w-full max-w-2xl"
            style={{
              transform: 'perspective(1200px) rotateY(0deg) scale(1)',
              transformOrigin: 'center center',
            }}
          >
            <div className="aspect-video relative overflow-hidden bg-black">
              <video
                src={demoVideoUrl}
                muted={isMuted}
                autoPlay
                playsInline
                loop
                preload="auto"
                className="w-full h-full object-cover demo-video-element"
              />

              {/* Controls */}
              <div className="absolute top-2 right-2 z-10 flex gap-1.5">
                <button
                  onClick={() => setIsMuted(prev => !prev)}
                  className="w-9 h-9 rounded-full flex items-center justify-center bg-black/50 backdrop-blur-md hover:bg-primary/80 transition-colors"
                >
                  {isMuted ? <VolumeX className="h-4 w-4 text-white" /> : <Volume2 className="h-4 w-4 text-white" />}
                </button>
                <button
                  onClick={() => {
                    const demoEl = document.querySelector('.demo-video-element') as HTMLVideoElement;
                    if (demoEl) demoEl.pause();
                    setSelectedVideo({ url: demoVideoUrl, title: 'AdTool AI: Die Lösung' });
                  }}
                  className="w-9 h-9 rounded-full flex items-center justify-center bg-black/50 backdrop-blur-md hover:bg-primary/80 transition-colors"
                >
                  <Expand className="h-4 w-4 text-white" />
                </button>
              </div>

              {/* Badge */}
              <div className="absolute top-3 left-3 z-10">
                <Badge className="bg-primary/90 text-primary-foreground text-[10px] font-bold backdrop-blur-sm">
                  <Sparkles className="h-3 w-3 mr-1" />
                  DEMO
                </Badge>
              </div>

              {/* Bottom info */}
              <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/70 to-transparent">
                <p className="text-sm font-medium text-white drop-shadow-md">{t("carousel.demoTitle")}</p>
                <p className="text-[10px] text-white/60 mt-0.5">{t("carousel.firstVideoLook")}</p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="flex justify-center pt-2">
          <Button asChild size="lg" className="shadow-glow">
            <Link to="/universal-video-creator">
              <Sparkles className="h-4 w-4 mr-2" />
              {t("carousel.createFirstVideo")}
            </Link>
          </Button>
        </div>

        {/* Video Player Dialog */}
        {selectedVideo && (
          <VideoPreviewPlayer
            open={!!selectedVideo}
            onOpenChange={(open) => {
              if (!open) {
                setSelectedVideo(null);
                const demoEl = document.querySelector('.demo-video-element') as HTMLVideoElement;
                if (demoEl) demoEl.play().catch(() => {});
              }
            }}
            videoUrl={selectedVideo.url}
            title={selectedVideo.title}
          />
        )}
        <NextPostDialog open={nextPostDialogOpen} onOpenChange={setNextPostDialogOpen} nextPost={nextPost} whenLabel={nextPostLabel} title={nextPostPrefix} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 py-1 flex-wrap">
        <StatusPills tipText={tipText} tipLabel={tipLabel} nextPostLabel={nextPostLabel} nextPostPrefix={nextPostPrefix} nextPost={nextPost} onOpenNextPost={openNextPost} />
        <div className="flex items-center gap-1.5">
          {quickActions.map((action, i) => (
            <Button key={i} asChild variant={action.variant || 'outline'} size="sm" className="h-7 px-2.5 text-xs rounded-lg gap-1.5">
              <Link to={action.to}>
                <action.icon className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{action.label}</span>
              </Link>
            </Button>
          ))}
          <div className="w-px h-5 bg-border mx-1" />
          <Button variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={scrollPrev}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7 rounded-full" onClick={scrollNext}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* 3D Perspective Carousel — onWheelCapture on outer container */}
      <div
        ref={containerRef}
        className="overflow-hidden"
        style={{ perspective: '1200px' }}
        onWheelCapture={handleWheelCapture}
      >
        <div className="overflow-hidden py-8" ref={emblaRef}>
          <div className="flex items-center" style={{ transformStyle: 'preserve-3d' }}>
            {sortedVideos.map((video: any, index: number) => {
              const isActive = index === selectedIndex;
              const signedDist = getSignedDist(index);
              const absDist = Math.abs(signedDist);
              const title = getVideoTitle(video);
              const videoUrl = resolvedUrls.get(video.id) || resolveVideoUrl(video.output_url);
              const videoId = video.id;

              // 3D transforms
              const scale = isActive ? 1.05 : absDist === 1 ? 0.85 : 0.7;
              const zIndex = isActive ? 30 : absDist === 1 ? 20 : 10;
              const cardOpacity = isActive ? 1 : absDist === 1 ? 0.7 : 0.4;
              const rotateY = isActive ? 0 : absDist === 1 ? signedDist * -25 : signedDist > 0 ? -40 : 40;
              const translateX = isActive ? 0 : signedDist * -20;

              return (
                <div
                  key={videoId}
                  className="flex-shrink-0 flex-grow-0 cursor-pointer"
                  style={{
                    flexBasis: sortedVideos.length === 1 ? '70%' : '50%',
                    marginLeft: index === 0 ? '0' : '-32px',
                    marginRight: '-32px',
                    zIndex,
                    position: 'relative',
                  }}
                  onClick={() => handleCardClick(index, videoUrl, title)}
                >
                  <div
                    className={cn(
                      'relative rounded-2xl overflow-hidden',
                      isActive
                        ? 'ring-2 ring-primary/60 shadow-2xl shadow-primary/30'
                        : 'ring-1 ring-border/20'
                    )}
                    style={{
                      transform: `perspective(1200px) rotateY(${rotateY}deg) scale(${scale}) translateX(${translateX}px)`,
                      opacity: cardOpacity,
                      transition: 'all 0.5s cubic-bezier(0.25, 0.1, 0.25, 1)',
                      transformOrigin: 'center center',
                      backfaceVisibility: 'hidden',
                    }}
                  >
                    {/* Video element */}
                    <div className="aspect-video relative overflow-hidden bg-black">
                      {!errorVideos.has(videoId) ? (
                        <video
                          ref={(el) => { videoRefs.current[index] = el; }}
                          src={videoUrl}
                          muted={isMuted}
                          playsInline
                          loop
                          preload="auto"
                          poster={video.thumbnail_url || undefined}
                          className="w-full h-full object-cover"
                          onCanPlay={() => {
                            const el = videoRefs.current[index];
                            if (el && index === selectedIndex) {
                              el.muted = isMuted;
                              el.play().catch(() => {});
                            }
                          }}
                          onError={(e) => {
                            console.error(`[Carousel] Video ${videoId} failed to load:`, videoUrl, e);
                            handleVideoError(videoId, index, videoUrl);
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-muted/80">
                          <Video className="h-8 w-8 text-muted-foreground/50 mb-2" />
                          <p className="text-xs text-muted-foreground">{t("carousel.videoUnavailable")}</p>
                        </div>
                      )}

                      {/* Play icon overlay — only on inactive cards */}
                      {!isActive && !errorVideos.has(videoId) && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <Play className="h-8 w-8 text-white/60" />
                        </div>
                      )}

                      {/* Dark gradient overlay */}
                      <div className={cn(
                        'absolute inset-0 pointer-events-none transition-opacity duration-300',
                        isActive
                          ? 'bg-gradient-to-t from-black/50 via-transparent to-transparent'
                          : 'bg-gradient-to-t from-black/70 via-black/20 to-black/10'
                      )} />

                      {/* Active card controls: Expand + Mute */}
                      {isActive && (
                        <div className="absolute top-2 right-2 z-10 flex gap-1.5">
                          <button
                            onClick={toggleMute}
                            className="w-9 h-9 rounded-full flex items-center justify-center bg-black/50 backdrop-blur-md hover:bg-primary/80 transition-colors"
                          >
                            {isMuted ? (
                              <VolumeX className="h-4 w-4 text-white" />
                            ) : (
                              <Volume2 className="h-4 w-4 text-white" />
                            )}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const el = videoRefs.current[selectedIndex];
                              if (el) el.pause();
                              if (videoUrl) setSelectedVideo({ url: videoUrl, title });
                            }}
                            className="w-9 h-9 rounded-full flex items-center justify-center bg-black/50 backdrop-blur-md hover:bg-primary/80 transition-colors"
                          >
                            <Expand className="h-4 w-4 text-white" />
                          </button>
                        </div>
                      )}

                      {/* Bottom info */}
                      <div className="absolute bottom-0 left-0 right-0 p-3 bg-black/30 backdrop-blur-sm pointer-events-none">
                        <p className="text-sm font-medium text-white truncate drop-shadow-md">
                          {title}
                        </p>
                        <p className="text-[10px] text-white/60 mt-0.5">
                          {new Date(video.created_at).toLocaleDateString(language === 'de' ? 'de-DE' : language === 'es' ? 'es-ES' : 'en-US', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Dots */}
      {sortedVideos.length > 1 && (
        <div className="flex justify-center gap-1.5">
          {sortedVideos.map((_: any, i: number) => (
            <button
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                i === selectedIndex ? 'bg-primary w-6' : 'bg-muted-foreground/20 w-1.5 hover:bg-muted-foreground/40'
              )}
              onClick={() => emblaApi?.scrollTo(i)}
            />
          ))}
        </div>
      )}

      {/* News Section */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">News & Updates</h3>
          <Badge variant="outline" className="text-[10px]">{t("carousel.comingSoon")}</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {['Feature Updates', 'Tutorials', 'Demo Videos'].map((label) => (
            <div key={label} className="rounded-xl border border-dashed border-border/50 bg-muted/20 p-4 text-center backdrop-blur-sm">
              <Video className="h-6 w-6 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground font-medium">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Autopilot Hero Banner — KI-Steuerung */}
      <div className="mt-6 pt-6 border-t border-border/50">
        <AutopilotHeroBanner />
      </div>

      {/* Video Player Dialog */}
      {selectedVideo && (
        <VideoPreviewPlayer
          open={!!selectedVideo}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedVideo(null);
              const el = videoRefs.current[selectedIndex];
              if (el) el.play().catch(() => {});
            }
          }}
          videoUrl={selectedVideo.url}
          title={selectedVideo.title}
        />
      )}

      <NextPostDialog
        open={nextPostDialogOpen}
        onOpenChange={setNextPostDialogOpen}
        nextPost={nextPost}
        whenLabel={nextPostLabel}
        title={nextPostPrefix}
      />
    </div>
  );
};

interface NextPostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nextPost?: NextPostInfo | null;
  whenLabel?: string;
  title?: string;
}

const NextPostDialog = ({ open, onOpenChange, nextPost, whenLabel, title }: NextPostDialogProps) => {
  const { t, language } = useTranslation();
  const hasPost = !!nextPost && !!nextPost.platform;

  const formattedDate = (() => {
    if (!nextPost?.isoDate) return whenLabel || '';
    try {
      const d = new Date(nextPost.isoDate);
      const locale = language === 'de' ? 'de-DE' : language === 'es' ? 'es-ES' : 'en-US';
      return d.toLocaleDateString(locale, {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return whenLabel || '';
    }
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-warning" />
            {title || t('dashboard.statusBar.nextPost')}
          </DialogTitle>
          <DialogDescription>
            {hasPost
              ? t('homePage.nextScheduledPost')
              : t('homePage.noPostScheduled')}
          </DialogDescription>
        </DialogHeader>

        {hasPost ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/30 p-3">
              <div className="flex items-center gap-2">
                {nextPost!.platform && <PlatformBadge platform={nextPost!.platform} />}
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">{formattedDate}</p>
                <p className="text-sm font-semibold text-foreground">{whenLabel}</p>
              </div>
            </div>

            {nextPost!.mediaUrl && (
              <div className="rounded-xl overflow-hidden border border-border/40 bg-black aspect-video">
                <img
                  src={nextPost!.mediaUrl}
                  alt={nextPost!.contentIdea || 'Post preview'}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {(nextPost!.contentIdea || nextPost!.caption) && (
              <div className="space-y-1">
                {nextPost!.contentIdea && (
                  <p className="text-sm font-medium text-foreground">
                    {nextPost!.contentIdea}
                  </p>
                )}
                {nextPost!.caption && (
                  <p className="text-sm text-muted-foreground line-clamp-4 whitespace-pre-wrap">
                    {nextPost!.caption}
                  </p>
                )}
              </div>
            )}

            {nextPost!.hashtags && nextPost!.hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {nextPost!.hashtags.slice(0, 8).map((tag, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px]">
                    #{tag.replace(/^#/, '')}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/50 bg-muted/20 p-6 text-center">
            <CalendarPlus className="h-8 w-8 text-muted-foreground/60 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {t('homePage.noPostScheduled')}
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button asChild variant="outline" onClick={() => onOpenChange(false)}>
            <Link to="/calendar">
              <CalendarDays className="h-4 w-4 mr-2" />
              {t('homePage.planInCalendar')}
            </Link>
          </Button>
          {!hasPost && (
            <Button asChild onClick={() => onOpenChange(false)}>
              <Link to="/calendar">
                <CalendarPlus className="h-4 w-4 mr-2" />
                {t('homePage.startPlanning')}
              </Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
