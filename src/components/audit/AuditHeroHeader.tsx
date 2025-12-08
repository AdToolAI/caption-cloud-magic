import { motion } from "framer-motion";
import { SearchCheck, Sparkles } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface AuditHeroHeaderProps {
  captionCount: number;
}

export function AuditHeroHeader({ captionCount }: AuditHeroHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className="relative mb-8 overflow-hidden">
      {/* Background Glow Orbs */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          className="absolute -top-20 -right-20 w-64 h-64 bg-primary/10 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <motion.div
          className="absolute -bottom-10 -left-10 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl"
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </div>

      <div className="relative z-10">
        {/* Mission Badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full 
                     bg-primary/10 border border-primary/20 mb-4
                     shadow-[0_0_15px_hsla(43,90%,68%,0.15)]"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          <span className="text-sm font-medium text-primary">KI-Content-Audit</span>
        </motion.div>

        {/* Main Headline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex items-center gap-4 mb-3"
        >
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-cyan-500/20 
                          flex items-center justify-center shadow-[0_0_25px_hsla(43,90%,68%,0.25)]">
            <SearchCheck className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary via-cyan-400 to-primary 
                         bg-clip-text text-transparent">
            {t("audit_title")}
          </h1>
        </motion.div>

        {/* Subtitle with Tip Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-wrap items-center gap-3"
        >
          <p className="text-lg text-muted-foreground">
            {t("audit_subtitle")}
          </p>
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.3 }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg
                       bg-cyan-500/10 border border-cyan-500/20"
          >
            <Sparkles className="h-4 w-4 text-cyan-400" />
            <span className="text-sm text-cyan-400">Bis zu 10 Captions gleichzeitig</span>
          </motion.div>
          
          {captionCount > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg
                         bg-primary/10 border border-primary/20"
            >
              <span className="text-sm text-primary font-medium">
                {captionCount} Caption{captionCount !== 1 ? 's' : ''} erkannt
              </span>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
