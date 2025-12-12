import { motion } from 'framer-motion';
import { Monitor, Smartphone, Globe } from 'lucide-react';

interface LivePreviewPanelProps {
  brandName: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  faviconUrl: string;
}

export const LivePreviewPanel = ({
  brandName,
  logoUrl,
  primaryColor,
  secondaryColor,
  accentColor,
  faviconUrl,
}: LivePreviewPanelProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
      className="sticky top-8"
    >
      <div className="rounded-2xl bg-card/40 backdrop-blur-xl border border-white/10 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Monitor className="w-5 h-5 text-primary" />
            Live-Vorschau
          </h3>
          <div className="flex gap-2">
            <button className="p-2 rounded-lg bg-primary/20 text-primary">
              <Monitor className="w-4 h-4" />
            </button>
            <button className="p-2 rounded-lg bg-muted/50 text-muted-foreground hover:bg-muted transition-colors">
              <Smartphone className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Browser Window Preview */}
        <div className="rounded-xl overflow-hidden border border-white/10 bg-background">
          {/* Browser Tab */}
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-white/10">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/70" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
              <div className="w-3 h-3 rounded-full bg-green-500/70" />
            </div>
            <div className="flex-1 flex items-center gap-2 px-3 py-1 rounded-md bg-background/50 text-xs text-muted-foreground">
              <Globe className="w-3 h-3" />
              {brandName ? `${brandName.toLowerCase().replace(/\s+/g, '')}.app` : 'your-brand.app'}
            </div>
            {faviconUrl && (
              <img src={faviconUrl} alt="Favicon" className="w-4 h-4 rounded" />
            )}
          </div>

          {/* Page Content Preview */}
          <div className="p-4 min-h-[200px]" style={{ background: `linear-gradient(135deg, ${primaryColor}10, ${secondaryColor}10)` }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-6 pb-3 border-b border-white/10">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="h-8 object-contain" />
              ) : (
                <div 
                  className="h-8 px-4 rounded-lg flex items-center font-bold text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  {brandName || 'Your Brand'}
                </div>
              )}
              <div className="flex gap-2">
                <div className="w-16 h-2 rounded bg-muted/50" />
                <div className="w-16 h-2 rounded bg-muted/50" />
              </div>
            </div>

            {/* Content Blocks */}
            <div className="space-y-3">
              <div 
                className="h-12 rounded-lg flex items-center justify-center text-white text-sm font-medium"
                style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}
              >
                Primary Button
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="h-16 rounded-lg bg-card/60 border border-white/10" />
                <div className="h-16 rounded-lg bg-card/60 border border-white/10" />
              </div>
              <div 
                className="h-8 rounded-lg flex items-center justify-center text-white text-xs"
                style={{ backgroundColor: accentColor }}
              >
                Accent Element
              </div>
            </div>
          </div>
        </div>

        {/* Color Summary */}
        <div className="flex items-center justify-center gap-4 pt-4 border-t border-white/10">
          <div className="text-center">
            <div 
              className="w-10 h-10 rounded-xl shadow-lg mb-1 mx-auto ring-2 ring-white/10"
              style={{ backgroundColor: primaryColor }}
            />
            <span className="text-xs text-muted-foreground">Primary</span>
          </div>
          <div className="text-center">
            <div 
              className="w-10 h-10 rounded-xl shadow-lg mb-1 mx-auto ring-2 ring-white/10"
              style={{ backgroundColor: secondaryColor }}
            />
            <span className="text-xs text-muted-foreground">Secondary</span>
          </div>
          <div className="text-center">
            <div 
              className="w-10 h-10 rounded-xl shadow-lg mb-1 mx-auto ring-2 ring-white/10"
              style={{ backgroundColor: accentColor }}
            />
            <span className="text-xs text-muted-foreground">Accent</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
