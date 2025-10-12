import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "@/hooks/useTranslation";
import { saveConsent, getConsent, type Consent } from "@/lib/consent";
import { Shield, BarChart3, Megaphone, Sparkles } from "lucide-react";

interface CookiePreferencesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CookiePreferencesDialog({ open, onOpenChange }: CookiePreferencesDialogProps) {
  const { t, language } = useTranslation();
  
  const [preferences, setPreferences] = useState({
    analytics: false,
    marketing: false,
    comfort: false,
  });

  // Lade aktuelle Präferenzen beim Öffnen
  useEffect(() => {
    if (open) {
      const consent = getConsent();
      if (consent) {
        setPreferences({
          analytics: consent.analytics,
          marketing: consent.marketing,
          comfort: consent.comfort,
        });
      }
    }
  }, [open]);

  const handleSave = () => {
    saveConsent({
      necessary: true,
      ...preferences,
      locale: language,
    });
    onOpenChange(false);
  };

  const handleAcceptAll = () => {
    saveConsent({
      necessary: true,
      analytics: true,
      marketing: true,
      comfort: true,
      locale: language,
    });
    onOpenChange(false);
  };

  const handleRejectAll = () => {
    saveConsent({
      necessary: true,
      analytics: false,
      marketing: false,
      comfort: false,
      locale: language,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-2xl max-h-[80vh] overflow-y-auto"
        role="dialog"
        aria-labelledby="cookie-preferences-title"
        aria-describedby="cookie-preferences-description"
      >
        <DialogHeader>
          <DialogTitle id="cookie-preferences-title" className="text-2xl">
            {t('consent.preferences.title')}
          </DialogTitle>
          <DialogDescription id="cookie-preferences-description">
            {t('consent.preferences.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Notwendige Cookies (immer aktiv) */}
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1">
                <Shield className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" aria-hidden="true" />
                <div className="space-y-1">
                  <Label className="text-base font-semibold">
                    {t('consent.categories.necessary.title')}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t('consent.categories.necessary.description')}
                  </p>
                </div>
              </div>
              <Switch 
                checked={true} 
                disabled 
                aria-label={t('consent.categories.necessary.title')}
                aria-describedby="necessary-description"
              />
            </div>
            <p id="necessary-description" className="text-xs text-muted-foreground pl-8">
              {t('consent.categories.necessary.examples')}
            </p>
          </div>

          <Separator />

          {/* Statistik/Analytics */}
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1">
                <BarChart3 className="h-5 w-5 text-blue-500 mt-0.5 flex-shrink-0" aria-hidden="true" />
                <div className="space-y-1">
                  <Label htmlFor="analytics-switch" className="text-base font-semibold cursor-pointer">
                    {t('consent.categories.analytics.title')}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t('consent.categories.analytics.description')}
                  </p>
                </div>
              </div>
              <Switch 
                id="analytics-switch"
                checked={preferences.analytics}
                onCheckedChange={(checked) => setPreferences(prev => ({ ...prev, analytics: checked }))}
                aria-label={t('consent.categories.analytics.title')}
                aria-describedby="analytics-description"
              />
            </div>
            <p id="analytics-description" className="text-xs text-muted-foreground pl-8">
              {t('consent.categories.analytics.examples')}
            </p>
          </div>

          <Separator />

          {/* Marketing */}
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1">
                <Megaphone className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" aria-hidden="true" />
                <div className="space-y-1">
                  <Label htmlFor="marketing-switch" className="text-base font-semibold cursor-pointer">
                    {t('consent.categories.marketing.title')}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t('consent.categories.marketing.description')}
                  </p>
                </div>
              </div>
              <Switch 
                id="marketing-switch"
                checked={preferences.marketing}
                onCheckedChange={(checked) => setPreferences(prev => ({ ...prev, marketing: checked }))}
                aria-label={t('consent.categories.marketing.title')}
                aria-describedby="marketing-description"
              />
            </div>
            <p id="marketing-description" className="text-xs text-muted-foreground pl-8">
              {t('consent.categories.marketing.examples')}
            </p>
          </div>

          <Separator />

          {/* Komfort/Personalisierung */}
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1">
                <Sparkles className="h-5 w-5 text-purple-500 mt-0.5 flex-shrink-0" aria-hidden="true" />
                <div className="space-y-1">
                  <Label htmlFor="comfort-switch" className="text-base font-semibold cursor-pointer">
                    {t('consent.categories.comfort.title')}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t('consent.categories.comfort.description')}
                  </p>
                </div>
              </div>
              <Switch 
                id="comfort-switch"
                checked={preferences.comfort}
                onCheckedChange={(checked) => setPreferences(prev => ({ ...prev, comfort: checked }))}
                aria-label={t('consent.categories.comfort.title')}
                aria-describedby="comfort-description"
              />
            </div>
            <p id="comfort-description" className="text-xs text-muted-foreground pl-8">
              {t('consent.categories.comfort.examples')}
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button 
            variant="outline" 
            onClick={handleRejectAll}
            className="w-full sm:w-auto"
          >
            {t('consent.buttons.rejectAll')}
          </Button>
          <Button 
            variant="outline" 
            onClick={handleSave}
            className="w-full sm:w-auto"
          >
            {t('consent.buttons.savePreferences')}
          </Button>
          <Button 
            onClick={handleAcceptAll}
            className="w-full sm:w-auto"
          >
            {t('consent.buttons.acceptAll')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
