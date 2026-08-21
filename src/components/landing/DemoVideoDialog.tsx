import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { tx } from "@/lib/i18nText";
import { useTranslation } from "@/hooks/useTranslation";
import demoAsset from "@/assets/adtool-demo.mp4.asset.json";
import demoAssetDe from "@/assets/adtool-demo-de.mp4.asset.json";

interface DemoVideoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const DemoVideoDialog = ({ open, onOpenChange }: DemoVideoDialogProps) => {
  const { language } = useTranslation();
  const src = language === 'de' ? demoAssetDe.url : demoAsset.url;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl border-primary/25 bg-background/95 p-2 sm:p-3">
        <DialogTitle className="sr-only">
          {tx({ de: 'AdTool AI Produkt-Demo', en: 'AdTool AI product demo', es: 'Demo de producto de AdTool AI' })}
        </DialogTitle>
        <video
          key={`${language}-${open ? "open" : "closed"}`}
          src={src}
          controls
          autoPlay
          playsInline
          className="w-full rounded-md"
        />
      </DialogContent>
    </Dialog>
  );
};
