import { motion } from "framer-motion";
import { TrendingUp, Eye, Target, FileText } from "lucide-react";
import { useEffect, useState } from "react";

interface MetricsSummary {
  provider: string;
  day: string;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  impressions: number;
  avg_engagement: number;
}

interface OverviewMetricsProps {
  data: MetricsSummary[];
  loading: boolean;
}

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

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (num >= 1000) return (num / 1000).toFixed(1) + "K";
    return num.toLocaleString("de-DE");
  };

  return <span>{formatNumber(count)}{suffix}</span>;
};

const MiniSparkline = ({ trend }: { trend: "up" | "down" | "stable" }) => {
  const paths = {
    up: "M 0 20 Q 10 18, 20 15 T 40 10 T 60 5",
    down: "M 0 5 Q 10 8, 20 12 T 40 16 T 60 20",
    stable: "M 0 12 Q 15 10, 30 12 T 60 12"
  };

  const color = trend === "up" ? "hsl(var(--primary))" : trend === "down" ? "hsl(0, 60%, 50%)" : "hsl(var(--muted-foreground))";

  return (
    <svg width="60" height="24" className="opacity-60">
      <motion.path
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.5, ease: "easeOut" }}
        d={paths[trend]}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
};

export const OverviewMetrics = ({ data, loading }: OverviewMetricsProps) => {
  const totalLikes = data.reduce((sum, item) => sum + (item.likes || 0), 0);
  const totalViews = data.reduce((sum, item) => sum + (item.views || 0), 0);
  const avgEngagement = data.length > 0
    ? (data.reduce((sum, item) => sum + (item.avg_engagement || 0), 0) / data.length)
    : 0;
  const totalPosts = new Set(data.map(item => item.provider)).size;

  const metrics = [
    {
      title: "Total Likes",
      value: totalLikes,
      icon: TrendingUp,
      description: "Letzte 7 Tage",
      trend: "up" as const,
      glowColor: "hsla(43, 90%, 68%, 0.15)"
    },
    {
      title: "Total Views",
      value: totalViews,
      icon: Eye,
      description: "Alle Plattformen",
      trend: "up" as const,
      glowColor: "hsla(190, 90%, 50%, 0.15)"
    },
    {
      title: "Avg Engagement",
      value: avgEngagement,
      suffix: "%",
      icon: Target,
      description: "Engagement-Rate",
      trend: "stable" as const,
      glowColor: "hsla(120, 60%, 50%, 0.15)"
    },
    {
      title: "Plattformen",
      value: totalPosts,
      icon: FileText,
      description: "Aktive Kanäle",
      trend: "stable" as const,
      glowColor: "hsla(270, 60%, 60%, 0.15)"
    }
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-6 rounded-2xl backdrop-blur-xl bg-card/60 border border-white/10 animate-pulse">
            <div className="h-4 bg-muted/30 rounded w-2/3 mb-4"></div>
            <div className="h-8 bg-muted/30 rounded w-1/2 mb-2"></div>
            <div className="h-3 bg-muted/30 rounded w-3/4"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {metrics.map((metric, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          whileHover={{ y: -4, scale: 1.02 }}
          className="relative p-6 rounded-2xl backdrop-blur-xl bg-card/60 border border-white/10
                     hover:border-primary/30 transition-all duration-300 group overflow-hidden"
          style={{ 
            boxShadow: `0 0 30px ${metric.glowColor}` 
          }}
        >
          {/* Glow effect on hover */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
               style={{ background: `radial-gradient(circle at 50% 50%, ${metric.glowColor}, transparent 70%)` }} />
          
          <div className="relative z-10">
            {/* Header with icon */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-medium text-muted-foreground">{metric.title}</span>
              <motion.div
                whileHover={{ rotate: 10, scale: 1.1 }}
                className="w-10 h-10 rounded-xl flex items-center justify-center
                           bg-gradient-to-br from-primary/20 to-cyan-500/20
                           shadow-[0_0_15px_hsla(43,90%,68%,0.2)]"
              >
                <metric.icon className="h-5 w-5 text-primary" />
              </motion.div>
            </div>

            {/* Value with animated counter */}
            <div className="text-3xl font-bold mb-2 bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">
              <AnimatedCounter value={metric.value} suffix={metric.suffix} />
            </div>

            {/* Footer with description and sparkline */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{metric.description}</p>
              <MiniSparkline trend={metric.trend} />
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
};
