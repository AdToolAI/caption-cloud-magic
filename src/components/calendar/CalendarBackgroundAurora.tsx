import { motion } from "framer-motion";

/**
 * Subtle Bond-style aurora layer behind the calendar.
 * Purely decorative — pointer-events: none, no functional impact.
 */
export function CalendarBackgroundAurora() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden -z-10"
    >
      {/* Gold radial spotlight, top-left */}
      <motion.div
        className="absolute -top-32 -left-32 w-[55vw] h-[55vw] rounded-full"
        style={{
          background:
            "radial-gradient(circle at center, hsla(43, 90%, 68%, 0.10), transparent 65%)",
          filter: "blur(40px)",
        }}
        animate={{ opacity: [0.5, 0.9, 0.5], scale: [1, 1.05, 1] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Cyan radial spotlight, bottom-right */}
      <motion.div
        className="absolute -bottom-40 -right-32 w-[50vw] h-[50vw] rounded-full"
        style={{
          background:
            "radial-gradient(circle at center, hsla(190, 80%, 55%, 0.08), transparent 65%)",
          filter: "blur(40px)",
        }}
        animate={{ opacity: [0.4, 0.75, 0.4], scale: [1, 1.08, 1] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      />
      {/* Faint vertical gold hairline */}
      <div
        className="absolute left-1/2 top-0 bottom-0 w-px opacity-[0.06]"
        style={{
          background:
            "linear-gradient(to bottom, transparent, hsl(43, 90%, 68%), transparent)",
        }}
      />
    </div>
  );
}
