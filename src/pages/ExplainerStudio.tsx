import { motion } from 'framer-motion';
import { Film, Sparkles, Clock, Euro, Globe } from 'lucide-react';
import { ExplainerWizard } from '@/components/explainer-studio/ExplainerWizard';

export default function ExplainerStudio() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Header */}
      <div className="relative overflow-hidden border-b border-white/10">
        {/* Background Glow */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-purple-500/5 to-cyan-500/10" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/20 rounded-full blur-[120px]" />
        
        <div className="relative max-w-7xl mx-auto px-6 py-12">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="space-y-4">
              {/* Mission Badge */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/20 border border-primary/30"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
                <span className="text-xs font-medium text-primary">Erklärvideo Studio</span>
              </motion.div>

              {/* Title */}
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-4xl md:text-5xl font-bold"
              >
                <span className="bg-gradient-to-r from-primary via-purple-400 to-cyan-400 bg-clip-text text-transparent">
                  KI-Erklärvideo
                </span>
                <br />
                <span className="text-foreground">in 5 Minuten</span>
              </motion.h1>

              {/* Subtitle */}
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-lg text-muted-foreground max-w-xl"
              >
                Erstelle professionelle Erklärvideos wie Loft-Film – 
                mit KI-Drehbuch, automatischer Visualisierung und Premium Voice-Over.
              </motion.p>

              {/* Stats */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex flex-wrap gap-4 pt-2"
              >
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card/60 border border-white/10">
                  <Clock className="h-4 w-4 text-primary" />
                  <span className="text-sm">5-10 Min statt 6-8 Wochen</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card/60 border border-white/10">
                  <Euro className="h-4 w-4 text-green-400" />
                  <span className="text-sm">~€5 statt €5.000-15.000</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card/60 border border-white/10">
                  <Globe className="h-4 w-4 text-cyan-400" />
                  <span className="text-sm">29+ Sprachen</span>
                </div>
              </motion.div>
            </div>

            {/* Icon */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="hidden md:flex items-center justify-center"
            >
              <div className="relative">
                <div className="absolute inset-0 bg-primary/30 rounded-3xl blur-2xl" />
                <div className="relative w-32 h-32 rounded-3xl bg-gradient-to-br from-primary/20 to-purple-500/20 border border-white/10 flex items-center justify-center">
                  <Film className="h-16 w-16 text-primary" />
                </div>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                  className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center"
                >
                  <Sparkles className="h-4 w-4 text-primary-foreground" />
                </motion.div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <ExplainerWizard />
      </div>
    </div>
  );
}
