import { motion } from 'framer-motion';
import { Sparkles, MessageSquare, Zap } from 'lucide-react';
import { CreditBalance } from '@/components/credits/CreditBalance';
import { AICallStatus } from '@/components/ai/AICallStatus';

interface GeneratorHeroHeaderProps {
  status: {
    stage: 'idle' | 'credit_check' | 'rate_check' | 'executing' | 'retrying' | 'success' | 'error';
    message: string;
    retryAttempt?: number;
  };
}

export function GeneratorHeroHeader({ status }: GeneratorHeroHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="relative mb-10 text-center"
    >
      {/* Background Glow */}
      <div className="absolute inset-0 -top-10 bg-gradient-to-b from-primary/10 via-transparent to-transparent blur-3xl -z-10" />
      
      {/* Floating Orbs */}
      <motion.div
        animate={{ 
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3]
        }}
        transition={{ duration: 4, repeat: Infinity }}
        className="absolute -top-10 left-1/4 w-32 h-32 bg-primary/10 rounded-full blur-3xl"
      />
      <motion.div
        animate={{ 
          scale: [1, 1.3, 1],
          opacity: [0.2, 0.4, 0.2]
        }}
        transition={{ duration: 5, repeat: Infinity, delay: 1 }}
        className="absolute -top-5 right-1/4 w-40 h-40 bg-accent/10 rounded-full blur-3xl"
      />

      {/* Mission Badge */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
        className="inline-flex items-center gap-2 px-4 py-2 mb-4 rounded-full 
                   backdrop-blur-xl bg-card/60 border border-primary/30
                   shadow-[0_0_20px_hsla(43,90%,68%,0.15)]"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
        </span>
        <MessageSquare className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium text-primary uppercase tracking-wider">
          KI Text-Studio
        </span>
      </motion.div>

      {/* Gradient Headline */}
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent"
      >
        Textgenerator
      </motion.h1>

      {/* Credits Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="flex justify-center mb-4"
      >
        <div className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl p-4 
                        shadow-[0_0_30px_hsla(43,90%,68%,0.1)]">
          <CreditBalance />
        </div>
      </motion.div>

      {/* AI Status */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <AICallStatus stage={status.stage} message={status.message} retryAttempt={status.retryAttempt} />
      </motion.div>

      {/* Feature Highlights */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="flex flex-wrap justify-center gap-3 mt-6"
      >
        {[
          { icon: Sparkles, label: 'KI-Generiert' },
          { icon: Zap, label: 'Sofort einsatzbereit' },
          { icon: MessageSquare, label: 'Multi-Plattform' },
        ].map((item, idx) => (
          <div
            key={idx}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full 
                       bg-muted/30 border border-white/10 text-sm text-muted-foreground"
          >
            <item.icon className="h-3.5 w-3.5 text-primary" />
            {item.label}
          </div>
        ))}
      </motion.div>
    </motion.div>
  );
}
