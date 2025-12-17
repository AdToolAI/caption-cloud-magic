import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ConsultantQuickRepliesProps {
  options: string[];
  onSelect: (option: string) => void;
  disabled?: boolean;
}

export function ConsultantQuickReplies({ options, onSelect, disabled }: ConsultantQuickRepliesProps) {
  return (
    <div className="flex flex-wrap gap-3">
      {options.map((option, index) => (
        <motion.button
          key={option}
          initial={{ opacity: 0, y: 12, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ 
            delay: index * 0.06,
            type: "spring",
            stiffness: 400,
            damping: 25
          }}
          whileHover={{ 
            scale: 1.03, 
            y: -2,
            transition: { duration: 0.2 }
          }}
          whileTap={{ scale: 0.97 }}
          onClick={() => !disabled && onSelect(option)}
          disabled={disabled}
          className={cn(
            // Base styles - James Bond 2028 Premium
            "px-5 py-2.5 rounded-2xl text-sm font-modern font-medium tracking-wide",
            // Glassmorphism background
            "bg-gradient-to-br from-gold/15 via-gold/8 to-transparent",
            "backdrop-blur-md",
            // Border with glow
            "border border-gold/40",
            "shadow-lg shadow-gold/10",
            // Text
            "text-foreground/95",
            // Hover states
            "hover:bg-gradient-to-br hover:from-gold/25 hover:via-gold/15 hover:to-gold/5",
            "hover:border-gold/60",
            "hover:shadow-xl hover:shadow-gold/20",
            // Active state
            "active:shadow-inner active:shadow-gold/10",
            // Disabled state
            "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:y-0",
            // Focus state
            "focus:outline-none focus:ring-2 focus:ring-gold/50 focus:ring-offset-2 focus:ring-offset-background",
            // Smooth transitions
            "transition-all duration-300 ease-out"
          )}
        >
          <span className="relative z-10">{option}</span>
        </motion.button>
      ))}
    </div>
  );
}
