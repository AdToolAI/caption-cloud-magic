import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface LanguageToggleProps {
  currentLang: "de" | "en";
  onToggle: (lang: "de" | "en") => void;
}

export const LanguageToggle = ({ currentLang, onToggle }: LanguageToggleProps) => {
  return (
    <div className="flex justify-center mb-8">
      <div className="inline-flex items-center p-1 rounded-full backdrop-blur-md bg-card/60 border border-white/10">
        <button
          onClick={() => onToggle("de")}
          className={cn(
            "relative px-5 py-2 rounded-full text-sm font-medium transition-all duration-300",
            currentLang === "de" 
              ? "text-primary-foreground" 
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {currentLang === "de" && (
            <motion.div
              layoutId="activeLang"
              className="absolute inset-0 bg-primary rounded-full shadow-[0_0_15px_rgba(245,199,106,0.4)]"
              transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
            />
          )}
          <span className="relative z-10 flex items-center gap-2">
            <span>🇩🇪</span>
            <span>Deutsch</span>
          </span>
        </button>
        
        <button
          onClick={() => onToggle("en")}
          className={cn(
            "relative px-5 py-2 rounded-full text-sm font-medium transition-all duration-300",
            currentLang === "en" 
              ? "text-primary-foreground" 
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {currentLang === "en" && (
            <motion.div
              layoutId="activeLang"
              className="absolute inset-0 bg-primary rounded-full shadow-[0_0_15px_rgba(245,199,106,0.4)]"
              transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
            />
          )}
          <span className="relative z-10 flex items-center gap-2">
            <span>🇬🇧</span>
            <span>English</span>
          </span>
        </button>
      </div>
    </div>
  );
};
