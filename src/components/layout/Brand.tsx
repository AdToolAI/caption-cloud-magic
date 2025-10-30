import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface BrandProps {
  compact?: boolean;
  showText?: boolean;
}

export function Brand({ compact = false, showText = true }: BrandProps) {
  const { t } = useTranslation();
  
  return (
    <Link 
      to="/" 
      className="flex items-center gap-2 select-none group"
      aria-label="AdTool AI Home"
    >
      <Sparkles className={`${compact ? 'h-5 w-5' : 'h-6 w-6'} text-primary group-hover:rotate-12 transition-transform duration-300`} aria-hidden="true" />
      {showText && (
        <span className={`font-bold tracking-tight ${compact ? 'text-base' : 'text-lg'} group-hover:text-primary transition-colors duration-200`}>
          AdTool <span className="text-primary">AI</span>
        </span>
      )}
    </Link>
  );
}
