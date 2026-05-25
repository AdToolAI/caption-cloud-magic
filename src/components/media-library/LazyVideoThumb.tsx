import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";

interface LazyVideoThumbProps {
  src: string;
  onClick?: () => void;
  className?: string;
}

/**
 * Renders a lightweight placeholder until the card scrolls into view.
 * Only then a real <video preload="metadata"> is mounted so the browser
 * fetches the first frame. Prevents 500 parallel video requests on
 * the Media Library page.
 */
export function LazyVideoThumb({ src, onClick, className }: LazyVideoThumbProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ref.current || visible) return;
    const el = ref.current;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "200px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  return (
    <div
      ref={ref}
      onClick={onClick}
      className={`relative w-full h-full bg-muted flex items-center justify-center cursor-pointer ${className ?? ""}`}
    >
      {visible && src ? (
        <video
          src={src}
          className="object-cover w-full h-full"
          muted
          playsInline
          preload="metadata"
        />
      ) : (
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Play className="h-8 w-8 opacity-60" />
        </div>
      )}
    </div>
  );
}
