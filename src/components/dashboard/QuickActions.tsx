import { Link } from "react-router-dom";
import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useState } from "react";

interface QuickAction {
  label: string;
  icon: LucideIcon;
  to: string;
  variant?: 'default' | 'outline';
}

interface QuickActionsProps {
  actions: QuickAction[];
}

// Ripple effect component
const Ripple = ({ x, y }: { x: number; y: number }) => (
  <motion.span
    className="absolute rounded-full bg-white/30 pointer-events-none"
    initial={{ width: 0, height: 0, x, y, opacity: 0.5 }}
    animate={{ width: 300, height: 300, x: x - 150, y: y - 150, opacity: 0 }}
    transition={{ duration: 0.6, ease: "easeOut" }}
  />
);

export function QuickActions({ actions }: QuickActionsProps) {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number; actionIndex: number }[]>([]);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>, index: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = Date.now();
    setRipples(prev => [...prev, { id, x, y, actionIndex: index }]);
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== id));
    }, 600);
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {actions.map((action, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: i * 0.1 }}
        >
          <Button 
            asChild 
            size="lg" 
            variant={action.variant || 'outline'}
            className="relative h-auto py-6 w-full rounded-2xl overflow-hidden backdrop-blur-xl bg-card/50 border border-white/10 hover:border-primary/50 hover:bg-primary/5 shadow-lg hover:shadow-[var(--shadow-glow-gold)] transition-all duration-300 group"
            onClick={(e) => handleClick(e as any, i)}
          >
            <Link to={action.to}>
              {/* Background glow on hover */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/0 to-accent/0 group-hover:from-primary/10 group-hover:to-accent/5 transition-all duration-500" />
              
              {/* Ripple effects */}
              {ripples
                .filter(r => r.actionIndex === i)
                .map(ripple => (
                  <Ripple key={ripple.id} x={ripple.x} y={ripple.y} />
                ))
              }
              
              <div className="relative flex flex-col items-center gap-3">
                <motion.div
                  whileHover={{ scale: 1.1, rotate: [0, -10, 10, 0] }}
                  transition={{ duration: 0.3 }}
                  className="p-3 rounded-xl bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors"
                >
                  <action.icon className="h-6 w-6" />
                </motion.div>
                <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                  {action.label}
                </span>
              </div>
            </Link>
          </Button>
        </motion.div>
      ))}
    </div>
  );
}
