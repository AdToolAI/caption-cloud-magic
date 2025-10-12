import { useTranslation } from "@/hooks/useTranslation";
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";

export const Footer = () => {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t bg-muted/50" role="contentinfo">
      <div className="container py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 font-bold text-lg" role="img" aria-label="CaptionGenie Logo">
              <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
              <span>CaptionGenie</span>
            </div>
            <p className="text-sm text-muted-foreground">
              AI-powered social media caption generation
            </p>
          </div>

          {/* Product */}
          <div>
            <h3 className="font-semibold mb-3">Product</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link to="/pricing" className="hover:text-foreground transition-colors">
                  {t('pricing')}
                </Link>
              </li>
              <li>
                <Link to="/faq" className="hover:text-foreground transition-colors">
                  {t('faq')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="font-semibold mb-3">Support</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link to="/support" className="hover:text-foreground transition-colors">
                  Contact
                </Link>
              </li>
              <li>
                <Link to="/billing" className="hover:text-foreground transition-colors">
                  Billing
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="font-semibold mb-3">Legal</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link to="/legal/privacy" className="hover:text-foreground transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/legal/terms" className="hover:text-foreground transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link to="/legal/imprint" className="hover:text-foreground transition-colors">
                  Imprint
                </Link>
              </li>
              <li>
                <button 
                  onClick={() => window.CGConsent?.open()}
                  className="hover:text-foreground transition-colors text-left"
                  aria-label={t('consent.footer.linkText')}
                >
                  {t('consent.footer.linkText')}
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t text-center">
          <p className="text-sm text-muted-foreground" role="contentinfo">
            © {currentYear} CaptionGenie. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};
