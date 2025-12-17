import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ConsultantAvatarProps {
  isTyping?: boolean;
  name?: string;
}

export function ConsultantAvatar({ isTyping = false, name = 'Max' }: ConsultantAvatarProps) {
  return (
    <div className="relative">
      <motion.div
        animate={isTyping ? { scale: [1, 1.05, 1] } : {}}
        transition={{ repeat: isTyping ? Infinity : 0, duration: 1.5 }}
        className={cn(
          "w-12 h-12 rounded-full overflow-hidden",
          "bg-gradient-to-br from-[#F5C76A]/30 to-cyan-500/30",
          "flex items-center justify-center text-xl font-bold",
          "border-2 border-[#F5C76A]/50"
        )}
      >
        <span className="bg-gradient-to-r from-[#F5C76A] to-amber-300 bg-clip-text text-transparent">
          {name.charAt(0)}
        </span>
      </motion.div>
      
      {/* Online indicator */}
      <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-green-500 border-2 border-background flex items-center justify-center">
        {isTyping ? (
          <motion.div
            animate={{ scale: [1, 0.8, 1] }}
            transition={{ repeat: Infinity, duration: 0.8 }}
            className="w-2 h-2 bg-white rounded-full"
          />
        ) : (
          <div className="w-2 h-2 bg-white rounded-full" />
        )}
      </div>
    </div>
  );
}
