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

/**
 * Lightsaber-style chip:
 * dark glass body + one thin, glowing platform-colored blade on the left edge.
 * Minimal, premium, readable.
 */
type Blade = { color: string; rgb: string; icon: string };

const PLATFORM: Record<string, Blade> = {
  instagram: { color: "#FF2E88", rgb: "255,46,136",  icon: "📷" },
  facebook:  { color: "#1E88FF", rgb: "30,136,255",  icon: "👍" },
  linkedin:  { color: "#4FC3F7", rgb: "79,195,247",  icon: "💼" },
  tiktok:    { color: "#25F4EE", rgb: "37,244,238",  icon: "🎵" },
  youtube:   { color: "#FF3B3B", rgb: "255,59,59",   icon: "▶️" },
  twitter:   { color: "#1DA1F2", rgb: "29,161,242",  icon: "🐦" },
  x:         { color: "#E5E7EB", rgb: "229,231,235", icon: "𝕏" },
};

const FALLBACK: Blade = { color: "#F5C76A", rgb: "245,199,106", icon: "📝" };

const STATUS_DOT: Record<string, string> = {
  briefing: "bg-zinc-400",
  in_progress: "bg-sky-400",
  review: "bg-amber-400",
  pending_approval: "bg-orange-400",
  approved: "bg-emerald-400",
  scheduled: "bg-indigo-300",
  published: "bg-fuchsia-300",
};

const PULSING_STATUSES = new Set(["scheduled", "pending_approval", "in_progress"]);

export function PostChip({
  title,
  channels,
  status,
  selected,
  dragging,
  draggable,
  onClick,
  onDragStart,
  onDragEnd,
}: PostChipProps) {
  const primary = (channels[0] || "").toLowerCase();
  const b = PLATFORM[primary] ?? FALLBACK;
  const extras = channels.slice(1, 3);
  const isPulsing = PULSING_STATUSES.has(status);

  return (
    <motion.div
      draggable={draggable}
      onDragStart={onDragStart as any}
      onDragEnd={onDragEnd}
      onClick={onClick}
      whileHover={{ y: -1 }}
      transition={{ type: "spring", stiffness: 380, damping: 26 }}
      className={cn(
        "group/chip relative overflow-hidden rounded-md cursor-pointer select-none",
        "pl-2.5 pr-2 py-1 text-[11px] font-medium tracking-tight",
        "bg-[#0b0f1a]/85 backdrop-blur-md text-white/90",
        "border border-white/[0.06] hover:border-white/[0.14]",
        "transition-colors",
        dragging && "opacity-50 scale-[0.97]",
        selected && "ring-1 ring-gold/80",
      )}
      style={{
        boxShadow: `inset 1px 0 0 0 ${b.color}, 0 0 10px -2px rgba(${b.rgb},0.45), 0 1px 2px rgba(0,0,0,0.4)`,
      }}
    >
      {/* The "blade" — thin, bright, with a soft outer halo */}
      <span
        aria-hidden
        className="absolute left-0 top-1 bottom-1 w-[2px] rounded-full"
        style={{
          background: b.color,
          boxShadow: `0 0 6px rgba(${b.rgb},0.9), 0 0 14px rgba(${b.rgb},0.55)`,
        }}
      />
      {isPulsing && (
        <motion.span
          aria-hidden
          className="absolute left-0 top-1 bottom-1 w-[2px] rounded-full"
          style={{ background: b.color }}
          animate={{ opacity: [0.35, 1, 0.35] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      <div className="relative flex items-center gap-1.5 pl-1">
        {/* Status dot */}
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full flex-shrink-0 ring-1 ring-white/15",
            STATUS_DOT[status] ?? "bg-white/60",
          )}
        />

        <span className="flex-shrink-0 text-[10px] leading-none opacity-90">{b.icon}</span>

        <span className="truncate flex-1 leading-tight text-white/95">
          {title}
        </span>

        {extras.length > 0 && (
          <span className="flex -space-x-1 flex-shrink-0 opacity-90">
            {extras.map((c) => {
              const cb = PLATFORM[c.toLowerCase()] ?? FALLBACK;
              return (
                <span
                  key={c}
                  className="h-2.5 w-2.5 rounded-full ring-1 ring-black/60"
                  style={{
                    background: cb.color,
                    boxShadow: `0 0 4px rgba(${cb.rgb},0.7)`,
                  }}
                />
              );
            })}
          </span>
        )}
      </div>
    </motion.div>
  );
}
