import { Link } from "react-router-dom";
import adtoolLogo from "@/assets/adtool-ai-logo.png";

interface BrandProps {
  compact?: boolean;
  showText?: boolean;
}

export function Brand({ compact = false, showText = true }: BrandProps) {
  return (
    <Link
      to="/"
      className="flex items-center gap-2 select-none group"
      aria-label="AdTool AI Home"
    >
      <img
        src={adtoolLogo}
        alt="AdTool AI"
        width={1024}
        height={1024}
        loading="lazy"
        className={`${compact ? 'h-5 w-5' : 'h-6 w-6'} object-contain group-hover:rotate-12 transition-transform duration-300`}
      />
      {showText && (
        <span className={`font-bold tracking-tight ${compact ? 'text-base' : 'text-lg'} group-hover:text-primary transition-colors duration-200`}>
          AdTool <span className="text-primary">AI</span>
        </span>
      )}
    </Link>
  );
}
