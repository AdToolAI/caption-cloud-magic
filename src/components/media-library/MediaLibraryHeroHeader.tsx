import { motion } from "framer-motion";
import { FolderOpen, Upload, HardDrive, AlertTriangle, Film } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MediaLibraryHeroHeaderProps {
  videoCount: number;
  maxVideos: number;
  usedGB: number;
  maxGB: number;
  onUploadClick: () => void;
}

export const MediaLibraryHeroHeader = ({
  videoCount,
  maxVideos,
  usedGB,
  maxGB,
  onUploadClick,
}: MediaLibraryHeroHeaderProps) => {
  const videoPercent = Math.min((videoCount / maxVideos) * 100, 100);
  const storagePercent = Math.min((usedGB / maxGB) * 100, 100);
  const isWarning = videoPercent > 80 || storagePercent > 80;
  const isCritical = videoPercent >= 100 || storagePercent >= 100;

  return (
    <div className="relative overflow-hidden mb-8">
      {/* Background Glow Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute -top-20 -right-20 w-80 h-80 bg-primary/10 rounded-full blur-3xl"
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-20 -left-20 w-60 h-60 bg-cyan-500/10 rounded-full blur-3xl"
          animate={{ scale: [1.2, 1, 1.2], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="relative z-10">
        {/* Mission Badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full 
                     bg-primary/10 border border-primary/20 backdrop-blur-sm mb-4"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          <span className="text-sm font-medium text-primary">Mediathek</span>
        </motion.div>

        {/* Main Content */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          {/* Left: Title & Storage Info */}
          <div className="flex-1">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="flex items-center gap-4 mb-4"
            >
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-cyan-500/20 
                              flex items-center justify-center shadow-[0_0_30px_hsla(43,90%,68%,0.2)]">
                <FolderOpen className="h-7 w-7 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl lg:text-4xl font-bold bg-gradient-to-r from-primary via-primary to-cyan-400 
                               bg-clip-text text-transparent">
                  Deine Mediathek
                </h1>
                <p className="text-muted-foreground">
                  Alle deine Videos, Bilder & KI-Posts an einem Ort
                </p>
              </div>
            </motion.div>

            {/* Storage Meters */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex flex-wrap gap-6"
            >
              {/* Video Count Meter */}
              <div className="flex items-center gap-3">
                <div className="relative w-12 h-12">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="24" cy="24" r="20"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                      className="text-muted/20"
                    />
                    <motion.circle
                      cx="24" cy="24" r="20"
                      stroke={isCritical ? "hsl(var(--destructive))" : isWarning ? "hsl(45, 90%, 60%)" : "hsl(var(--primary))"}
                      strokeWidth="4"
                      fill="none"
                      strokeLinecap="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: videoPercent / 100 }}
                      transition={{ duration: 1, ease: "easeOut" }}
                      style={{ 
                        strokeDasharray: "1 1",
                        filter: isWarning ? "drop-shadow(0 0 6px hsla(45, 90%, 60%, 0.5))" : undefined
                      }}
                    />
                  </svg>
                  <Film className="absolute inset-0 m-auto h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Videos</p>
                  <p className={`font-bold ${isCritical ? "text-destructive" : isWarning ? "text-warning" : "text-foreground"}`}>
                    {videoCount} / {maxVideos}
                  </p>
                </div>
              </div>

              {/* Storage Meter */}
              <div className="flex items-center gap-3">
                <div className="relative w-12 h-12">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="24" cy="24" r="20"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                      className="text-muted/20"
                    />
                    <motion.circle
                      cx="24" cy="24" r="20"
                      stroke={storagePercent >= 100 ? "hsl(var(--destructive))" : storagePercent > 80 ? "hsl(45, 90%, 60%)" : "hsl(180, 80%, 60%)"}
                      strokeWidth="4"
                      fill="none"
                      strokeLinecap="round"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: storagePercent / 100 }}
                      transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
                      style={{ 
                        strokeDasharray: "1 1",
                        filter: storagePercent > 80 ? "drop-shadow(0 0 6px hsla(180, 80%, 60%, 0.5))" : undefined
                      }}
                    />
                  </svg>
                  <HardDrive className="absolute inset-0 m-auto h-4 w-4 text-cyan-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Speicher</p>
                  <p className={`font-bold ${storagePercent >= 100 ? "text-destructive" : storagePercent > 80 ? "text-warning" : "text-foreground"}`}>
                    {usedGB.toFixed(2)} / {maxGB} GB
                  </p>
                </div>
              </div>

              {/* Warning Badge */}
              {isWarning && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border
                              ${isCritical 
                                ? "bg-destructive/10 border-destructive/30 text-destructive" 
                                : "bg-warning/10 border-warning/30 text-warning"}`}
                >
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    {isCritical ? "Limit erreicht" : "Fast voll"}
                  </span>
                </motion.div>
              )}
            </motion.div>
          </div>

          {/* Right: Action Button */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Button
              onClick={onUploadClick}
              className="group relative overflow-hidden bg-gradient-to-r from-primary to-primary/80
                         shadow-[0_0_20px_hsla(43,90%,68%,0.3)] hover:shadow-[0_0_30px_hsla(43,90%,68%,0.5)]
                         transition-all duration-300"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent
                               -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              <Upload className="mr-2 h-4 w-4" />
              Medien hochladen
            </Button>
          </motion.div>
        </div>

        {/* Limit Info Notice */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-6 p-3 rounded-xl bg-muted/20 border border-white/5 backdrop-blur-sm"
        >
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/60" />
            <span>
              <strong>Speicherlimit:</strong> Maximal {maxVideos} Videos oder {maxGB} GB. 
              Bei Überschreitung werden automatisch die ältesten Medien gelöscht.
            </span>
          </p>
        </motion.div>
      </div>
    </div>
  );
};
