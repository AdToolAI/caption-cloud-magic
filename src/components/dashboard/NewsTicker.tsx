import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Switch } from "@/components/ui/switch";

const TIPS = [
  "📊 Poste Reels zwischen 18-20 Uhr für 3x mehr Reichweite",
  "🎯 Nutze 3-5 Hashtags pro Post für optimale Sichtbarkeit",
  "🔥 Karussell-Posts haben 1.4x mehr Engagement als Einzelbilder",
  "⏰ Beste LinkedIn-Zeit: Dienstag & Mittwoch 8-10 Uhr",
  "🎬 Die ersten 3 Sekunden entscheiden über Watch-Time",
  "💡 Storytelling-Captions erhöhen die Speicherrate um 40%",
  "📱 Vertikales Video (9:16) wird von allen Plattformen bevorzugt",
  "🚀 Regelmäßigkeit schlägt Perfektion – 3x/Woche reicht",
  "🎨 Einheitliche Farbpalette steigert Wiedererkennung um 80%",
  "📈 CTA in der Caption erhöht Klickrate um 25%",
  "🧠 Hooks mit Zahlen performen 2x besser als Fragen",
  "💬 Antworte auf Kommentare in den ersten 60 Min für mehr Reach",
  "🎵 Trending Audio auf TikTok = bis zu 5x mehr Views",
  "📌 Pinne deine Top-3-Posts für neue Profilbesucher",
  "🔄 Repurpose: Aus 1 Video werden 5 Posts für 5 Plattformen",
  "✨ Behind-the-Scenes Content hat 3x höhere Engagement-Rate",
  "📝 Untertitel erhöhen die Watchtime um 40% – nutze sie immer",
  "🎯 Micro-Influencer haben 60% mehr Engagement als große Accounts",
  "⚡ Shorts unter 30 Sekunden haben die beste Completion Rate",
  "🏆 Konsistente Brand Voice steigert Follower-Wachstum um 33%",
];

const SEPARATOR = " ◆ ";

const shuffle = (arr: string[]) => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export const NewsTicker = () => {
  const [shuffledTips, setShuffledTips] = useState(() => shuffle(TIPS));
  const [isVisible, setIsVisible] = useState(() => {
    const stored = localStorage.getItem("newsticker-visible");
    return stored !== "false";
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setShuffledTips(shuffle(TIPS));
    }, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    localStorage.setItem("newsticker-visible", String(isVisible));
  }, [isVisible]);

  const tickerText = shuffledTips.join(SEPARATOR) + SEPARATOR;

  return (
    <AnimatePresence mode="wait">
      {isVisible ? (
        <motion.div
          key="ticker"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
          className="relative overflow-hidden bg-gradient-to-r from-[hsl(220,50%,3%)] via-[hsl(var(--background))]/80 to-[hsl(220,50%,3%)] backdrop-blur-md group"
        >
          {/* Top glow line */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent shadow-[0_0_12px_hsl(var(--primary)/0.4)]" />
          {/* Bottom glow line */}
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent shadow-[0_0_12px_hsl(var(--primary)/0.4)]" />
          {/* Subtle shimmer overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/[0.03] to-transparent pointer-events-none" />

          <div className="flex items-center h-10">
            {/* Label badge */}
            <div className="relative z-10 flex-shrink-0 flex items-center gap-1.5 px-4 h-full bg-gradient-to-r from-[hsl(220,50%,3%)] to-transparent border-r border-primary/20">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-display font-bold tracking-[0.2em] uppercase text-primary border border-primary/40 shadow-[0_0_14px_hsl(var(--primary)/0.35)]">
                LIVE TIPS
              </span>
            </div>

            {/* Scrolling text */}
            <div className="overflow-hidden flex-1 h-full flex items-center">
              <div className="flex whitespace-nowrap animate-[marquee_120s_linear_infinite] group-hover:[animation-play-state:paused]">
                <span className="text-sm text-primary/90 font-medium tracking-wide drop-shadow-[0_0_6px_hsl(var(--primary)/0.3)]">
                  {tickerText}
                </span>
                <span className="text-sm text-primary/90 font-medium tracking-wide drop-shadow-[0_0_6px_hsl(var(--primary)/0.3)]">
                  {tickerText}
                </span>
              </div>
            </div>

            {/* Toggle switch */}
            <div className="relative z-10 flex-shrink-0 flex items-center gap-2 px-4 h-full bg-gradient-to-l from-[hsl(220,50%,3%)] to-transparent border-l border-primary/20">
              <Switch
                checked={isVisible}
                onCheckedChange={setIsVisible}
                className="data-[state=checked]:bg-primary/80 data-[state=unchecked]:bg-muted h-5 w-9"
              />
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="ticker-collapsed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="flex justify-end px-4 py-1"
        >
          <button
            onClick={() => setIsVisible(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-display font-bold tracking-[0.15em] uppercase text-primary/60 border border-primary/20 hover:border-primary/40 hover:text-primary transition-all duration-300 hover:shadow-[0_0_10px_hsl(var(--primary)/0.2)]"
          >
            ◆ TIPS
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
