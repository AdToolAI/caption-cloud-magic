import { motion } from 'framer-motion';
import { Sparkles, RefreshCw, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

interface PostingTimesHeroHeaderProps {
  metadata?: {
    generatedAt: string;
    hasHistory: boolean;
    historyDays: number;
  };
  isSyncing: boolean;
  onSync: () => void;
}

export function PostingTimesHeroHeader({ metadata, isSyncing, onSync }: PostingTimesHeroHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl backdrop-blur-xl bg-card/60 border border-white/10 p-8"
    >
      {/* Background Glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-cyan-500/5 pointer-events-none" />
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      
      <div className="relative flex items-start justify-between">
        <div className="space-y-3">
          {/* Mission Badge */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full backdrop-blur-md bg-cyan-500/10 border border-cyan-500/30"
          >
            <Activity className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span className="text-xs font-medium text-cyan-400">Live-Prognose</span>
          </motion.div>
          
          {/* Title with gradient */}
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-4xl font-bold"
          >
            <span className="bg-gradient-to-r from-primary via-primary to-cyan-400 bg-clip-text text-transparent">
              Posting-Zeit-Berater
            </span>
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-muted-foreground max-w-lg"
          >
            KI-optimierte Zeitempfehlungen basierend auf deiner Performance-Historie und Plattform-Peaks
          </motion.p>
        </div>

        {/* Right side - Meta info and Sync */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="flex items-center gap-4"
        >
          {metadata && (
            <div className="text-right text-sm space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>Aktualisiert:</span>
                <span className="font-mono text-foreground">
                  {format(new Date(metadata.generatedAt), 'HH:mm', { locale: de })}
                </span>
              </div>
              {metadata.hasHistory && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Sparkles className="w-3 h-3 text-primary" />
                  <span>{metadata.historyDays} Tage Historie</span>
                </div>
              )}
            </div>
          )}
          
          <Button
            onClick={onSync}
            disabled={isSyncing}
            className="gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-[0_0_20px_rgba(245,199,106,0.3)] hover:shadow-[0_0_30px_rgba(245,199,106,0.5)] transition-all duration-300"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            Synchronisieren
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
}