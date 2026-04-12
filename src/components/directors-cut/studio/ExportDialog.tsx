import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Monitor, Smartphone, Square, RectangleVertical } from 'lucide-react';
import { ExportSettings } from '@/types/directors-cut';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/useTranslation';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (settings: ExportSettings) => void;
  currentSettings: ExportSettings;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  currentSettings,
}) => {
  const [settings, setSettings] = useState<ExportSettings>(currentSettings);
  const { t } = useTranslation();

  const resolutions = [
    { value: 'hd' as const, label: 'HD', detail: '1280×720', desc: t('dc.hdFast') },
    { value: 'fhd' as const, label: 'Full HD', detail: '1920×1080', desc: t('dc.fhdStandard') },
    { value: '4k' as const, label: '4K', detail: '3840×2160', desc: t('dc.fourKUltra') },
    { value: '8k' as const, label: '8K', detail: '7680×4320', desc: t('dc.eightKMax') },
  ];

  const aspectRatios = [
    { value: '16:9' as const, label: '16:9', desc: t('dc.widescreenLabel'), icon: Monitor },
    { value: '9:16' as const, label: '9:16', desc: t('dc.portraitLabel'), icon: Smartphone },
    { value: '1:1' as const, label: '1:1', desc: t('dc.squareLabel'), icon: Square },
    { value: '4:5' as const, label: '4:5', desc: t('dc.socialLabel'), icon: RectangleVertical },
  ];

  const formats = [
    { value: 'mp4' as const, label: 'MP4', desc: t('dc.universallyCompatible') },
    { value: 'webm' as const, label: 'WebM', desc: t('dc.webOptimized') },
    { value: 'mov' as const, label: 'MOV', desc: t('dc.applePro') },
  ];

  const fpsOptions = [
    { value: 24, label: '24 fps', desc: 'Cinematic' },
    { value: 30, label: '30 fps', desc: 'Standard' },
    { value: 60, label: '60 fps', desc: 'Smooth' },
  ];

  const handleConfirm = () => {
    onConfirm(settings);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-[#1a1a2e] border-[#F5C76A]/20 text-white max-w-lg sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
            <Download className="h-5 w-5 text-[#F5C76A]" />
            {t('dc.exportDialogTitle')}
          </DialogTitle>
          <DialogDescription className="text-white/50 text-sm">
            {t('dc.exportDialogDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Resolution */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">{t('dc.resolution')}</label>
            <div className="grid grid-cols-4 gap-2">
              {resolutions.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setSettings({ ...settings, quality: r.value })}
                  className={cn(
                    "flex flex-col items-center gap-1 p-3 rounded-lg border transition-all text-center",
                    settings.quality === r.value
                      ? "border-[#F5C76A] bg-[#F5C76A]/10 text-white"
                      : "border-[#3a3a4a] bg-[#2a2a3a] text-white/60 hover:border-[#F5C76A]/40"
                  )}
                >
                  <span className="text-sm font-bold">{r.label}</span>
                  <span className="text-[10px] text-white/40">{r.detail}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Aspect Ratio */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">{t('dc.aspectRatio')}</label>
            <div className="grid grid-cols-4 gap-2">
              {aspectRatios.map((ar) => {
                const Icon = ar.icon;
                return (
                  <button
                    key={ar.value}
                    onClick={() => setSettings({ ...settings, aspect_ratio: ar.value })}
                    className={cn(
                      "flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all",
                      settings.aspect_ratio === ar.value
                        ? "border-[#F5C76A] bg-[#F5C76A]/10 text-white"
                        : "border-[#3a3a4a] bg-[#2a2a3a] text-white/60 hover:border-[#F5C76A]/40"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-sm font-bold">{ar.label}</span>
                    <span className="text-[10px] text-white/40">{ar.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Format & FPS row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">{t('dc.format')}</label>
              <div className="flex gap-2">
                {formats.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setSettings({ ...settings, format: f.value })}
                    className={cn(
                      "flex-1 py-2 px-2 rounded-lg border text-center transition-all",
                      settings.format === f.value
                        ? "border-[#F5C76A] bg-[#F5C76A]/10 text-white text-sm font-bold"
                        : "border-[#3a3a4a] bg-[#2a2a3a] text-white/60 text-sm hover:border-[#F5C76A]/40"
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">{t('dc.fps')}</label>
              <div className="flex gap-2">
                {fpsOptions.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setSettings({ ...settings, fps: f.value })}
                    className={cn(
                      "flex-1 py-2 px-2 rounded-lg border text-center transition-all",
                      settings.fps === f.value
                        ? "border-[#F5C76A] bg-[#F5C76A]/10 text-white text-sm font-bold"
                        : "border-[#3a3a4a] bg-[#2a2a3a] text-white/60 text-sm hover:border-[#F5C76A]/40"
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Export Button */}
          <Button
            onClick={handleConfirm}
            className="w-full h-11 bg-gradient-to-r from-[#F5C76A] to-[#d4a843] hover:from-[#FFE4A0] hover:to-[#F5C76A] text-black font-bold text-sm shadow-[0_0_20px_rgba(245,199,106,0.3)]"
          >
            <Download className="h-4 w-4 mr-2" />
            {t('dc.exportVideo')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
