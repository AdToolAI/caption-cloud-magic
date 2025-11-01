import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { trackEvent } from "@/lib/analytics";

interface BrandProps {
  compact?: boolean;
  showText?: boolean;
  linkTo?: string;
}

export function Brand({ compact = false, showText = true, linkTo = "/" }: BrandProps) {
  const { t } = useTranslation();
  
  const handleClick = () => {
    trackEvent("nav_click", {
      label: "logo",
      path: linkTo,
      location: "header"
    });
  };
  
  return (
    <Link 
      to={linkTo} 
      onClick={handleClick}
      className="flex items-center gap-2 select-none group"
      aria-label={linkTo === "/app" ? "Zum Dashboard" : "Zur Startseite"}
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
