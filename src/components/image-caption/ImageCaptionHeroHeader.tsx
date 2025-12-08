import { motion } from "framer-motion";
import { ImagePlus, Zap } from "lucide-react";

interface ImageCaptionHeroHeaderProps {
  dailyUploads: number;
  isPro: boolean;
}

const ImageCaptionHeroHeader = ({ dailyUploads, isPro }: ImageCaptionHeroHeaderProps) => {
  return (
    <div className="relative mb-10 overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          animate={{ 
            opacity: [0.3, 0.5, 0.3],
            scale: [1, 1.1, 1]
          }}
          transition={{ duration: 4, repeat: Infinity }}
          className="absolute -top-20 -left-20 w-96 h-96 bg-primary/20 rounded-full blur-[100px]"
        />
        <motion.div
          animate={{ 
            opacity: [0.2, 0.4, 0.2],
            scale: [1.1, 1, 1.1]
          }}
          transition={{ duration: 5, repeat: Infinity, delay: 1 }}
          className="absolute -top-10 right-0 w-80 h-80 bg-cyan-500/15 rounded-full blur-[80px]"
        />
      </div>

      <div className="relative z-10">
        {/* Mission Badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full 
                     bg-primary/10 border border-primary/30 mb-4
                     shadow-[0_0_15px_hsla(43,90%,68%,0.15)]"
        >
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_hsla(43,90%,68%,0.8)]"
          />
          <span className="text-sm font-medium text-primary">KI-Bild-Caption Pairing</span>
        </motion.div>

        {/* Main Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-4xl md:text-5xl font-bold mb-3 flex items-center gap-4"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", delay: 0.2 }}
            className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-cyan-500/20 
                       flex items-center justify-center shadow-[0_0_30px_hsla(43,90%,68%,0.25)]
                       border border-primary/30"
          >
            <ImagePlus className="h-7 w-7 text-primary" />
          </motion.div>
          <span className="bg-gradient-to-r from-primary via-primary to-cyan-400 bg-clip-text text-transparent">
            Bild-Caption Pairing
          </span>
        </motion.h1>

        {/* Subtitle with limit badge */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex items-center gap-4 flex-wrap"
        >
          <p className="text-muted-foreground text-lg">
            KI analysiert dein Bild und generiert perfekte Captions
          </p>
          
          {!isPro && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl 
                         bg-muted/30 border border-white/10 backdrop-blur-sm"
            >
              <div className="w-6 h-6 rounded-lg bg-primary/20 flex items-center justify-center">
                <Zap className="h-3.5 w-3.5 text-primary" />
              </div>
              <span className="text-sm text-muted-foreground">
                Uploads heute: <span className="text-primary font-semibold">{dailyUploads}/2</span>
              </span>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default ImageCaptionHeroHeader;
