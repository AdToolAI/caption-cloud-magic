import { motion } from 'framer-motion';
import { Lightbulb, Target, Share2, BarChart3, Sparkles, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConsultationResult } from '@/types/explainer-studio';

interface MarketingStrategyPanelProps {
  recommendation: ConsultationResult;
}

export function MarketingStrategyPanel({ recommendation }: MarketingStrategyPanelProps) {
  const strategies = recommendation.strategyTips || [];
  const platformTips = recommendation.platformTips || [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-primary/5 via-purple-500/5 to-cyan-500/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
          <Lightbulb className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Marketing-Strategie</h3>
          <p className="text-sm text-muted-foreground">
            Empfehlungen basierend auf deiner Beratung
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Usage Recommendations */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-cyan-400" />
            <h4 className="font-medium">Einsatzempfehlungen</h4>
          </div>
          <div className="space-y-2">
            {strategies.length > 0 ? (
              strategies.map((tip, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-start gap-2 p-3 bg-muted/20 rounded-lg border border-white/5"
                >
                  <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">{tip}</span>
                </motion.div>
              ))
            ) : (
              <>
                <div className="flex items-start gap-2 p-3 bg-muted/20 rounded-lg border border-white/5">
                  <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5" />
                  <span className="text-sm">Auf der Website als Hero-Video einbetten</span>
                </div>
                <div className="flex items-start gap-2 p-3 bg-muted/20 rounded-lg border border-white/5">
                  <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5" />
                  <span className="text-sm">In E-Mail-Signaturen verlinken</span>
                </div>
                <div className="flex items-start gap-2 p-3 bg-muted/20 rounded-lg border border-white/5">
                  <CheckCircle2 className="h-4 w-4 text-green-400 mt-0.5" />
                  <span className="text-sm">Bei Kundenpräsentationen einsetzen</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Platform Tips */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-purple-400" />
            <h4 className="font-medium">Plattform-Tipps</h4>
          </div>
          <div className="space-y-2">
            {platformTips.length > 0 ? (
              platformTips.map((tip, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  className="flex items-start gap-2 p-3 bg-muted/20 rounded-lg border border-white/5"
                >
                  <Sparkles className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-sm">{tip}</span>
                </motion.div>
              ))
            ) : (
              <>
                <div className="flex items-start gap-2 p-3 bg-muted/20 rounded-lg border border-white/5">
                  <Sparkles className="h-4 w-4 text-primary mt-0.5" />
                  <span className="text-sm">LinkedIn: Als Thought Leadership posten</span>
                </div>
                <div className="flex items-start gap-2 p-3 bg-muted/20 rounded-lg border border-white/5">
                  <Sparkles className="h-4 w-4 text-primary mt-0.5" />
                  <span className="text-sm">YouTube: Mit SEO-optimiertem Titel hochladen</span>
                </div>
                <div className="flex items-start gap-2 p-3 bg-muted/20 rounded-lg border border-white/5">
                  <Sparkles className="h-4 w-4 text-primary mt-0.5" />
                  <span className="text-sm">Instagram: Als 9:16 Reel exportieren</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* A/B Test Ideas */}
      <div className="mt-6 p-4 bg-muted/10 rounded-xl border border-white/5">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h4 className="font-medium">A/B-Test Ideen</h4>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary/60" />
            <span>Alternative Hooks testen</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-500/60" />
            <span>Verschiedene CTAs vergleichen</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-500/60" />
            <span>Kurz vs. Lang testen</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
