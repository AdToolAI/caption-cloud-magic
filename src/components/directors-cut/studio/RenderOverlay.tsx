import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, RotateCcw, Film, CheckCircle2, AlertTriangle, Loader2, ArrowUpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useTranslation } from '@/hooks/useTranslation';
import { EnhanceVideoDialog } from '@/components/ai-video/EnhanceVideoDialog';


interface RenderOverlayProps {
  isVisible: boolean;
  progress: number;
  status: 'preparing' | 'rendering' | 'finalizing' | 'completed' | 'failed';
  videoUrl?: string | null;
  errorMessage?: string | null;
  onDownload: () => void;
  onRetry: () => void;
  onClose: () => void;
  onOpenLibrary?: () => void;
  startedAt?: number;
  quality?: string;
  durationSeconds?: number;
}

/** Typical wall-clock render time per 10s of output, in seconds (min/max). */
const TYPICAL_SECONDS_PER_10S: Record<string, [number, number]> = {
  hd: [45, 90],
  fhd: [45, 90],
  '4k': [150, 320],
  '8k': [480, 660],
};

const formatClock = (totalSeconds: number) => {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
};

export const RenderOverlay: React.FC<RenderOverlayProps> = ({
  isVisible,
  progress,
  status,
  videoUrl,
  errorMessage,
  onDownload,
  onRetry,
  onClose,
  onOpenLibrary,
  startedAt,
  quality,
  durationSeconds,
}) => {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());

  const isRunning = isVisible && status !== 'completed' && status !== 'failed';

  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isRunning]);

  const STATUS_LABELS: Record<string, string> = {
    preparing: t('dc.preparing'),
    rendering: t('dc.rendering'),
    finalizing: t('dc.finalizing'),
    completed: t('dc.completed'),
    failed: t('dc.renderFailed'),
  };

  // Honest waiting info: elapsed time + typical range for the chosen quality.
  // No synthetic "<1s" estimate derived from a progress bar that jumps.
  const elapsedLabel = useMemo(() => {
    if (!startedAt || !isRunning) return null;
    return t('dc.elapsedTime', { time: formatClock((now - startedAt) / 1000) });
  }, [startedAt, isRunning, now, t]);

  const typicalLabel = useMemo(() => {
    if (!isRunning) return null;
    const range = TYPICAL_SECONDS_PER_10S[(quality || 'hd').toLowerCase()];
    if (!range) return null;
    const factor = Math.max(1, (durationSeconds || 10) / 10);
    const lo = formatClock(range[0] * factor);
    const hi = formatClock(range[1] * factor);
    return t('dc.typicalDuration', { quality: (quality || 'hd').toUpperCase(), range: `${lo}–${hi}` });
  }, [isRunning, quality, durationSeconds, t]);


  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex items-center justify-center"
          style={{ backdropFilter: 'blur(8px)' }}
        >
          <div className="absolute inset-0 bg-black/70" />

          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="relative z-10 w-full max-w-md mx-4 rounded-2xl border border-white/10 bg-[#1a1a2e] p-8 shadow-2xl"
          >
            {/* Icon */}
            <div className="flex justify-center mb-6">
              {status === 'completed' ? (
                <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-green-400" />
                </div>
              ) : status === 'failed' ? (
                <div className="h-16 w-16 rounded-full bg-red-500/20 flex items-center justify-center">
                  <AlertTriangle className="h-8 w-8 text-red-400" />
                </div>
              ) : (
                <div className="h-16 w-16 rounded-full bg-[#00d4ff]/20 flex items-center justify-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                  >
                    <Film className="h-8 w-8 text-[#00d4ff]" />
                  </motion.div>
                </div>
              )}
            </div>

            {/* Title */}
            <h3 className="text-xl font-bold text-white text-center mb-2">
              {STATUS_LABELS[status]}
            </h3>

            {/* Progress section */}
            {status !== 'completed' && status !== 'failed' && (
              <div className="space-y-3 mb-6">
                <Progress value={progress} className="h-3 bg-white/10" />
                <div className="flex justify-between text-sm">
                  <span className="text-white/50">{Math.round(progress)}%</span>
                  {elapsedLabel && (
                    <span className="text-white/40">{elapsedLabel}</span>
                  )}
                </div>
                {typicalLabel && (
                  <p className="text-xs text-white/40 text-center">{typicalLabel}</p>
                )}
              </div>
            )}

            {/* Completed */}
            {status === 'completed' && (
              <div className="space-y-3 mt-6">
                <Button
                  onClick={onDownload}
                  className="w-full bg-gradient-to-r from-[#00d4ff] to-[#7c3aed] hover:opacity-90 text-white font-semibold"
                  size="lg"
                >
                  <Download className="h-5 w-5 mr-2" />
                  {t('dc.downloadVideo')}
                </Button>
                {onOpenLibrary && (
                  <Button
                    onClick={onOpenLibrary}
                    className="w-full bg-white/10 hover:bg-white/20 text-white"
                    size="lg"
                  >
                    <Film className="h-5 w-5 mr-2" />
                    {t('dc.toMediaLibrary')}
                  </Button>
                )}
                <Button
                  onClick={onClose}
                  variant="outline"
                  className="w-full border-white/20 text-white/70 hover:text-white hover:bg-white/10"
                >
                  {t('dc.backToEditor')}
                </Button>
              </div>
            )}

            {/* Failed */}
            {status === 'failed' && (
              <div className="space-y-3 mt-4">
                {errorMessage && (
                  <p className="text-sm text-red-300/70 text-center bg-red-500/10 rounded-lg p-3">
                    {errorMessage}
                  </p>
                )}
                <Button
                  onClick={onRetry}
                  className="w-full bg-white/10 hover:bg-white/20 text-white"
                  size="lg"
                >
                  <RotateCcw className="h-5 w-5 mr-2" />
                  {t('dc.retryRender')}
                </Button>
                <Button
                  onClick={onClose}
                  variant="outline"
                  className="w-full border-white/20 text-white/70 hover:text-white hover:bg-white/10"
                >
                  {t('dc.cancelRender')}
                </Button>
              </div>
            )}

            {/* Hint */}
            {status !== 'completed' && status !== 'failed' && (
              <p className="text-xs text-white/30 text-center mt-4">
                {t('dc.renderHint')}
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
