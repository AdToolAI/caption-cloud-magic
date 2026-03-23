import { useState, useCallback, useEffect, useRef } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { Play, ChevronLeft, ChevronRight, Video, Sparkles, Expand } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVideoHistory } from '@/hooks/useVideoHistory';
import { VideoPreviewPlayer } from '@/components/video/VideoPreviewPlayer';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

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

export const DashboardVideoCarousel = () => {
  const { videos, isLoading } = useVideoHistory();
  const [selectedVideo, setSelectedVideo] = useState<{ url: string; title: string } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [errorVideos, setErrorVideos] = useState<Set<number>>(new Set());
  const [retriedVideos, setRetriedVideos] = useState<Set<number>>(new Set());
  const wheelTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sortedVideos = [...videos]
    .filter((v: any) => v.status === 'completed' && v.output_url)
    .sort((a: any, b: any) => {
      const scoreA = (a.download_count || 0) + (a.share_count || 0);
      const scoreB = (b.download_count || 0) + (b.share_count || 0);
      // Videos with actual analytics data first
      if (scoreA > 0 && scoreB === 0) return -1;
      if (scoreB > 0 && scoreA === 0) return 1;
      if (scoreA > 0 && scoreB > 0 && scoreB !== scoreA) return scoreB - scoreA;
      // Otherwise: newest first
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })
    .slice(0, 10);

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: sortedVideos.length > 2,
    align: 'center',
    skipSnaps: false,
    containScroll: false,
    slidesToScroll: 1,
    watchDrag: false,
  });

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  // Auto-play active video, pause others
  useEffect(() => {
    videoRefs.current.forEach((el, i) => {
      if (!el) return;
      if (i === selectedIndex) {
        el.muted = true;
        // Force load + play with fallback
        if (el.readyState === 0) {
          el.load();
        }
        const tryPlay = () => {
          el.play().catch(() => {});
        };
        if (el.readyState >= 2) {
          tryPlay();
        } else {
          // Wait a bit then try anyway
          const t = setTimeout(tryPlay, 300);
          return () => clearTimeout(t);
        }
      } else {
        el.pause();
        el.currentTime = 0;
      }
    });
  }, [selectedIndex]);

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

  // Scroll-to-rotate: wheel event on the embla viewport
  useEffect(() => {
    if (!emblaApi) return;
    const rootNode = emblaApi.rootNode();
    if (!rootNode) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (wheelTimeout.current) return;

      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta > 0) {
        emblaApi.scrollNext();
      } else if (delta < 0) {
        emblaApi.scrollPrev();
      }

      wheelTimeout.current = setTimeout(() => {
        wheelTimeout.current = null;
      }, 150);
    };

    rootNode.addEventListener('wheel', handleWheel, { passive: false });
    return () => rootNode.removeEventListener('wheel', handleWheel);
  }, [emblaApi]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  const getVideoTitle = (video: any) =>
    (video.metadata as any)?.title || 'Video ' + video.id.slice(0, 8);

  const handleVideoError = (index: number, videoUrl: string) => {
    if (!retriedVideos.has(index)) {
      console.warn(`[Carousel] Retrying video ${index}:`, videoUrl);
      setRetriedVideos(prev => new Set(prev).add(index));
      const el = videoRefs.current[index];
      if (el) {
        el.src = videoUrl;
        el.load();
      }
    } else {
      console.error(`[Carousel] Video ${index} failed after retry:`, videoUrl);
      setErrorVideos(prev => new Set(prev).add(index));
    }
  };

  const handleCardClick = (index: number, videoUrl: string, title: string) => {
    if (index === selectedIndex) {
      if (videoUrl) setSelectedVideo({ url: videoUrl, title });
    } else {
      emblaApi?.scrollTo(index);
    }
  };

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
        <div className="flex items-center gap-3">
          <Video className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">Deine Videos</h2>
        </div>
        <div className="flex justify-center gap-4 py-8">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-56 h-36 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (sortedVideos.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Video className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">Noch keine Videos erstellt</h3>
        <p className="text-sm text-muted-foreground mb-4">Erstelle dein erstes Video und es erscheint hier!</p>
        <Button asChild>
          <Link to="/universal-video-creator">
            <Sparkles className="h-4 w-4 mr-2" />
            Video erstellen
          </Link>
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Video className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">Deine Videos</h2>
          <Badge variant="secondary" className="text-xs">{sortedVideos.length}</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" onClick={scrollPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" onClick={scrollNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 3D Perspective Carousel */}
      <div style={{ perspective: '1200px' }}>
        <div className="overflow-hidden py-8" ref={emblaRef}>
          <div className="flex items-center" style={{ transformStyle: 'preserve-3d' }}>
            {sortedVideos.map((video: any, index: number) => {
              const isActive = index === selectedIndex;
              const signedDist = getSignedDist(index);
              const absDist = Math.abs(signedDist);
              const performanceScore = (video.download_count || 0) + (video.share_count || 0);
              const title = getVideoTitle(video);
              const videoUrl = resolveVideoUrl(video.output_url);

              // 3D transforms
              const scale = isActive ? 1.05 : absDist === 1 ? 0.85 : 0.7;
              const zIndex = isActive ? 30 : absDist === 1 ? 20 : 10;
              const cardOpacity = isActive ? 1 : absDist === 1 ? 0.7 : 0.4;
              // rotateY: cards rotate away from center
              const rotateY = isActive ? 0 : absDist === 1 ? signedDist * -25 : signedDist > 0 ? -40 : 40;
              // translateX for tighter grouping
              const translateX = isActive ? 0 : signedDist * -20;

              return (
                <div
                  key={video.id}
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
                      {!errorVideos.has(index) ? (
                        <video
                          ref={(el) => { videoRefs.current[index] = el; }}
                          src={videoUrl}
                          muted
                          playsInline
                          loop
                          preload="auto"
                          poster={video.thumbnail_url || undefined}
                          className="w-full h-full object-cover"
                          onCanPlay={() => {
                            const el = videoRefs.current[index];
                            if (el && index === selectedIndex) {
                              el.muted = true;
                              el.play().catch(() => {});
                            }
                          }}
                          onError={(e) => {
                            console.error(`[Carousel] Video ${index} failed to load:`, videoUrl, e);
                            handleVideoError(index);
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-muted/80">
                          <Video className="h-8 w-8 text-muted-foreground/50 mb-2" />
                          <p className="text-xs text-muted-foreground">Video nicht verfügbar</p>
                        </div>
                      )}

                      {/* Play icon overlay — only on inactive cards */}
                      {!isActive && !errorVideos.has(index) && (
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

                      {/* Expand button on active card */}
                      {isActive && (
                        <div className="absolute top-2 right-2 z-10">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (videoUrl) setSelectedVideo({ url: videoUrl, title });
                            }}
                            className="w-9 h-9 rounded-full flex items-center justify-center bg-black/50 backdrop-blur-md hover:bg-primary/80 transition-colors"
                          >
                            <Expand className="h-4 w-4 text-white" />
                          </button>
                        </div>
                      )}

                      {/* Performance Badge */}
                      {performanceScore > 0 && index === 0 && (
                        <div className="absolute top-2 left-2 z-10">
                          <Badge className="bg-primary/90 text-primary-foreground text-[10px] px-2 py-0.5 backdrop-blur-sm">
                            ⭐ Best
                          </Badge>
                        </div>
                      )}

                      {/* Bottom info */}
                      <div className="absolute bottom-0 left-0 right-0 p-3 bg-black/30 backdrop-blur-sm pointer-events-none">
                        <p className="text-sm font-medium text-white truncate drop-shadow-md">
                          {title}
                        </p>
                        <p className="text-[10px] text-white/60 mt-0.5">
                          {new Date(video.created_at).toLocaleDateString('de-DE', {
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
      <div className="mt-6 pt-6 border-t border-border/50">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">News & Updates</h3>
          <Badge variant="outline" className="text-[10px]">Demnächst</Badge>
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

      {/* Video Player Dialog */}
      {selectedVideo && (
        <VideoPreviewPlayer
          open={!!selectedVideo}
          onOpenChange={(open) => !open && setSelectedVideo(null)}
          videoUrl={selectedVideo.url}
          title={selectedVideo.title}
        />
      )}
    </div>
  );
};
