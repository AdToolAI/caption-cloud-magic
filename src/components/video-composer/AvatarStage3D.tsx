/**
 * AvatarStage3D — Stage 18: PS5/Artlist-style "character workshop" stage.
 *
 * NOT a real WebGL/Three.js scene — we deliberately fake the look using:
 *   - a 16:9 cinematic glass viewport with deep-black studio backdrop
 *   - a parallax tilt on mouse move (framer-motion useMotionValue)
 *   - layered gold rim-light + cyan key-light glows
 *   - a slow scanline sweep + bokeh grid for the "video-game" vibe
 *   - the existing 2D `portrait_url` (Hedra-optimised) as the avatar layer
 *
 * Real volumetric 3D is intentionally out of scope for this stage. The
 * structure is built so a later WebGL upgrade can swap the `<img>` layer
 * for a `<canvas>` without changing the call-site API.
 */
import { useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { User, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  imageUrl?: string | null;
  name?: string;
  voiceLabel?: string;
  className?: string;
}

export default function AvatarStage3D({
  imageUrl,
  name,
  voiceLabel,
  className,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 80, damping: 14, mass: 0.6 });
  const sy = useSpring(y, { stiffness: 80, damping: 14, mass: 0.6 });
  const rotateY = useTransform(sx, [-0.5, 0.5], [10, -10]);
  const rotateX = useTransform(sy, [-0.5, 0.5], [-7, 7]);
  const lightX = useTransform(sx, [-0.5, 0.5], ['25%', '75%']);
  const lightY = useTransform(sy, [-0.5, 0.5], ['25%', '75%']);

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
  };
  const handleLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={cn(
        'relative w-full aspect-video rounded-2xl overflow-hidden border border-gold/25 shadow-[0_0_40px_-12px_hsl(var(--primary)/0.45)] bg-[radial-gradient(ellipse_at_center,_hsl(var(--background))_0%,_#000_70%)] [perspective:1200px]',
        className,
      )}
    >
      {/* Bokeh grid backdrop */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.18] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(hsl(var(--primary)/0.25) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)/0.25) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* Dynamic key-light */}
      <motion.div
        aria-hidden
        className="absolute inset-0 pointer-events-none mix-blend-screen"
        style={{
          background: useTransform(
            [lightX, lightY] as any,
            ([lx, ly]: any) =>
              `radial-gradient(420px circle at ${lx} ${ly}, hsl(var(--primary)/0.35), transparent 60%)`,
          ),
        }}
      />

      {/* Cyan rim-light from below */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1/2 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 50% 100%, hsl(195 100% 60% / 0.18), transparent 70%)',
        }}
      />

      {/* Scanline sweep */}
      <motion.div
        aria-hidden
        className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent pointer-events-none"
        animate={{ y: ['0%', '100%', '0%'] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        style={{ filter: 'blur(2px)' }}
      />

      {/* Avatar layer with parallax tilt */}
      <motion.div
        className="absolute inset-0 flex items-end justify-center [transform-style:preserve-3d]"
        style={{ rotateX, rotateY }}
      >
        {imageUrl ? (
          <motion.img
            src={imageUrl}
            alt={name || 'Avatar'}
            className="h-[92%] w-auto object-contain object-bottom drop-shadow-[0_28px_38px_rgba(0,0,0,0.7)]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            style={{ translateZ: 30 }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-muted-foreground/60 mb-8">
            <div className="h-20 w-20 rounded-full bg-card/40 border border-border/40 flex items-center justify-center mb-2">
              <User className="h-8 w-8" />
            </div>
            <p className="text-[11px] uppercase tracking-[0.18em]">Kein Avatar</p>
          </div>
        )}
      </motion.div>

      {/* Top label */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        <div className="h-6 w-6 rounded-md bg-primary/15 border border-primary/40 flex items-center justify-center backdrop-blur-sm">
          <Sparkles className="h-3 w-3 text-primary" />
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-[0.22em] text-primary/80 leading-none">
            Character Workshop
          </div>
          {name && (
            <div className="text-[12px] font-display font-semibold text-foreground mt-0.5">
              {name}
            </div>
          )}
        </div>
      </div>

      {/* Voice tag bottom-right */}
      {voiceLabel && (
        <div className="absolute bottom-3 right-3 z-10 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur border border-border/40 text-[10px] text-foreground/80 uppercase tracking-wider">
          🎙 {voiceLabel}
        </div>
      )}

      {/* Lower vignette for depth */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(to bottom, transparent 60%, rgba(0,0,0,0.55) 100%)',
        }}
      />
    </div>
  );
}
