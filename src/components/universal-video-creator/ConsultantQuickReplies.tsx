import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ConsultantQuickRepliesProps {
  options: string[];
  onSelect: (option: string) => void;
  disabled?: boolean;
}

export function ConsultantQuickReplies({ options, onSelect, disabled }: ConsultantQuickRepliesProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option, index) => (
        <motion.button
          key={option}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => !disabled && onSelect(option)}
          disabled={disabled}
          className={cn(
            "px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200",
            "bg-[#F5C76A]/10 border border-[#F5C76A]/30 text-foreground",
            "hover:bg-[#F5C76A]/20 hover:border-[#F5C76A]/50",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "focus:outline-none focus:ring-2 focus:ring-[#F5C76A]/30"
          )}
        >
          {option}
        </motion.button>
      ))}
    </div>
  );
}
