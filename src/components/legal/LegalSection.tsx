import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Shield, Database, Scale, Cookie, Lock, Globe, Users, Mail, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface LegalSectionProps {
  title: string;
  icon?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  index?: number;
}

const iconMap: Record<string, React.ElementType> = {
  "shield": Shield,
  "database": Database,
  "scale": Scale,
  "cookie": Cookie,
  "lock": Lock,
  "globe": Globe,
  "users": Users,
  "mail": Mail,
  "alert": AlertTriangle,
};

export const LegalSection = ({ 
  title, 
  icon = "shield", 
  children, 
  defaultOpen = false,
  index = 0 
}: LegalSectionProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const Icon = iconMap[icon] || Shield;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.4 }}
      className="group"
    >
      <div
        className={cn(
          "backdrop-blur-xl bg-card/60 border border-white/10 rounded-xl overflow-hidden transition-all duration-300",
          isOpen && "shadow-[0_0_30px_rgba(245,199,106,0.1)]"
        )}
      >
        {/* Header */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between p-5 hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className={cn(
              "p-2.5 rounded-lg transition-all duration-300",
              isOpen 
                ? "bg-primary/20 shadow-[0_0_15px_rgba(245,199,106,0.3)]" 
                : "bg-muted/50 group-hover:bg-primary/10"
            )}>
              <Icon className={cn(
                "w-5 h-5 transition-colors duration-300",
                isOpen ? "text-primary" : "text-muted-foreground group-hover:text-primary"
              )} />
            </div>
            <h3 className={cn(
              "text-lg font-semibold transition-colors duration-300",
              isOpen ? "text-primary" : "text-foreground"
            )}>
              {title}
            </h3>
          </div>
          
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            <ChevronDown className={cn(
              "w-5 h-5 transition-colors duration-300",
              isOpen ? "text-primary" : "text-muted-foreground"
            )} />
          </motion.div>
        </button>

        {/* Content */}
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              <div className="px-5 pb-5 pt-0">
                <div className="pl-14 text-muted-foreground leading-relaxed space-y-3">
                  {children}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
