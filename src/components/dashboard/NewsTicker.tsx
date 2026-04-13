import { useEffect, useState } from "react";
import { motion } from "framer-motion";

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

  useEffect(() => {
    const interval = setInterval(() => {
      setShuffledTips(shuffle(TIPS));
    }, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const tickerText = shuffledTips.join(SEPARATOR) + SEPARATOR;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden h-9 bg-gradient-to-r from-black/60 via-[hsl(var(--background))]/80 to-black/60 backdrop-blur-md group"
    >
      {/* Top glow line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      {/* Bottom glow line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

      <div className="flex items-center h-full">
        {/* Label badge */}
        <div className="relative z-10 flex-shrink-0 flex items-center gap-1.5 px-3 h-full bg-gradient-to-r from-black/80 to-transparent border-r border-primary/20">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase text-primary border border-primary/30 shadow-[0_0_8px_hsla(43,90%,68%,0.3)]">
            LIVE TIPS
          </span>
        </div>

        {/* Scrolling text */}
        <div className="overflow-hidden flex-1 h-full flex items-center">
          <div
            className="flex whitespace-nowrap animate-[marquee_60s_linear_infinite] group-hover:[animation-play-state:paused]"
          >
            <span className="text-sm text-primary/90 font-medium tracking-wide">
              {tickerText}
            </span>
            <span className="text-sm text-primary/90 font-medium tracking-wide">
              {tickerText}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
