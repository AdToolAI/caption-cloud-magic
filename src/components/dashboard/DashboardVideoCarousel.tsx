import { useState, useCallback, useEffect } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { Play, ChevronLeft, ChevronRight, Video, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVideoHistory } from '@/hooks/useVideoHistory';
import { VideoPreviewPlayer } from '@/components/video/VideoPreviewPlayer';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

export const DashboardVideoCarousel = () => {
  const { videos, isLoading } = useVideoHistory();
  const [selectedVideo, setSelectedVideo] = useState<{ url: string; title: string } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Sort by performance (downloads + shares), fallback to created_at
  const sortedVideos = [...videos]
    .sort((a, b) => {
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

      {/* Carousel */}
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {sortedVideos.map((video, index) => {
            const isActive = index === selectedIndex;
            const performanceScore = (video.download_count || 0) + (video.share_count || 0);

            return (
              <div
                key={video.id}
                className="flex-shrink-0 flex-grow-0 px-2"
                style={{ flexBasis: sortedVideos.length === 1 ? '80%' : '45%' }}
              >
                <div
                  className={cn(
                    'relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 group border',
                    isActive
                      ? 'scale-100 opacity-100 border-primary/50 shadow-lg shadow-primary/10'
                      : 'scale-90 opacity-50 border-border hover:opacity-70'
                  )}
                  onClick={() => {
                    if (video.video_url) {
                      setSelectedVideo({ url: video.video_url, title: video.title || 'Video' });
                    }
                  }}
                >
                  {/* Thumbnail / Video Preview */}
                  <div className="aspect-video bg-muted relative">
                    {video.thumbnail_url ? (
                      <img
                        src={video.thumbnail_url}
                        alt={video.title || 'Video'}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-accent/10">
                        <Video className="h-10 w-10 text-muted-foreground" />
                      </div>
                    )}

                    {/* Play Overlay */}
                    <div className={cn(
                      'absolute inset-0 flex items-center justify-center bg-black/20 transition-opacity',
                      isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    )}>
                      <div className="w-14 h-14 rounded-full bg-primary/90 backdrop-blur-sm flex items-center justify-center shadow-lg">
                        <Play className="h-6 w-6 text-primary-foreground ml-0.5" />
                      </div>
                    </div>

                    {/* Performance Badge */}
                    {performanceScore > 0 && index === 0 && (
                      <div className="absolute top-2 left-2">
                        <Badge className="bg-primary/90 text-primary-foreground text-[10px] px-2 py-0.5">
                          ⭐ Best Performance
                        </Badge>
                      </div>
                    )}
                  </div>

                  {/* Info Bar */}
                  <div className="p-3 bg-card">
                    <p className="text-sm font-medium text-foreground truncate">
                      {video.title || 'Untitled Video'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(video.created_at).toLocaleDateString('de-DE', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dots */}
      {sortedVideos.length > 1 && (
        <div className="flex justify-center gap-1.5">
          {sortedVideos.map((_, i) => (
            <button
              key={i}
              className={cn(
                'w-2 h-2 rounded-full transition-all duration-200',
                i === selectedIndex ? 'bg-primary w-5' : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
              )}
              onClick={() => emblaApi?.scrollTo(i)}
            />
          ))}
        </div>
      )}

      {/* News Section Placeholder */}
      <div className="mt-6 pt-6 border-t border-border">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">News & Updates</h3>
          <Badge variant="outline" className="text-[10px]">Demnächst</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {['Feature Updates', 'Tutorials', 'Demo Videos'].map((label) => (
            <div key={label} className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-center">
              <Video className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
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
