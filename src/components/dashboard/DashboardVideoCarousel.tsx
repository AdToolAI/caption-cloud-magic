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
  if (rawUrl.startsWith('http')) return rawUrl;

  // Try known buckets in order
  const buckets = ['universal-videos', 'video-assets', 'ai-videos'];
  for (const bucket of buckets) {
    if (rawUrl.startsWith(`${bucket}/`) || rawUrl.includes(`/${bucket}/`)) {
      const path = rawUrl.startsWith(`${bucket}/`) ? rawUrl.slice(bucket.length + 1) : rawUrl;
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      return data.publicUrl;
    }
  }

  // Default: try first bucket
  const { data } = supabase.storage.from('universal-videos').getPublicUrl(rawUrl);
  return data.publicUrl;
};

export const DashboardVideoCarousel = () => {
  const { videos, isLoading } = useVideoHistory();
  const [selectedVideo, setSelectedVideo] = useState<{ url: string; title: string } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  const sortedVideos = [...videos]
    .filter((v: any) => v.status === 'completed' && v.output_url)
    .sort((a: any, b: any) => {
      const scoreA = (a.download_count || 0) + (a.share_count || 0);
      const scoreB = (b.download_count || 0) + (b.share_count || 0);
      if (scoreB !== scoreA) return scoreB - scoreA;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })
    .slice(0, 10);

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: sortedVideos.length > 2,
    align: 'center',
    skipSnaps: false,
    containScroll: false,
  });

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on('select', onSelect);
    return () => { emblaApi.off('select', onSelect); };
  }, [emblaApi, onSelect]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  const getVideoTitle = (video: any) =>
    (video.metadata as any)?.title || 'Video ' + video.id.slice(0, 8);

  const handleMouseEnter = (index: number) => {
    const el = videoRefs.current[index];
    if (el) {
      el.muted = true;
      el.play().catch(() => {});
    }
  };

  const handleMouseLeave = (index: number) => {
    const el = videoRefs.current[index];
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
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

      {/* Carousel — gear-style overlapping */}
      <div className="overflow-hidden py-6" ref={emblaRef}>
        <div className="flex" style={{ perspective: '1200px' }}>
          {sortedVideos.map((video: any, index: number) => {
            const isActive = index === selectedIndex;
            const distFromActive = Math.abs(index - selectedIndex);
            const isLeft = index < selectedIndex;
            const performanceScore = (video.download_count || 0) + (video.share_count || 0);
            const title = getVideoTitle(video);
            const videoUrl = resolveVideoUrl(video.output_url);

            // Gear-style transforms
            const scale = isActive ? 1.12 : distFromActive === 1 ? 0.78 : 0.65;
            const rotateY = isActive ? 0 : isLeft ? 12 : -12;
            const zIndex = isActive ? 20 : 10 - distFromActive;
            const opacity = isActive ? 1 : distFromActive === 1 ? 0.55 : 0.3;

            return (
              <div
                key={video.id}
                className="flex-shrink-0 flex-grow-0"
                style={{
                  flexBasis: sortedVideos.length === 1 ? '70%' : '30%',
                  marginLeft: index === 0 ? '0px' : '-16px',
                  marginRight: '-16px',
                  zIndex,
                  position: 'relative',
                }}
              >
                <div
                  className={cn(
                    'relative rounded-2xl overflow-hidden transition-all duration-500 group',
                    isActive
                      ? 'ring-2 ring-primary/60 shadow-2xl shadow-primary/30'
                      : 'ring-1 ring-border/20'
                  )}
                  style={{
                    transform: `scale(${scale}) rotateY(${rotateY}deg)`,
                    opacity,
                    transformOrigin: isActive ? 'center center' : isLeft ? 'right center' : 'left center',
                    transition: 'all 0.6s cubic-bezier(0.25, 0.1, 0.25, 1)',
                  }}
                  onMouseEnter={() => handleMouseEnter(index)}
                  onMouseLeave={() => handleMouseLeave(index)}
                >
                  {/* Video element with hover autoplay */}
                  <div className="aspect-video relative overflow-hidden bg-black">
                    <video
                      ref={(el) => { videoRefs.current[index] = el; }}
                      src={videoUrl}
                      muted
                      playsInline
                      preload="metadata"
                      poster={video.thumbnail_url || undefined}
                      className="w-full h-full object-cover"
                    />

                    {/* Dark gradient overlay */}
                    <div className={cn(
                      'absolute inset-0 transition-opacity duration-300',
                      isActive
                        ? 'bg-gradient-to-t from-black/50 via-transparent to-transparent'
                        : 'bg-gradient-to-t from-black/70 via-black/20 to-black/10'
                    )} />

                    {/* Play/Expand overlay */}
                    <div className={cn(
                      'absolute inset-0 flex items-center justify-center gap-3 transition-opacity duration-300',
                      isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-80'
                    )}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (videoUrl) setSelectedVideo({ url: videoUrl, title });
                        }}
                        className={cn(
                          'w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-md transition-all duration-300',
                          isActive
                            ? 'bg-primary/80 shadow-lg shadow-primary/40 hover:bg-primary'
                            : 'bg-white/20 hover:bg-white/30'
                        )}
                      >
                        <Expand className="h-5 w-5 text-white" />
                      </button>
                    </div>

                    {/* Performance Badge */}
                    {performanceScore > 0 && index === 0 && (
                      <div className="absolute top-2 left-2 z-10">
                        <Badge className="bg-primary/90 text-primary-foreground text-[10px] px-2 py-0.5 backdrop-blur-sm">
                          ⭐ Best
                        </Badge>
                      </div>
                    )}

                    {/* Bottom info — glassmorphism bar */}
                    <div className="absolute bottom-0 left-0 right-0 p-3 bg-black/30 backdrop-blur-sm">
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

      {/* Dots — pill style */}
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
