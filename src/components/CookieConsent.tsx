import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";
import { initConsent, saveConsent } from "@/lib/consent";
import { CookiePreferencesDialog } from "./CookiePreferencesDialog";
import { Cookie, Settings } from "lucide-react";
import { Link } from "react-router-dom";

export function CookieConsent() {
  const { t, language } = useTranslation();
  const [showBanner, setShowBanner] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);

  useEffect(() => {
    // Prüfe beim Laden, ob Consent bereits vorliegt
    const hasConsent = initConsent();
    setShowBanner(!hasConsent);
    
    // Event-Listener für window.CGConsent.open()
    const handleOpenPreferences = () => {
      setShowPreferences(true);
    };
    
    window.addEventListener('openCookiePreferences', handleOpenPreferences);
    
    return () => {
      window.removeEventListener('openCookiePreferences', handleOpenPreferences);
    };
  }, []);

  const handleAcceptAll = () => {
    saveConsent({
      necessary: true,
      analytics: true,
      marketing: true,
      comfort: true,
      locale: language,
    });
    setShowBanner(false);
  };

  const handleRejectAll = () => {
    saveConsent({
      necessary: true,
      analytics: false,
      marketing: false,
      comfort: false,
      locale: language,
    });
    setShowBanner(false);
  };

  const handleOpenPreferences = () => {
    setShowPreferences(true);
  };

  if (!showBanner) return null;

  return (
    <>
      {/* Cookie Banner */}
      <div 
        className="fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-6 pointer-events-none"
        role="region"
        aria-label={t('consent.banner.ariaLabel')}
      >
        <Card className="max-w-5xl mx-auto p-4 sm:p-6 shadow-2xl pointer-events-auto bg-card border-2">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            {/* Icon & Text */}
            <div className="flex-1 space-y-3">
              <div className="flex items-start gap-3">
                <Cookie className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold">
                    {t('consent.banner.title')}
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {t('consent.banner.description')}
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Link 
                      to="/legal/privacy" 
                      className="text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
                    >
                      {t('consent.banner.privacyLink')}
                    </Link>
                    <span className="text-muted-foreground">•</span>
                    <Link 
                      to="/legal/imprint" 
                      className="text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded"
                    >
                      {t('consent.banner.imprintLink')}
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto min-w-[200px]">
              <Button
                variant="outline"
                onClick={handleRejectAll}
                className="w-full sm:w-auto text-sm"
                aria-label={t('consent.buttons.rejectAll')}
              >
                {t('consent.buttons.rejectAll')}
              </Button>
              <Button
                variant="outline"
                onClick={handleOpenPreferences}
                className="w-full sm:w-auto text-sm gap-2"
                aria-label={t('consent.buttons.customize')}
              >
                <Settings className="h-4 w-4" aria-hidden="true" />
                {t('consent.buttons.customize')}
              </Button>
              <Button
                onClick={handleAcceptAll}
                className="w-full sm:w-auto text-sm bg-primary"
                aria-label={t('consent.buttons.acceptAll')}
              >
                {t('consent.buttons.acceptAll')}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Preferences Dialog */}
      <CookiePreferencesDialog 
        open={showPreferences} 
        onOpenChange={setShowPreferences} 
      />
    </>
  );
}

// Globale API für window.CGConsent.open()
if (typeof window !== 'undefined') {
  window.CGConsent = {
    open: () => {
      // Event dispatchen, um Dialog zu öffnen
      window.dispatchEvent(new CustomEvent('openCookiePreferences'));
    },
    getConsent: () => {
      const { getConsent } = require('@/lib/consent');
      return getConsent();
    },
    hasConsent: (category) => {
      const { hasConsent } = require('@/lib/consent');
      return hasConsent(category);
    },
  };
}
