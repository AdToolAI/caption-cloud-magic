import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  ctaLabel?: string;
  href: string;
}

export function FeatureCard({ 
  icon, 
  title, 
  description, 
  ctaLabel = "Einrichtung in 5 Schritten", 
  href 
}: FeatureCardProps) {
  return (
    <Link 
      to={href} 
      className="block rounded-2xl bg-card shadow-soft hover:shadow-glow transition-all duration-300 p-5 border border-border/50 hover:border-primary/50 group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <div className="flex items-start gap-3">
        {/* Icon Container */}
        <div className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 text-primary grid place-items-center group-hover:scale-110 transition-transform">
          {icon}
        </div>
        
        {/* Content */}
        <div className="flex-1 space-y-1">
          <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
            {title}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {description}
          </p>
          <div className="flex items-center gap-1 text-sm text-primary mt-2 font-medium">
            {ctaLabel}
            <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </div>
    </Link>
  );
}
