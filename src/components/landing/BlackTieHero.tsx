import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Sparkles, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import gadgetCardImage from "@/assets/gadget-card-hero.png";

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
            
            {/* Main Gadget Card - Hero Image */}
            <div className="relative">
              <img 
                src={gadgetCardImage} 
                alt="AdTool AI Dashboard Preview" 
                className="w-full max-w-md rounded-3xl shadow-2xl hover:shadow-[var(--shadow-glow-cyan)] transition-all duration-500 hover:-translate-y-2 border border-border/30"
              />
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
