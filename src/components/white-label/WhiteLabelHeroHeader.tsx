import { motion } from 'framer-motion';
import { Palette, Globe, Code, Sparkles } from 'lucide-react';

export const WhiteLabelHeroHeader = () => {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-card/80 via-card/60 to-card/40 backdrop-blur-xl border border-white/10 p-8 mb-8">
      {/* Animated background glow orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute -top-20 -right-20 w-64 h-64 bg-primary/20 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute -bottom-20 -left-20 w-64 h-64 bg-cyan-500/20 rounded-full blur-3xl"
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"
          animate={{
            rotate: [0, 360],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      </div>

      <div className="relative z-10">
        {/* Mission Badge */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30 backdrop-blur-sm mb-6"
        >
          <motion.div
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.7, 1, 0.7]
            }}
            transition={{ 
              duration: 2, 
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="w-2 h-2 rounded-full bg-primary"
          />
          <span className="text-sm font-medium text-primary">Enterprise Feature</span>
          <Sparkles className="w-4 h-4 text-primary" />
        </motion.div>

        {/* Gradient Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-4xl md:text-5xl font-bold mb-4"
        >
          <span className="bg-gradient-to-r from-primary via-purple-400 to-cyan-400 bg-clip-text text-transparent">
            White-Label Studio
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-lg text-muted-foreground max-w-2xl mb-8"
        >
          Verwandeln Sie die Plattform in Ihre eigene Marke. Logo, Farben, Domain – alles anpassbar.
        </motion.p>

        {/* Feature Badges */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-wrap gap-3"
        >
          {[
            { icon: Palette, label: 'Custom Branding', color: 'from-pink-500 to-rose-500' },
            { icon: Globe, label: 'Eigene Domain', color: 'from-cyan-500 to-blue-500' },
            { icon: Code, label: 'CSS-Editor', color: 'from-purple-500 to-violet-500' },
          ].map((feature, index) => (
            <motion.div
              key={feature.label}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.4 + index * 0.1 }}
              whileHover={{ scale: 1.05, y: -2 }}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-card/60 backdrop-blur-sm border border-white/10 hover:border-white/20 transition-colors"
            >
              <div className={`p-1.5 rounded-lg bg-gradient-to-r ${feature.color}`}>
                <feature.icon className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-sm font-medium">{feature.label}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
};
