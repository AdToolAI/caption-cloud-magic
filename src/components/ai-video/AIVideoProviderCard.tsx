import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export interface ProviderCardProps {
  name: string;
  provider: string;
  description: string;
  features: string[];
  pricing: string;
  maxDuration: string;
  quality: string;
  link: string;
  icon: LucideIcon;
  accentColor?: string;
  index: number;
  /** Optional banner badge shown in top-right corner (e.g. "Coming Soon", "Recommended"). */
  topBadge?: { label: string; variant?: 'default' | 'secondary' | 'outline' | 'destructive' };
}

const cardVariant = {
  hidden: { opacity: 0, y: 30, scale: 0.85, filter: 'blur(8px)' },
  show: {
    opacity: 1, y: 0, scale: 1, filter: 'blur(0px)',
    transition: { type: 'spring' as const, stiffness: 200, damping: 20 },
  },
};

export function AIVideoProviderCard({
  name, provider, description, features, pricing, maxDuration, quality, link, icon: Icon, index, topBadge,
}: ProviderCardProps) {
  return (
    <motion.div variants={cardVariant}>
      <Link
        to={link}
        className="hub-card-shimmer group relative block rounded-2xl p-6 transition-all duration-300
          bg-card/60 backdrop-blur-md hover:-translate-y-2
          hover:shadow-[0_0_40px_hsla(43,90%,68%,0.2),0_0_80px_hsla(187,84%,55%,0.1)]"
      >
        {/* Top badge (Coming Soon / Recommended) */}
        {topBadge && (
          <div className="absolute -top-2 -right-2 z-20">
            <Badge variant={topBadge.variant ?? 'default'} className="text-[10px] px-2 py-1 shadow-lg">
              {topBadge.label}
            </Badge>
          </div>
        )}

        {/* Hover glow overlay */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/8 via-transparent to-accent/8 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

        <div className="relative z-10">
          {/* Header: Icon + Arrow */}
          <div className="flex items-center justify-between mb-4">
            <div className="relative p-3 rounded-xl bg-muted/30 group-hover:bg-primary/15 transition-all duration-300">
              <Icon className="h-6 w-6 text-muted-foreground group-hover:text-primary transition-colors duration-300 group-hover:drop-shadow-[0_0_8px_hsla(43,90%,68%,0.6)]" />
            </div>
            <motion.div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300" initial={false}>
              <ArrowRight className="h-4 w-4 text-primary" />
            </motion.div>
          </div>

          {/* Name + Provider Badge */}
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-bold text-lg group-hover:text-primary transition-colors duration-200">{name}</h3>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{provider}</Badge>
          </div>

          {/* Description */}
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">{description}</p>

          {/* Features */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {features.map((f) => (
              <span key={f} className="text-[10px] px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground border border-border/50">
                {f}
              </span>
            ))}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 text-center pt-3 border-t border-border/30">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Preis</p>
              <p className="text-xs font-semibold text-foreground mt-0.5">{pricing}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Max</p>
              <p className="text-xs font-semibold text-foreground mt-0.5">{maxDuration}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Qualität</p>
              <p className="text-xs font-semibold text-foreground mt-0.5">{quality}</p>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
