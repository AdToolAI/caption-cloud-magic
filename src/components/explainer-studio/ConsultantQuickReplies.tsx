import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ConsultantQuickRepliesProps {
  options: string[];
  onSelect: (option: string) => void;
  disabled?: boolean;
}

export function ConsultantQuickReplies({ options, onSelect, disabled = false }: ConsultantQuickRepliesProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="flex flex-wrap gap-2 mt-4"
    >
      {options.map((option, index) => (
        <motion.button
          key={option}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 + index * 0.1 }}
          onClick={() => !disabled && onSelect(option)}
          disabled={disabled}
          className={cn(
            "px-3 py-1.5 rounded-full text-sm",
            "bg-primary/10 border border-primary/30 text-primary",
            "hover:bg-primary/20 hover:border-primary/50 hover:shadow-[0_0_10px_rgba(245,199,106,0.2)]",
            "transition-all duration-200",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
          whileHover={!disabled ? { scale: 1.02 } : {}}
          whileTap={!disabled ? { scale: 0.98 } : {}}
        >
          {option}
        </motion.button>
      ))}
    </motion.div>
  );
}
