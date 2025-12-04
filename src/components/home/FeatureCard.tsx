import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { FeatureGuideDialog } from "@/components/onboarding/FeatureGuideDialog";
import { motion } from "framer-motion";

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  ctaLabel?: string;
  href: string;
  featureId?: string;
}

export function FeatureCard({ 
  icon, 
  title, 
  description, 
  ctaLabel = "Einrichtung in 5 Schritten", 
  href,
  featureId
}: FeatureCardProps) {
  const [showGuide, setShowGuide] = useState(false);

  return (
    <>
      <motion.div 
        whileHover={{ scale: 1.02, y: -4 }}
        transition={{ duration: 0.2 }}
        className="rounded-2xl backdrop-blur-xl bg-card/50 shadow-lg hover:shadow-[var(--shadow-glow-gold)] transition-all duration-300 p-5 border border-white/10 hover:border-primary/50 group"
      >
        {/* Main Content - Clickable Link */}
        <Link 
          to={href}
          className="flex items-start gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-lg"
        >
          {/* Icon Container */}
          <motion.div 
            whileHover={{ rotate: [0, -10, 10, 0] }}
            transition={{ duration: 0.4 }}
            className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 text-primary grid place-items-center group-hover:bg-primary/20 transition-colors"
          >
            {icon}
          </motion.div>
          
          {/* Content */}
          <div className="flex-1 space-y-1">
            <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
              {title}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {description}
            </p>
          </div>
        </Link>
        
        {/* CTA Button */}
        <div className="mt-3 ml-[52px]">
          {featureId ? (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowGuide(true);
              }}
              className="flex items-center gap-1 text-sm text-primary font-medium hover:gap-2 transition-all cursor-pointer group/cta"
            >
              {ctaLabel}
              <ArrowRight className="h-3 w-3 group-hover/cta:translate-x-1 transition-transform" />
            </button>
          ) : (
            <Link 
              to={href}
              className="flex items-center gap-1 text-sm text-primary font-medium hover:gap-2 transition-all group/cta"
            >
              {ctaLabel}
              <ArrowRight className="h-3 w-3 group-hover/cta:translate-x-1 transition-transform" />
            </Link>
          )}
        </div>
      </motion.div>

      {/* Feature Guide Dialog */}
      {featureId && (
        <FeatureGuideDialog
          featureId={featureId}
          open={showGuide}
          onClose={() => setShowGuide(false)}
        />
      )}
    </>
  );
}
