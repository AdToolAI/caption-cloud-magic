import { ReactNode, useEffect, useState, useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform, useInView } from "framer-motion";

interface MetricCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  trend?: { value: number; isPositive: boolean };
}

// Animated counter component
function AnimatedCounter({ value, duration = 2 }: { value: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const [displayValue, setDisplayValue] = useState("0");
  
  useEffect(() => {
    if (!isInView) return;
    
    // Extract numeric part and suffix
    const match = value.match(/^([\d.,]+)(.*)$/);
    if (!match) {
      setDisplayValue(value);
      return;
    }
    
    const numericPart = parseFloat(match[1].replace(/[.,]/g, ''));
    const suffix = match[2];
    const hasK = value.includes('K');
    const hasDecimal = value.includes('.');
    
    let startTimestamp: number | null = null;
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / (duration * 1000), 1);
      const eased = 1 - Math.pow(1 - progress, 4); // easeOutQuart
      const current = Math.floor(eased * numericPart);
      
      if (hasK) {
        const formatted = (current / 1000).toFixed(hasDecimal ? 1 : 0);
        setDisplayValue(`${formatted}K${suffix.replace('K', '')}`);
      } else {
        setDisplayValue(`${current.toLocaleString('de-DE')}${suffix}`);
      }
      
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        setDisplayValue(value);
      }
    };
    
    requestAnimationFrame(step);
  }, [value, duration, isInView]);
  
  return <span ref={ref}>{displayValue}</span>;
}

// Mini sparkline component
function MiniSparkline({ trend }: { trend: { value: number; isPositive: boolean } }) {
  const points = trend.isPositive 
    ? [40, 35, 45, 30, 50, 25, 55, 20, 60, 15]
    : [15, 20, 18, 25, 22, 30, 28, 35, 32, 40];
  
  const pathD = points
    .map((y, i) => `${i === 0 ? 'M' : 'L'} ${i * 10} ${y}`)
    .join(' ');

  return (
    <svg className="w-20 h-10 opacity-60" viewBox="0 0 90 60">
      <defs>
        <linearGradient id={`sparkline-${trend.isPositive ? 'up' : 'down'}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={trend.isPositive ? 'hsl(var(--success))' : 'hsl(var(--danger))'} stopOpacity="0.3" />
          <stop offset="100%" stopColor={trend.isPositive ? 'hsl(var(--success))' : 'hsl(var(--danger))'} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={pathD + ` L 90 60 L 0 60 Z`}
        fill={`url(#sparkline-${trend.isPositive ? 'up' : 'down'})`}
      />
      <motion.path
        d={pathD}
        fill="none"
        stroke={trend.isPositive ? 'hsl(var(--success))' : 'hsl(var(--danger))'}
        strokeWidth="2"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.5, delay: 0.5 }}
      />
    </svg>
  );
}

export function MetricCard({ label, value, subtitle, icon, trend }: MetricCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  
  // 3D Tilt effect
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  
  const springConfig = { stiffness: 200, damping: 25 };
  const rotateX = useSpring(useTransform(y, [-50, 50], [3, -3]), springConfig);
  const rotateY = useSpring(useTransform(x, [-50, 50], [-3, 3]), springConfig);

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

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      style={{ 
        rotateX, 
        rotateY,
        transformStyle: "preserve-3d"
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      whileHover={{ 
        scale: 1.02,
        boxShadow: trend?.isPositive 
          ? "0 0 30px hsla(160, 84%, 39%, 0.3)" 
          : "0 0 30px hsla(43, 90%, 68%, 0.2)"
      }}
      className="rounded-2xl backdrop-blur-xl bg-card/50 border border-white/10 hover:border-primary/30 shadow-lg transition-all duration-300 p-6 cursor-default"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="text-sm font-medium text-muted-foreground">{label}</div>
        {icon && (
          <motion.div 
            className="text-primary p-2 rounded-lg bg-primary/10"
            whileHover={{ rotate: [0, -10, 10, 0] }}
            transition={{ duration: 0.4 }}
          >
            {icon}
          </motion.div>
        )}
      </div>
      
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-3xl font-bold font-heading text-foreground">
            <AnimatedCounter value={String(value)} />
          </div>
          
          {subtitle && (
            <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>
          )}
          
          {trend && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 }}
              className={`inline-flex items-center gap-1 text-xs font-medium mt-2 px-2 py-0.5 rounded-full ${
                trend.isPositive 
                  ? 'text-success bg-success/10' 
                  : 'text-danger bg-danger/10'
              }`}
            >
              <motion.span
                animate={{ y: trend.isPositive ? [0, -2, 0] : [0, 2, 0] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                {trend.isPositive ? '↑' : '↓'}
              </motion.span>
              {Math.abs(trend.value)}%
            </motion.div>
          )}
        </div>
        
        {trend && <MiniSparkline trend={trend} />}
      </div>
    </motion.div>
  );
}
