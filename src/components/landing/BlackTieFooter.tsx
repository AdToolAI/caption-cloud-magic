import { Link } from "react-router-dom";
import { Sparkles, Twitter, Linkedin, Instagram, Youtube } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

/** lucide-react has no TikTok glyph — slim inline SVG in the same 16px style. */
const TikTokIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 8.5a6.5 6.5 0 0 1-5-2.3V15a6 6 0 1 1-6-6c.34 0 .67.03 1 .09v3.2A2.8 2.8 0 1 0 13 15V2h3a5 5 0 0 0 5 5z" />
  </svg>
);

const socialLinks = [
  { icon: TikTokIcon, href: "#", label: "TikTok" },
  { icon: Twitter, href: "#", label: "Twitter" },
  { icon: Linkedin, href: "#", label: "LinkedIn" },
  { icon: Instagram, href: "#", label: "Instagram" },
  { icon: Youtube, href: "#", label: "YouTube" },
];

export const BlackTieFooter = () => {
  const { t } = useTranslation();

  const footerLinks = {
    product: [
      { label: "Features", href: "/#features" },
      { label: t("nav.pricing"), href: "/pricing" },
      { label: t("nav.faq"), href: "/faq" },
    ],
    resources: [
      { label: "Status", href: "/status" },
      { label: t("landing.footer.contactLink"), href: "/support" },
    ],
    legal: [
      { label: t("landing.footer.privacy"), href: "/privacy" },
      { label: t("landing.footer.terms"), href: "/terms" },
      { label: t("landing.footer.imprint"), href: "/imprint" },
      { label: t("landing.footer.avv"), href: "/legal/avv" },
      { label: t("landing.footer.aiRefund"), href: "/legal/ai-video-refund" },
      { label: t("landing.footer.cookieSettings"), href: "#", onClick: () => window.dispatchEvent(new CustomEvent('openCookiePreferences')) },
    ],
  };

  return (
    <footer className="relative border-t border-border/50 bg-card/30 backdrop-blur-sm">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      
      <div className="container max-w-7xl mx-auto px-4 py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          <div className="col-span-2">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-gold-dark flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold text-foreground">AdTool AI</span>
            </Link>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs">
              {t("landing.footer.brandDescription")}
            </p>
            <div className="flex items-center gap-3">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                >
                  <social.icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-foreground mb-4">{t("landing.footer.product")}</h4>
            <ul className="space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.label}>
                  <Link to={link.href} className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-foreground mb-4">{t("landing.footer.resources")}</h4>
            <ul className="space-y-3">
              {footerLinks.resources.map((link) => (
                <li key={link.label}>
                  <Link to={link.href} className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-foreground mb-4">{t("landing.footer.legal")}</h4>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.label}>
                  {'onClick' in link && link.onClick ? (
                    <button
                      onClick={link.onClick}
                      className="text-sm text-muted-foreground hover:text-primary transition-colors"
                    >
                      {link.label}
                    </button>
                  ) : (
                    <Link to={link.href} className="text-sm text-muted-foreground hover:text-primary transition-colors">
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-border/50 flex justify-center md:justify-start">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} AdTool AI. {t("landing.footer.allRightsReserved")}
          </p>
        </div>
      </div>
    </footer>
  );
};
