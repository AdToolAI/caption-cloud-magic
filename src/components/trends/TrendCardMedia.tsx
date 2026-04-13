import { useState } from "react";
import { motion } from "framer-motion";
import { Instagram, Music, Youtube, Linkedin, Twitter, Globe } from "lucide-react";

// Category → Unsplash keywords for real imagery
const categoryImageMap: Record<string, string> = {
  'social-media': 'social,media,content,creator',
  'ecommerce': 'ecommerce,shopping,product',
  'lifestyle': 'lifestyle,wellness,nature',
  'business': 'business,office,technology',
  'finance': 'finance,investment,trading',
  'motivation': 'success,mountains,inspiration',
};

// Platform → gradient + icon config
const platformVisuals: Record<string, { gradient: string; Icon: typeof Globe; glowColor: string }> = {
  tiktok:    { gradient: 'from-cyan-400 via-pink-500 to-purple-600', Icon: Music,     glowColor: 'rgba(236,72,153,0.4)' },
  instagram: { gradient: 'from-yellow-400 via-pink-500 to-purple-600', Icon: Instagram, glowColor: 'rgba(168,85,247,0.4)' },
  youtube:   { gradient: 'from-red-600 via-red-500 to-red-700',       Icon: Youtube,   glowColor: 'rgba(239,68,68,0.4)' },
  linkedin:  { gradient: 'from-blue-600 via-blue-500 to-blue-700',    Icon: Linkedin,  glowColor: 'rgba(59,130,246,0.4)' },
  twitter:   { gradient: 'from-sky-500 via-blue-400 to-sky-600',      Icon: Twitter,   glowColor: 'rgba(56,189,248,0.4)' },
  pinterest: { gradient: 'from-red-500 via-rose-500 to-red-600',      Icon: Globe,     glowColor: 'rgba(244,63,94,0.4)' },
};

function getImageUrl(category: string, index: number): string {
  const keywords = categoryImageMap[category?.toLowerCase()] || 'technology,digital,abstract';
  // Use a seed based on index for consistent but varied images
  const seed = index * 137 + category.length * 31;
  return `https://source.unsplash.com/600x400/?${keywords}&sig=${seed}`;
}

interface TrendCardMediaProps {
  category: string;
  platform: string;
  index: number;
  className?: string;
  height?: string;
}

export function TrendCardMedia({ category, platform, index, className = '', height = 'h-44' }: TrendCardMediaProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const visuals = platformVisuals[platform] || platformVisuals.twitter;
  const PlatformIcon = visuals.Icon;

  return (
    <div className={`relative overflow-hidden ${height} ${className}`}>
      {/* Real Unsplash Image */}
      {!error && (
        <img
          src={getImageUrl(category, index)}
          alt=""
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          className={`absolute inset-0 w-full h-full object-cover transition-all duration-700 group-hover:scale-110 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}

      {/* Skeleton shimmer while loading */}
      {!loaded && (
        <div className="absolute inset-0">
          <div className={`absolute inset-0 bg-gradient-to-br ${visuals.gradient} opacity-40`} />
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
            animate={{ x: ['-100%', '200%'] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      )}

      {/* Cinematic gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />
      
      {/* Platform-tinted overlay */}
      <div className={`absolute inset-0 bg-gradient-to-br ${visuals.gradient} opacity-20 mix-blend-overlay`} />

      {/* Scanline effect */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.04]" style={{
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.3) 2px, rgba(255,255,255,0.3) 4px)',
      }} />

      {/* Holographic scan sweep */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.07] to-transparent pointer-events-none"
        animate={{ x: ['-100%', '200%'] }}
        transition={{ duration: 3, repeat: Infinity, repeatDelay: 5, ease: 'easeInOut' }}
      />

      {/* Platform Icon Glow Badge (bottom-right) */}
      <div
        className="absolute bottom-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center backdrop-blur-md border border-white/20"
        style={{ 
          background: `linear-gradient(135deg, rgba(0,0,0,0.5), rgba(0,0,0,0.3))`,
          boxShadow: `0 0 12px ${visuals.glowColor}` 
        }}
      >
        <PlatformIcon className="w-4 h-4 text-white" />
      </div>
    </div>
  );
}

// Popularity ring SVG component
export function PopularityRing({ value, size = 36 }: { value: number; size?: number }) {
  const radius = (size - 4) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (value / 100) * circumference;
  
  const color = value > 85 ? 'hsl(0, 80%, 60%)' : value > 60 ? 'hsl(43, 90%, 68%)' : 'hsl(187, 80%, 50%)';
  const glowColor = value > 85 ? 'hsla(0,80%,60%,0.4)' : value > 60 ? 'hsla(43,90%,68%,0.4)' : 'hsla(187,80%,50%,0.4)';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-muted/20"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          style={{ filter: `drop-shadow(0 0 4px ${glowColor})` }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

// Hero background with Ken Burns effect
export function HeroMediaBackground({ category, platform, index }: { category: string; platform: string; index: number }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const visuals = platformVisuals[platform] || platformVisuals.twitter;

  return (
    <div className="absolute inset-0 overflow-hidden">
      {!error && (
        <motion.img
          src={getImageUrl(category, index + 1000)}
          alt=""
          loading="eager"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          animate={{
            scale: [1, 1.08],
            x: [0, -10],
          }}
          transition={{ duration: 12, ease: "linear" }}
        />
      )}

      {/* Fallback gradient */}
      <div className={`absolute inset-0 bg-gradient-to-br ${visuals.gradient} ${loaded && !error ? 'opacity-30 mix-blend-overlay' : 'opacity-60'}`} />
      
      {/* Dark cinematic overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-card/20" />
      <div className="absolute inset-0 bg-gradient-to-r from-card/80 via-transparent to-transparent" />

      {/* Scanlines */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.2) 2px, rgba(255,255,255,0.2) 4px)',
      }} />
    </div>
  );
}
