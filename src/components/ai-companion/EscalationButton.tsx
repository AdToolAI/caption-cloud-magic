import React from 'react';
import { motion } from 'framer-motion';
import { HeadphonesIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface EscalationButtonProps {
  onClick: () => void;
  variant?: 'inline' | 'floating';
}

export function EscalationButton({ onClick, variant = 'inline' }: EscalationButtonProps) {
  if (variant === 'floating') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onClick}
              className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shadow-lg border border-white/20"
            >
              <HeadphonesIcon className="w-3 h-3 text-white" />
            </motion.button>
          </TooltipTrigger>
          <TooltipContent side="left" className="bg-card border-white/10">
            <p className="text-xs">An Support weiterleiten</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="h-7 px-2 text-xs gap-1.5 text-muted-foreground hover:text-foreground hover:bg-orange-500/10 border border-transparent hover:border-orange-500/20"
    >
      <HeadphonesIcon className="w-3 h-3" />
      <span>Support kontaktieren</span>
    </Button>
  );
}
