import { motion } from "framer-motion";
import { MessageSquare, Upload, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CommentManagerHeroHeaderProps {
  onImport: () => void;
  onAnalyze: () => void;
  analyzing: boolean;
  commentsCount: number;
}

export const CommentManagerHeroHeader = ({
  onImport,
  onAnalyze,
  analyzing,
  commentsCount,
}: CommentManagerHeroHeaderProps) => {
  return (
    <div className="relative mb-8">
      {/* Background Glow Effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{ duration: 4, repeat: Infinity }}
          className="absolute -top-20 -right-20 w-64 h-64 bg-primary/20 rounded-full blur-3xl"
        />
        <motion.div
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{ duration: 5, repeat: Infinity }}
          className="absolute -bottom-10 -left-10 w-48 h-48 bg-cyan-500/15 rounded-full blur-3xl"
        />
      </div>

      <div className="relative z-10">
        {/* Mission Badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full 
                     bg-muted/30 border border-white/10 backdrop-blur-sm mb-4"
        >
          <motion.span
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_hsla(43,90%,68%,0.8)]"
          />
          <span className="text-sm font-medium text-muted-foreground">
            KI-Kommentar-Manager
          </span>
        </motion.div>

        {/* Title & Actions Row */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl md:text-5xl font-bold mb-3"
            >
              <span className="bg-gradient-to-r from-primary via-amber-400 to-cyan-400 bg-clip-text text-transparent">
                Kommentar-Manager
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-muted-foreground max-w-md"
            >
              Bis zu 50 Kommentare persistent speichern & analysieren
            </motion.p>
          </div>

          {/* Action Buttons */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="flex gap-3"
          >
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                variant="outline"
                onClick={onImport}
                className="border-white/20 bg-muted/20 hover:bg-muted/40 hover:border-primary/40
                           transition-all duration-300"
              >
                <Upload className="h-4 w-4 mr-2" />
                Importieren
              </Button>
            </motion.div>

            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                onClick={onAnalyze}
                disabled={analyzing || commentsCount === 0}
                className="bg-gradient-to-r from-primary to-primary/80 
                           shadow-[0_0_20px_hsla(43,90%,68%,0.3)]
                           hover:shadow-[0_0_30px_hsla(43,90%,68%,0.5)]
                           transition-all duration-300"
              >
                <Zap className="h-4 w-4 mr-2" />
                {analyzing ? "Analysiere..." : "Analysieren"}
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};
