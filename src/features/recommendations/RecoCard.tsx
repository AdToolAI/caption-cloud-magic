import { useState } from 'react';
import { Sparkles, Clock, TrendingUp, MessageSquare, Check, Zap } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/hooks/useTranslation';
import { FEATURE_FLAGS } from '@/config/pricing';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';

interface Recommendation {
  id: string;
  type: 'time' | 'format' | 'hook' | 'caption';
  icon: any;
  text: string;
  impact: string;
  action: () => void;
}

export const RecoCard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [appliedRecs, setAppliedRecs] = useState<string[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Mock recommendations - in production these would come from AI analysis
  const recommendations: Recommendation[] = [
    {
      id: 'time_1',
      type: 'time',
      icon: Clock,
      text: 'Poste Di/Do 18–20 Uhr für +12% Engagement',
      impact: '+12%',
      action: () => navigate('/post-time-advisor')
    },
    {
      id: 'format_1',
      type: 'format',
      icon: TrendingUp,
      text: 'Kurzvideo statt Karussell: +9% Views',
      impact: '+9%',
      action: () => navigate('/generator')
    },
    {
      id: 'hook_1',
      type: 'hook',
      icon: MessageSquare,
      text: 'Hook-Stil "Neugier" performt +18%',
      impact: '+18%',
      action: () => navigate('/hook-generator')
    }
  ];

  const handleApply = (rec: Recommendation) => {
    // Trigger confetti
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.7 },
      colors: ['#F5C76A', '#22d3ee', '#10b981']
    });
    
    setAppliedRecs([...appliedRecs, rec.id]);
    setTimeout(() => rec.action(), 500);
  };

  // Feature flag check
  const ffEnabled = FEATURE_FLAGS.ff_reco_card;

  if (!ffEnabled || recommendations.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="p-6 backdrop-blur-xl bg-card/50 border border-white/10 overflow-hidden relative">
        {/* Background glow */}
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative">
          <div className="flex items-center gap-2 mb-4">
            <motion.div 
              className="p-2 rounded-lg bg-primary/10"
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
            >
              <Sparkles className="h-5 w-5 text-primary" />
            </motion.div>
            <h3 className="text-lg font-semibold text-foreground">
              KI-Empfehlungen für dich
            </h3>
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="ml-auto"
            >
              <Zap className="h-4 w-4 text-accent" />
            </motion.div>
          </div>

          <div className="space-y-3">
            <AnimatePresence>
              {recommendations.map((rec, index) => {
                const Icon = rec.icon;
                const isApplied = appliedRecs.includes(rec.id);
                const isHovered = hoveredId === rec.id;

                return (
                  <motion.div
                    key={rec.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    onHoverStart={() => setHoveredId(rec.id)}
                    onHoverEnd={() => setHoveredId(null)}
                    whileHover={{ scale: 1.01 }}
                    className={`relative flex items-start gap-3 p-4 rounded-xl border transition-all duration-300 ${
                      isApplied 
                        ? 'bg-success/10 border-success/30' 
                        : isHovered
                          ? 'bg-primary/10 border-primary/30 shadow-[var(--shadow-glow-gold)]'
                          : 'bg-white/5 border-white/10 hover:border-primary/20'
                    }`}
                  >
                    {/* Glow effect on hover */}
                    <AnimatePresence>
                      {isHovered && !isApplied && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="absolute inset-0 bg-gradient-to-r from-primary/5 to-accent/5 rounded-xl pointer-events-none"
                        />
                      )}
                    </AnimatePresence>
                    
                    <motion.div 
                      className={`flex-shrink-0 mt-0.5 p-2 rounded-lg transition-colors ${
                        isApplied ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'
                      }`}
                      animate={isHovered ? { rotate: [0, -10, 10, 0] } : {}}
                      transition={{ duration: 0.4 }}
                    >
                      {isApplied ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </motion.div>
                    
                    <div className="flex-1 min-w-0 relative">
                      <p className="text-sm text-foreground">
                        {rec.text}
                      </p>
                      {/* Impact badge */}
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.3 + index * 0.1 }}
                        className="inline-flex items-center mt-2 px-2 py-0.5 rounded-full text-xs font-medium bg-accent/10 text-accent"
                      >
                        {rec.impact} Impact
                      </motion.span>
                    </div>

                    <Button
                      size="sm"
                      variant={isApplied ? 'secondary' : 'default'}
                      onClick={() => handleApply(rec)}
                      disabled={isApplied}
                      className={`flex-shrink-0 transition-all ${
                        isApplied 
                          ? 'bg-success/20 text-success' 
                          : 'bg-primary hover:bg-primary/90 shadow-lg hover:shadow-[var(--shadow-glow-gold)]'
                      }`}
                    >
                      {isApplied ? (
                        <>
                          <Check className="h-3 w-3 mr-1" />
                          Übernommen
                        </>
                      ) : (
                        'Übernehmen'
                      )}
                    </Button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          <p className="text-xs text-muted-foreground mt-4 flex items-center gap-2">
            <motion.span
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-2 h-2 rounded-full bg-accent"
            />
            Basierend auf deinen Performance-Daten der letzten 30 Tage
          </p>
        </div>
      </Card>
    </motion.div>
  );
};
