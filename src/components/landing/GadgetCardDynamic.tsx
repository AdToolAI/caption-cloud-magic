import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useTranslation } from "@/hooks/useTranslation";
import { useState, useEffect, useRef } from "react";
import { Heart, MessageCircle, Share2, Bookmark, TrendingUp, Clock, Sparkles, Volume2, VolumeX, Play } from "lucide-react";

// Animated counter component
const AnimatedCounter = ({ value, suffix = "" }: { value: number; suffix?: string }) => {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    const duration = 1500;
    const steps = 60;
    const increment = value / steps;
    let current = 0;
    
    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setCount(value);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
    
    return () => clearInterval(timer);
  }, [value]);
  
  return <span>{count.toLocaleString()}{suffix}</span>;
};

// Matrix Code Rain effect - futuristic falling characters
const MatrixRain = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-25">
    {[...Array(12)].map((_, i) => (
      <motion.div
        key={i}
        className="absolute text-accent text-[10px] font-mono leading-tight"
        style={{ left: `${i * 8.5}%` }}
        initial={{ y: "-100%", opacity: 0 }}
        animate={{ 
          y: "120%", 
          opacity: [0, 1, 1, 0]
        }}
        transition={{
          duration: 3 + Math.random() * 2,
          repeat: Infinity,
          delay: Math.random() * 2,
          ease: "linear"
        }}
      >
        {['0', '1', 'AI', '⚡', '◆', '▲', '■', '∞'].map((char, idx) => (
          <div key={idx} className="mb-0.5 text-center">{char}</div>
        ))}
      </motion.div>
    ))}
  </div>
);

// Holographic Prism overlay effect
const HolographicPrism = () => (
  <motion.div
    className="absolute inset-0 pointer-events-none rounded-3xl"
    animate={{
      background: [
        "linear-gradient(45deg, transparent 0%, hsl(var(--accent) / 0.08) 25%, hsl(var(--primary) / 0.08) 50%, hsl(var(--accent) / 0.08) 75%, transparent 100%)",
        "linear-gradient(225deg, transparent 0%, hsl(var(--primary) / 0.12) 25%, hsl(var(--accent) / 0.12) 50%, hsl(var(--primary) / 0.08) 75%, transparent 100%)",
        "linear-gradient(45deg, transparent 0%, hsl(var(--accent) / 0.08) 25%, hsl(var(--primary) / 0.08) 50%, hsl(var(--accent) / 0.08) 75%, transparent 100%)",
      ]
    }}
    transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
  />
);

// Scanline effect
const Scanlines = () => (
  <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl opacity-30">
    <motion.div
      className="absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-accent/20 to-transparent"
      animate={{ y: ["-100%", "500%"] }}
      transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
    />
  </div>
);

// Electric circuit lines effect
const CircuitLines = () => (
  <div className="absolute right-0 top-0 bottom-0 w-10 overflow-hidden pointer-events-none">
    {[...Array(6)].map((_, i) => (
      <motion.div
        key={i}
        className="absolute"
        style={{ 
          top: `${15 + i * 15}%`,
          right: 0,
          width: '100%',
        }}
      >
        <motion.div
          className="h-[1px] bg-gradient-to-l from-accent via-accent/60 to-transparent"
          initial={{ width: 0, opacity: 0 }}
          animate={{ 
            width: ['0%', '100%', '100%', '0%'],
            opacity: [0, 1, 1, 0]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            delay: i * 0.4,
            ease: "easeInOut"
          }}
        />
        <motion.div
          className="absolute right-0 w-1.5 h-1.5 rounded-full bg-accent"
          initial={{ opacity: 0, scale: 0 }}
          animate={{ 
            opacity: [0, 1, 1, 0],
            scale: [0, 1, 1, 0]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            delay: i * 0.4 + 0.3,
            ease: "easeInOut"
          }}
        />
      </motion.div>
    ))}
  </div>
);

