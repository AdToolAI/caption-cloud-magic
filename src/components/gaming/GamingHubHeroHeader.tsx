import { motion } from "framer-motion";
import { Gamepad2, Wifi, WifiOff } from "lucide-react";

interface GamingHubHeroHeaderProps {
  isConnected: boolean;
  twitchUsername?: string;
}

export function GamingHubHeroHeader({ isConnected, twitchUsername }: GamingHubHeroHeaderProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-card/40 backdrop-blur-xl p-8 mb-6">
      {/* Glow Orbs */}
      <div className="absolute -top-20 -left-20 w-60 h-60 bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -right-20 w-60 h-60 bg-violet-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-purple-400/10 rounded-full blur-2xl pointer-events-none" />

      <div className="relative z-10">
        {/* Mission Badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-2 mb-4"
        >
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/30 text-xs font-medium text-purple-400">
            <span className="relative flex h-2 w-2">
              <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${isConnected ? 'bg-green-400' : 'bg-purple-400'}`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isConnected ? 'bg-green-500' : 'bg-purple-500'}`} />
            </span>
            {isConnected ? `Twitch Connected · ${twitchUsername}` : 'Gaming Hub'}
          </div>
        </motion.div>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="flex items-center gap-4"
        >
          <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500/20 to-violet-600/20 border border-purple-500/30 shadow-[0_0_20px_rgba(145,70,255,0.15)]">
            <Gamepad2 className="h-8 w-8 text-purple-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 via-violet-400 to-purple-300 bg-clip-text text-transparent">
              Gaming Hub
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Stream-Tools, Clip-Creator & Content-Automation für Gamer
            </p>
          </div>
        </motion.div>

        {/* Connection Status Bar */}
        {isConnected && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"
          >
            <Wifi className="h-3 w-3 text-green-400" />
            <span>Verbunden mit Twitch · Alle Features freigeschaltet</span>
          </motion.div>
        )}
      </div>
    </div>
  );
}
