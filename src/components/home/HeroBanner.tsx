import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Calendar, TrendingUp, Link2, ArrowRight, Shield, Check, Sparkles } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useRef } from "react";

// Particle component for background effect
const FloatingParticle = ({ delay, duration, x, y }: { delay: number; duration: number; x: number; y: number }) => (
  <motion.div
    className="absolute w-1 h-1 rounded-full bg-primary/30"
    initial={{ opacity: 0, x, y }}
    animate={{ 
      opacity: [0, 1, 0],
      y: [y, y - 100],
      x: [x, x + (Math.random() - 0.5) * 50]
    }}
    transition={{ 
      duration,
      delay,
      repeat: Infinity,
      ease: "easeOut"
    }}
  />
);

export function HeroBanner() {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLDivElement>(null);
  
  // 3D Tilt effect
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  
  const springConfig = { stiffness: 150, damping: 20 };
  const rotateX = useSpring(useTransform(y, [-100, 100], [5, -5]), springConfig);
  const rotateY = useSpring(useTransform(x, [-100, 100], [-5, 5]), springConfig);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    x.set(e.clientX - centerX);
    y.set(e.clientY - centerY);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  // Generate particles
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    delay: Math.random() * 5,
    duration: 3 + Math.random() * 2,
    x: Math.random() * 100,
    y: 100 + Math.random() * 200
  }));

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      style={{ 
        rotateX, 
        rotateY,
        transformStyle: "preserve-3d",
        perspective: 1000
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative overflow-hidden rounded-3xl shadow-xl backdrop-blur-xl bg-card/50 border border-white/10"
    >
      {/* Animated Gradient Background */}
      <div className="absolute inset-0 bg-[var(--gradient-hero)]" />
      
      {/* Animated Glow Orbs */}
      <motion.div 
        className="absolute -top-20 -left-20 w-60 h-60 rounded-full bg-primary/20 blur-3xl"
        animate={{ 
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3]
        }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div 
        className="absolute -bottom-20 -right-20 w-60 h-60 rounded-full bg-accent/20 blur-3xl"
        animate={{ 
          scale: [1.2, 1, 1.2],
          opacity: [0.3, 0.5, 0.3]
        }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />
      
      {/* Floating Particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {particles.map(p => (
          <FloatingParticle key={p.id} delay={p.delay} duration={p.duration} x={p.x} y={p.y} />
        ))}
      </div>

      {/* Grid Pattern Overlay */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                          linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
        backgroundSize: '40px 40px'
      }} />
      
      <div className="relative p-6 md:p-8 lg:p-10">
        <div className="grid lg:grid-cols-2 gap-8 items-center">
          {/* Left: Copy + CTAs */}
          <motion.div 
            className="space-y-6"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="space-y-3">
              {/* AI Badge */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 }}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-medium"
              >
                <Sparkles className="h-3 w-3" />
                <span>KI-gestützt</span>
              </motion.div>
              
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold leading-tight">
                <span className="bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">
                  {t("heroBanner.heading")}
                </span>
              </h1>
              <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-xl">
                {t("heroBanner.subheading")}
              </p>
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button 
                asChild 
                size="lg" 
                className="rounded-xl bg-gradient-to-r from-primary to-primary/80 shadow-[var(--shadow-glow-gold)] hover:shadow-[0_0_50px_hsla(43,90%,68%,0.5)] transition-all duration-300 hover:scale-[1.02] group"
              >
                <Link to="/calendar">
                  <Calendar className="h-5 w-5 mr-2" />
                  {t("heroBanner.ctaPrimary")}
                  <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
                </Link>
              </Button>
              <Button 
                asChild 
                variant="outline" 
                size="lg" 
                className="rounded-xl border-primary/30 hover:bg-primary/10 hover:border-primary transition-all duration-300"
              >
                <Link to="/calendar">
                  {t("heroBanner.ctaSecondary")}
                </Link>
              </Button>
            </div>

            {/* Quick Stats Pills - Animated */}
            <div className="flex flex-wrap gap-3 pt-2">
              {[
                { icon: TrendingUp, text: t("heroBanner.stats.engagement"), color: "primary", delay: 0.4 },
                { icon: Check, text: t("heroBanner.stats.posts"), color: "success", delay: 0.5 },
                { icon: Link2, text: t("heroBanner.stats.accounts"), color: "accent", delay: 0.6 }
              ].map((stat, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: stat.delay }}
                  whileHover={{ scale: 1.05, y: -2 }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full bg-${stat.color}/10 text-${stat.color} border border-${stat.color}/20 backdrop-blur-sm cursor-default`}
                >
                  <stat.icon className="h-4 w-4" />
                  <span className="text-sm font-medium">{stat.text}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Right: Trust Section */}
          <motion.div 
            className="space-y-6"
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            {/* Trust Badge - Glassmorphism */}
            <motion.div 
              whileHover={{ scale: 1.02 }}
              className="flex flex-wrap items-center gap-4 p-4 rounded-xl backdrop-blur-xl bg-white/5 border border-white/10 shadow-lg"
            >
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
              >
                <Shield className="h-6 w-6 text-primary shrink-0" />
              </motion.div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{t("heroBanner.trust.title")}</p>
                <p className="text-xs text-muted-foreground">{t("heroBanner.trust.subtitle")}</p>
              </div>
            </motion.div>

            {/* Trust Logos Row - Enhanced */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t("heroBanner.trust.integrations")}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {[
                  { name: "IG", gradient: "from-purple-500 to-pink-500" },
                  { name: "TT", bg: "bg-foreground", text: "text-background" },
                  { name: "in", bg: "bg-blue-600" },
                  { name: "𝕏", bg: "bg-foreground", text: "text-background" },
                  { name: "YT", bg: "bg-red-600" },
                  { name: "FB", bg: "bg-blue-500" },
                ].map((platform, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 0.8, scale: 1 }}
                    transition={{ delay: 0.5 + i * 0.1 }}
                    whileHover={{ opacity: 1, scale: 1.15, y: -3 }}
                    className={`h-9 w-9 rounded-lg grid place-items-center text-white font-bold text-xs shadow-lg cursor-pointer transition-all ${
                      platform.gradient 
                        ? `bg-gradient-to-br ${platform.gradient}` 
                        : platform.bg
                    }`}
                  >
                    <span className={platform.text || "text-white"}>{platform.name}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