export const GadgetCardDynamic = () => {
  const { t, language } = useTranslation();
  const cardRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  
  // 3D Tilt effect
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-100, 100], [8, -8]), { stiffness: 300, damping: 30 });
  const rotateY = useSpring(useTransform(x, [-100, 100], [-8, 8]), { stiffness: 300, damping: 30 });

  const handleMouseMove = (e: React.MouseEvent) => {
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

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
    }
  };

  const handlePlayClick = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play();
    }
  };

  // Get translated content
  const gadget = t('gadgetCard') as any;

  // Language-specific content
  const content = {
    de: {
      username: "John Doe",
      handle: "@portfolio",
      postTitle: "Magische Weihnachten 🎄",
      caption: "Perfekter Abend am Meer. Die Natur ist der beste Künstler.",
    },
    en: {
      username: "John Doe",
      handle: "@portfolio",
      postTitle: "Magical Christmas 🎄",
      caption: "Perfect evening by the sea. Nature is the best artist.",
    },
    es: {
      username: "John Doe",
      handle: "@portfolio",
      postTitle: "Navidad Mágica 🎄",
      caption: "Tarde perfecta junto al mar. La naturaleza es la mejor artista.",
    }
  };

  const currentContent = content[language as keyof typeof content] || content.de;

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
      className="relative perspective-1000"
    >
      {/* Background Glow */}
      <div className="absolute -inset-4 bg-gradient-to-r from-primary/30 via-accent/20 to-primary/30 blur-3xl rounded-full animate-pulse" />
      
      {/* Neon Border Glow */}
      <div className="absolute -inset-[2px] bg-gradient-to-r from-accent via-primary to-accent rounded-[28px] opacity-70 blur-sm" />
      
      {/* Main Card */}
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        className="relative bg-card/90 backdrop-blur-xl border border-accent/30 rounded-3xl p-6 w-full max-w-[340px] overflow-hidden"
        style={{
          boxShadow: `
            0 0 1px hsl(var(--accent)),
            0 0 20px hsl(var(--accent) / 0.3),
            0 0 40px hsl(var(--accent) / 0.2),
            0 25px 50px rgba(0, 0, 0, 0.4)
          `
        }}
      >
        <MatrixRain />
        <Scanlines />
        <CircuitLines />
        <HolographicPrism />
        
        {/* Top Engagement Badge */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="absolute -top-3 left-1/2 -translate-x-1/2 z-20"
        >
          <div className="bg-gradient-to-r from-accent to-primary px-4 py-1.5 rounded-full flex items-center gap-2 shadow-lg">
            <TrendingUp className="h-3.5 w-3.5 text-primary-foreground" />
            <span className="text-sm font-bold text-primary-foreground">
              +<AnimatedCounter value={43} suffix="%" />
            </span>
            <span className="text-xs text-primary-foreground/80">{gadget?.engagement || 'Engagement'}</span>
          </div>
        </motion.div>

        {/* Mock Social Post */}
        <div className="mt-6 relative z-10">
          {/* User Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground font-bold">
                JD
              </div>
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-card"
              />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-foreground text-sm">{currentContent.username}</div>
              <div className="text-xs text-muted-foreground">{currentContent.handle}</div>
            </div>
            <Sparkles className="h-4 w-4 text-primary" />
          </div>

          {/* Post Video - Autoplay with sound control */}
          <motion.div
            className="relative aspect-square rounded-xl overflow-hidden mb-4"
            whileHover={{ scale: 1.02 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <video
              ref={videoRef}
              autoPlay
              muted={isMuted}
              playsInline
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
              className="w-full h-full object-cover"
            >
              <source 
                src="https://lbunafpxuskwmsrraqxl.supabase.co/storage/v1/object/public/ai-videos/8948d3d9-2c5e-4405-9e9c-1624448e7189/a028c06a-764d-44a3-8856-e3b1fa1855d4.mp4" 
                type="video/mp4" 
              />
            </video>
            
            {/* Play Button - appears when video is not playing */}
            {!isPlaying && (
              <motion.button
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                onClick={handlePlayClick}
                className="absolute inset-0 flex items-center justify-center z-10"
              >
                {/* Pulsing glow ring */}
                <motion.div
                  className="absolute w-20 h-20 rounded-full bg-accent/20"
                  animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                {/* Play button */}
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="relative w-16 h-16 rounded-full bg-gradient-to-br from-accent to-primary flex items-center justify-center shadow-lg"
                  style={{
                    boxShadow: '0 0 30px hsl(var(--accent) / 0.5)'
                  }}
                >
                  <Play className="h-7 w-7 text-primary-foreground ml-1" fill="currentColor" />
                </motion.div>
              </motion.button>
            )}
            
            {/* Mute/Unmute Button */}
            <motion.button
              onClick={toggleMute}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm p-2 rounded-full border border-white/20 z-10"
            >
              {isMuted ? (
                <VolumeX className="h-4 w-4 text-white" />
              ) : (
                <Volume2 className="h-4 w-4 text-white" />
              )}
            </motion.button>
            
            {/* Overlay gradient */}
            <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-4 left-4 right-4">
              <p className="text-white text-sm font-medium drop-shadow-lg">{currentContent.postTitle}</p>
            </div>
            
            {/* Holographic shimmer */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none"
              animate={{ x: ["-100%", "200%"] }}
              transition={{ duration: 3, repeat: Infinity, repeatDelay: 2 }}
            />
          </motion.div>

          {/* Post Actions */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <motion.div 
                whileHover={{ scale: 1.2 }} 
                className="flex items-center gap-1 text-muted-foreground hover:text-red-500 cursor-pointer transition-colors"
              >
                <Heart className="h-4 w-4" />
                <span className="text-xs font-medium"><AnimatedCounter value={1247} /></span>
              </motion.div>
              <motion.div 
                whileHover={{ scale: 1.2 }} 
                className="flex items-center gap-1 text-muted-foreground hover:text-accent cursor-pointer transition-colors"
              >
                <MessageCircle className="h-4 w-4" />
                <span className="text-xs font-medium"><AnimatedCounter value={84} /></span>
              </motion.div>
              <motion.div 
                whileHover={{ scale: 1.2 }} 
                className="flex items-center gap-1 text-muted-foreground hover:text-primary cursor-pointer transition-colors"
              >
                <Share2 className="h-4 w-4" />
              </motion.div>
            </div>
            <motion.div whileHover={{ scale: 1.2 }} className="text-muted-foreground hover:text-primary cursor-pointer transition-colors">
              <Bookmark className="h-4 w-4" />
            </motion.div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <motion.div
              whileHover={{ scale: 1.03 }}
              className="bg-background/50 backdrop-blur-sm rounded-lg p-3 border border-border/50"
            >
              <div className="text-xs text-muted-foreground mb-1">{gadget?.reach || 'Reichweite'}</div>
              <div className="text-lg font-bold text-foreground flex items-center gap-1">
                <AnimatedCounter value={23} suffix="K" />
                <TrendingUp className="h-3 w-3 text-green-500" />
              </div>
            </motion.div>
            <motion.div
              whileHover={{ scale: 1.03 }}
              className="bg-background/50 backdrop-blur-sm rounded-lg p-3 border border-border/50"
            >
              <div className="text-xs text-muted-foreground mb-1">{gadget?.comments || 'Kommentare'}</div>
              <div className="text-lg font-bold text-foreground">
                <AnimatedCounter value={84} />
              </div>
            </motion.div>
          </div>

          {/* Best Time Prediction */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="bg-gradient-to-r from-primary/10 to-accent/10 rounded-xl p-3 border border-primary/20 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              <span className="text-sm text-foreground">{gadget?.bestTime || 'Beste Zeit'}:</span>
              <span className="text-sm font-bold text-primary">19:00</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">{gadget?.predicted || 'Vorhersage'}:</span>
              <span className="text-xs font-bold text-green-500">+12%</span>
            </div>
          </motion.div>
        </div>

        {/* Corner Decorations */}
        <div className="absolute top-2 left-2 w-3 h-3 border-l-2 border-t-2 border-accent/50 rounded-tl" />
        <div className="absolute top-2 right-2 w-3 h-3 border-r-2 border-t-2 border-accent/50 rounded-tr" />
        <div className="absolute bottom-2 left-2 w-3 h-3 border-l-2 border-b-2 border-accent/50 rounded-bl" />
        <div className="absolute bottom-2 right-2 w-3 h-3 border-r-2 border-b-2 border-accent/50 rounded-br" />
      </motion.div>
    </motion.div>
  );
};
