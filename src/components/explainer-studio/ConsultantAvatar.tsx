import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConsultantAvatarProps {
  isTyping?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function ConsultantAvatar({ isTyping = false, size = 'md' }: ConsultantAvatarProps) {
  const sizeClasses = {
    sm: 'w-10 h-10',
    md: 'w-14 h-14',
    lg: 'w-20 h-20'
  };

  const iconSizes = {
    sm: 'h-5 w-5',
    md: 'h-7 w-7',
    lg: 'h-10 w-10'
  };

  return (
    <div className={cn("relative", sizeClasses[size])}>
      {/* Outer glow ring */}
      <motion.div
        className={cn(
          "absolute inset-0 rounded-full",
          "bg-gradient-to-r from-primary via-purple-500 to-cyan-500"
        )}
        animate={isTyping ? {
          scale: [1, 1.1, 1],
          opacity: [0.5, 0.8, 0.5]
        } : {}}
        transition={{
          duration: 1.5,
          repeat: isTyping ? Infinity : 0,
          ease: "easeInOut"
        }}
      />
      
      {/* Inner avatar */}
      <div className={cn(
        "absolute inset-0.5 rounded-full",
        "bg-gradient-to-br from-primary/30 to-purple-500/30",
        "backdrop-blur-sm border border-white/20",
        "flex items-center justify-center"
      )}>
        <motion.div
          animate={isTyping ? {
            rotate: [0, 10, -10, 0]
          } : {}}
          transition={{
            duration: 0.5,
            repeat: isTyping ? Infinity : 0
          }}
        >
          <Sparkles className={cn(iconSizes[size], "text-primary")} />
        </motion.div>
      </div>

      {/* Status indicator */}
      <motion.div
        className={cn(
          "absolute -bottom-0.5 -right-0.5",
          "w-3 h-3 rounded-full border-2 border-background",
          isTyping ? "bg-yellow-500" : "bg-green-500"
        )}
        animate={isTyping ? {
          scale: [1, 1.2, 1]
        } : {}}
        transition={{
          duration: 0.8,
          repeat: isTyping ? Infinity : 0
        }}
      />
    </div>
  );
}
