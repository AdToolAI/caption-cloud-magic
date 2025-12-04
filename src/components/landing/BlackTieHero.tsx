import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles, Play, TrendingUp, Heart, MessageCircle, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import { LineChart, Line, ResponsiveContainer } from "recharts";

const sparklineData = [
  { value: 30 }, { value: 45 }, { value: 35 }, { value: 55 }, { value: 48 }, 
  { value: 62 }, { value: 58 }, { value: 75 }, { value: 68 }, { value: 85 }
];

export const BlackTieHero = () => {
  const { t } = useTranslation();

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden py-20 md:py-32 px-4">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-[var(--gradient-hero)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,hsl(var(--background))_70%)]" />
      
      {/* Subtle Grid Pattern */}
      <div className="absolute inset-0 opacity-[0.02]" style={{
        backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                          linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
        backgroundSize: '60px 60px'
      }} />

      <div className="container relative z-10 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left Column - Content */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="text-center lg:text-left"
          >
            {/* Badge */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="inline-flex items-center gap-2 bg-card/50 backdrop-blur-md border border-border/50 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6"
            >
              <Sparkles className="h-4 w-4" />
              <span>Powered by AI · For Agents Only</span>
            </motion.div>

            {/* Headline - Elegant Serif with Gold Gradient */}
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold mb-6 leading-[1.1]">
              <span className="bg-gradient-to-r from-primary via-gold to-gold-dark bg-clip-text text-transparent">
                Effektives Marketing.
              </span>
              <br />
              <span className="text-foreground">
                Smarte Kampagnen.
              </span>
            </h1>

            {/* Subline */}
            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-xl mx-auto lg:mx-0 leading-relaxed">
              Dein KI-gestütztes Marketing-Arsenal für Social Media. 
              Erstelle, plane und analysiere Content wie ein Profi.
            </p>

            {/* CTA Group */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Button 
                asChild 
                size="lg" 
                className="bg-gradient-to-r from-primary to-gold-dark text-primary-foreground font-semibold shadow-[var(--shadow-glow-gold)] hover:shadow-[0_0_50px_hsla(43,90%,68%,0.5)] transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] border-0 h-12 px-8"
              >
                <Link to="/generator">
                  Kostenlos starten
                </Link>
              </Button>
              <Button 
                asChild 
                variant="outline" 
                size="lg"
                className="border-primary/50 text-primary hover:bg-primary/10 hover:border-primary transition-all duration-300 h-12 px-8 backdrop-blur-sm"
              >
                <Link to="/pricing" className="flex items-center gap-2">
                  <Play className="h-4 w-4" />
                  Demo ansehen
                </Link>
              </Button>
            </div>

            {/* Stats Row */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.5 }}
              className="flex items-center gap-8 mt-12 justify-center lg:justify-start"
            >
              <div className="text-center">
                <div className="text-2xl md:text-3xl font-bold text-foreground">10K+</div>
                <div className="text-sm text-muted-foreground">Creator</div>
              </div>
              <div className="w-px h-10 bg-border" />
              <div className="text-center">
                <div className="text-2xl md:text-3xl font-bold text-foreground">1M+</div>
                <div className="text-sm text-muted-foreground">Posts erstellt</div>
              </div>
              <div className="w-px h-10 bg-border" />
              <div className="text-center">
                <div className="text-2xl md:text-3xl font-bold text-accent">+43%</div>
                <div className="text-sm text-muted-foreground">Engagement</div>
              </div>
            </motion.div>
          </motion.div>

          {/* Right Column - Gadget Card */}
          <motion.div
            initial={{ opacity: 0, x: 50, rotateY: -10 }}
            animate={{ opacity: 1, x: 0, rotateY: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
            className="relative hidden lg:block"
          >
            {/* Floating Glow Effect */}
            <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 via-accent/10 to-transparent blur-3xl rounded-full" />
            
            {/* Main Gadget Card */}
            <div className="relative bg-card/80 backdrop-blur-xl border border-border/50 rounded-3xl p-6 shadow-2xl hover:shadow-[var(--shadow-glow-cyan)] transition-all duration-500 hover:-translate-y-2">
              {/* Card Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-gold-dark flex items-center justify-center">
                    <span className="text-lg font-bold text-primary-foreground">A</span>
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">AdTool AI</div>
                    <div className="text-xs text-muted-foreground">Marketing Intelligence</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 bg-accent/20 text-accent px-3 py-1 rounded-full text-sm font-medium">
                  <TrendingUp className="h-3 w-3" />
                  +43%
                </div>
              </div>

              {/* Mock Post Preview */}
              <div className="bg-muted/30 rounded-2xl p-4 mb-6 border border-border/30">
                <div className="flex gap-3">
                  <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-accent/30 to-primary/30 flex items-center justify-center">
                    <Sparkles className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-foreground mb-1">Q4 Launch Kampagne</div>
                    <div className="text-xs text-muted-foreground line-clamp-2">
                      🚀 Revolutioniere dein Marketing mit KI-gestützter Content-Erstellung...
                    </div>
                  </div>
                </div>
              </div>

              {/* KPI Row */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="text-center p-3 bg-muted/20 rounded-xl border border-border/30">
                  <div className="flex items-center justify-center gap-1 text-foreground mb-1">
                    <Heart className="h-3 w-3 text-danger" />
                    <span className="font-bold">2.4K</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">Likes</div>
                </div>
                <div className="text-center p-3 bg-muted/20 rounded-xl border border-border/30">
                  <div className="flex items-center justify-center gap-1 text-foreground mb-1">
                    <MessageCircle className="h-3 w-3 text-accent" />
                    <span className="font-bold">847</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">Comments</div>
                </div>
                <div className="text-center p-3 bg-muted/20 rounded-xl border border-border/30">
                  <div className="flex items-center justify-center gap-1 text-foreground mb-1">
                    <Eye className="h-3 w-3 text-primary" />
                    <span className="font-bold">12K</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">Impressions</div>
                </div>
              </div>

              {/* Sparkline Chart */}
              <div className="h-16">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sparklineData}>
                    <defs>
                      <linearGradient id="sparklineGradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#22d3ee" />
                        <stop offset="100%" stopColor="#F5C76A" />
                      </linearGradient>
                    </defs>
                    <Line 
                      type="monotone" 
                      dataKey="value" 
                      stroke="url(#sparklineGradient)" 
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="text-center text-xs text-muted-foreground mt-2">
                Engagement der letzten 30 Tage
              </div>
            </div>

            {/* Floating Decoration Elements */}
            <motion.div 
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -top-4 -right-4 w-20 h-20 bg-gradient-to-br from-primary/30 to-transparent rounded-full blur-xl"
            />
            <motion.div 
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -bottom-4 -left-4 w-24 h-24 bg-gradient-to-br from-accent/20 to-transparent rounded-full blur-xl"
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
};
