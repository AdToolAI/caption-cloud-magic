import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface PostChipProps {
  id: string;
  title: string;
  channels: string[];
  status: string;
  selected?: boolean;
  selectable?: boolean;
  dragging?: boolean;
  draggable?: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}

type Palette = { from: string; via: string; to: string; glow: string; icon: string };

const PLATFORM: Record<string, Palette> = {
  instagram: { from: "#833AB4", via: "#E1306C", to: "#F77737", glow: "236,72,153", icon: "📷" },
  facebook:  { from: "#1877F2", via: "#4267B2", to: "#1877F2", glow: "24,119,242",  icon: "👍" },
  linkedin:  { from: "#0A66C2", via: "#0A8A0A", to: "#0A66C2", glow: "10,138,10",  icon: "💼" },
  tiktok:    { from: "#010101", via: "#25F4EE", to: "#FE2C55", glow: "34,211,238", icon: "🎵" },
  youtube:   { from: "#FF0000", via: "#CC0000", to: "#FF0000", glow: "255,0,0",    icon: "▶️" },
  twitter:   { from: "#1DA1F2", via: "#0d8ddb", to: "#1DA1F2", glow: "29,161,242", icon: "🐦" },
  x:         { from: "#000000", via: "#1a1a1a", to: "#000000", glow: "200,200,200", icon: "𝕏" },
};

const FALLBACK = { from: "#F5C76A", via: "#E0A93D", to: "#F5C76A", glow: "245,199,106", icon: "📝" };

const STATUS_DOT: Record<string, string> = {
  briefing: "bg-zinc-400",
  in_progress: "bg-blue-400",
  review: "bg-yellow-400",
  pending_approval: "bg-orange-400",
  approved: "bg-emerald-400",
  scheduled: "bg-indigo-400",
  published: "bg-purple-400",
};

const PULSING_STATUSES = new Set(["scheduled", "pending_approval", "in_progress"]);

export function PostChip({
  id,
  title,
  channels,
  status,
  selected,
  selectable,
  dragging,
  draggable,
  onClick,
  onDragStart,
  onDragEnd,
}: PostChipProps) {
  const primary = (channels[0] || "").toLowerCase();
  const p = (PLATFORM as Record<string, typeof PLATFORM.instagram>)[primary] ?? FALLBACK;
  const extras = channels.slice(1, 3);
  const isPulsing = PULSING_STATUSES.has(status);

  return (
    <motion.div
      draggable={draggable}
      onDragStart={onDragStart as any}
      onDragEnd={onDragEnd}
      onClick={onClick}
      whileHover={{ y: -2, scale: 1.03 }}
      transition={{ type: "spring", stiffness: 380, damping: 22 }}
      className={cn(
        "group/chip relative overflow-hidden rounded-md border cursor-pointer",
        "px-2 py-1 text-[10px] font-semibold tracking-wide",
        "backdrop-blur-md text-white",
        dragging && "opacity-50 scale-95",
        selected && "ring-1 ring-gold ring-offset-1 ring-offset-background",
        selectable && "hover:ring-1 hover:ring-gold/60",
      )}
      style={{
        background: `linear-gradient(120deg, ${p.from} 0%, ${p.via} 50%, ${p.to} 100%)`,
        backgroundSize: "200% 200%",
        borderColor: `rgba(${p.glow}, 0.5)`,
        boxShadow: `0 0 14px rgba(${p.glow}, 0.45), inset 0 0 12px rgba(255,255,255,0.08)`,
      }}
    >
      {/* Animated gradient sweep */}
      <motion.div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(120deg, ${p.from}, ${p.via}, ${p.to}, ${p.via}, ${p.from})`,
          backgroundSize: "300% 100%",
          mixBlendMode: "overlay",
          opacity: 0.5,
        }}
        animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
        transition={{ duration: 9, repeat: Infinity, ease: "linear" }}
      />

      {/* Holographic shimmer */}
      <motion.span
        aria-hidden
        className="absolute top-0 bottom-0 w-1/3 pointer-events-none"
        style={{
          background:
            "linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.45) 50%, transparent 100%)",
          filter: "blur(2px)",
        }}
        animate={{ x: ["-160%", "260%"] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.5 }}
      />

      <div className="relative flex items-center gap-1.5">
        {/* Status pulse dot */}
        <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
          {isPulsing && (
            <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping", STATUS_DOT[status])} />
          )}
          <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full ring-1 ring-white/40", STATUS_DOT[status] ?? "bg-white")} />
        </span>

        <span className="flex-shrink-0 text-[11px] leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
          {p.icon}
        </span>

        <span
          className="truncate flex-1 leading-tight"
          style={{ textShadow: "0 1px 4px rgba(0,0,0,0.55), 0 0 6px rgba(255,255,255,0.15)" }}
        >
          {title}
        </span>

        {extras.length > 0 && (
          <span className="flex -space-x-1 flex-shrink-0">
            {extras.map((c) => {
              const cp = (PLATFORM as Record<string, typeof PLATFORM.instagram>)[c.toLowerCase()] ?? FALLBACK;
              return (
                <span
                  key={c}
                  className="h-3 w-3 rounded-full ring-1 ring-white/50 flex items-center justify-center text-[8px]"
                  style={{ background: `linear-gradient(135deg, ${cp.from}, ${cp.to})` }}
                >
                  {cp.icon}
                </span>
              );
            })}
          </span>
        )}
      </div>
    </motion.div>
  );
}
