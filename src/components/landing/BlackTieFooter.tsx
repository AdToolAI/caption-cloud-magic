import { Link } from "react-router-dom";
import { Sparkles, Twitter, Linkedin, Instagram, Youtube } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

const socialLinks = [
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
      { label: "Roadmap", href: "/coming-soon" },
    ],
    resources: [
      { label: "Blog", href: "/coming-soon" },
      { label: "Tutorials", href: "/coming-soon" },
      { label: "API Docs", href: "/coming-soon" },
      { label: "Status", href: "/coming-soon" },
    ],
    company: [
      { label: "Über uns", href: "/coming-soon" },
      { label: "Karriere", href: "/coming-soon" },
      { label: "Kontakt", href: "/coming-soon" },
      { label: "Presse", href: "/coming-soon" },
    ],
    legal: [
      { label: "Datenschutz", href: "/privacy" },
      { label: "AGB", href: "/terms" },
      { label: "Impressum", href: "/imprint" },
      { label: "AVV", href: "/legal/avv" },
      { label: "Cookie-Einstellungen", href: "#", onClick: () => window.dispatchEvent(new CustomEvent('openCookiePreferences')) },
    ],
  };

  return (
    <footer className="relative border-t border-border/50 bg-card/30 backdrop-blur-sm">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      
      <div className="container max-w-7xl mx-auto px-4 py-16">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8 mb-12">
          {/* Brand Column */}
          <div className="col-span-2">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-gold-dark flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold text-foreground">AdTool AI</span>
            </Link>
            <p className="text-sm text-muted-foreground mb-6 max-w-xs">
              Dein KI-gestütztes Marketing-Arsenal für Social Media Erfolg. 
              Erstelle, plane und analysiere wie ein Profi.
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

          {/* Product */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-4">Produkt</h4>
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

          {/* Resources */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-4">Ressourcen</h4>
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

          {/* Company */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-4">Unternehmen</h4>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.label}>
                  <Link to={link.href} className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-4">Rechtliches</h4>
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

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-border/50 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} AdTool AI. Alle Rechte vorbehalten.
          </p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Made with</span>
            <span className="text-primary">♥</span>
            <span>in Germany</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
