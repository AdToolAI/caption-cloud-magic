import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Lock, Sparkles } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface QuickPostUpsellModalProps {
  open: boolean;
  onClose: () => void;
}

export function QuickPostUpsellModal({ open, onClose }: QuickPostUpsellModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 rounded-full bg-primary/10">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <AlertDialogTitle className="text-xl">
              {t('pricing.quickPost.locked.title')}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-base">
            {t('pricing.quickPost.locked.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="space-y-3 py-4">
          <p className="text-sm font-semibold text-foreground">{t('pricing.quickPost.includedIn')}:</p>
          <div className="space-y-2">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/50 border border-primary/20">
              <Sparkles className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Pro</p>
                <p className="text-sm text-muted-foreground">34,95 €/Monat • 2.500 Credits</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-accent/50 border border-primary/20">
              <Sparkles className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Enterprise</p>
                <p className="text-sm text-muted-foreground">69,95 €/Monat • Unbegrenzte Credits</p>
              </div>
            </div>
          </div>
        </div>
        
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <Button onClick={() => { onClose(); navigate('/pricing'); }}>
            {t('pricing.upgrade.toPro')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
