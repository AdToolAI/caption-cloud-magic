import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Heart, Download, Scissors, Edit, Sparkles, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LicenseButton } from "@/components/licensing/LicenseButton";
import { cn } from "@/lib/utils";
import type { StockVideo } from "@/hooks/useStockVideoSearch";

interface StockVideoCardProps {
  video: StockVideo;
  isFavorite: boolean;
  onToggleFavorite: (v: StockVideo) => void;
  onUseInComposer: (v: StockVideo) => void;
  onUseInDirectorsCut: (v: StockVideo) => void;
  index?: number;
}

export function StockVideoCard({
  video,
  isFavorite,
  onToggleFavorite,
  onUseInComposer,
  onUseInDirectorsCut,
  index = 0,
}: StockVideoCardProps) {
  const [hovering, setHovering] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (hovering) {
      v.currentTime = 0;
      v.play().catch(() => {});
    } else {
      v.pause();
      v.currentTime = 0;
    }
  }, [hovering]);

  const aspect = video.orientation === "portrait" ? "9 / 16" : video.orientation === "square" ? "1 / 1" : "16 / 9";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.4), duration: 0.35 }}
    >
      <Card
        className="overflow-hidden border-yellow-500/15 bg-black/40 backdrop-blur-md hover:border-yellow-500/45 transition-all group relative"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        <div
          className="relative bg-black overflow-hidden"
          style={{ aspectRatio: aspect }}
        >
          <img
            src={video.thumbnail}
            alt={video.title}
            className={cn(
              "w-full h-full object-cover transition-opacity duration-300",
              hovering && previewReady ? "opacity-0" : "opacity-100",
            )}
            loading="lazy"
          />
          <video
            ref={videoRef}
            src={video.preview_url}
            muted
            playsInline
            loop
            preload="none"
            onCanPlay={() => setPreviewReady(true)}
            className={cn(
              "absolute inset-0 w-full h-full object-cover transition-opacity duration-300",
              hovering && previewReady ? "opacity-100" : "opacity-0",
            )}
          />

          {/* Quality badges */}
          <div className="absolute top-2 left-2 flex flex-wrap gap-1">
            {video.is_4k && (
              <Badge className="bg-yellow-500/90 text-black text-[10px] h-5 font-semibold">4K</Badge>
            )}
            {!video.is_4k && video.is_hd && (
              <Badge className="bg-cyan-500/90 text-black text-[10px] h-5 font-semibold">HD</Badge>
            )}
            {video.is_vertical && (
              <Badge className="bg-fuchsia-500/90 text-white text-[10px] h-5">9:16</Badge>
            )}
            {video.is_slowmo && (
              <Badge className="bg-purple-500/90 text-white text-[10px] h-5">Slow-Mo</Badge>
            )}
          </div>

          {/* Duration */}
          <div className="absolute bottom-2 right-2">
            <Badge variant="secondary" className="bg-black/70 text-white text-[10px] h-5 font-mono">
              {video.duration > 0 ? `${Math.round(video.duration)}s` : "—"}
            </Badge>
          </div>

          {/* Provider */}
          <div className="absolute bottom-2 left-2">
            <Badge variant="outline" className="text-[10px] h-5 border-white/20 bg-black/50 text-white/90 capitalize">
              {video.provider}
            </Badge>
          </div>

          {/* Favorite button on hover */}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleFavorite(video); }}
            className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center hover:bg-black/80 transition-colors"
            title={isFavorite ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen"}
          >
            <Heart className={cn("h-3.5 w-3.5", isFavorite ? "fill-red-500 text-red-500" : "text-white")} />
          </button>
        </div>

        <div className="p-3 space-y-2">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate text-foreground" title={video.title}>
              {video.title}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">
              {video.photographer} · {video.width}×{video.height}{video.fps ? ` · ${video.fps}fps` : ""}
            </p>
          </div>

          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-7 text-[11px] border-yellow-500/30 hover:bg-yellow-500/10"
              onClick={() => onUseInComposer(video)}
            >
              <Scissors className="h-3 w-3 mr-1" />
              Composer
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-7 text-[11px] border-yellow-500/30 hover:bg-yellow-500/10"
              onClick={() => onUseInDirectorsCut(video)}
            >
              <Edit className="h-3 w-3 mr-1" />
              DC
            </Button>
            <LicenseButton
              size="icon"
              variant="ghost"
              className="h-7 w-7 hover:bg-primary/10"
              label=""
              asset_type="stock_video"
              asset_id={video.id}
              asset_title={video.title}
              asset_thumbnail_url={video.thumbnail}
              asset_source_url={video.source_url}
              source_provider={video.provider}
              license_tier="commercial"
              metadata={{
                width: video.width, height: video.height,
                duration: video.duration, fps: video.fps,
                photographer: video.photographer,
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => window.open(video.download_url, "_blank")}
              title="Download"
            >
              <Download className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {previewReady === false && hovering && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
            <Loader2 className="h-5 w-5 animate-spin text-yellow-400" />
          </div>
        )}
      </Card>
    </motion.div>
  );
}
