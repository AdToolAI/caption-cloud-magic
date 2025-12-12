import { motion } from "framer-motion";
import { Mail, MapPin, Shield } from "lucide-react";

interface ContactBoxProps {
  lang: "de" | "en";
}

export const ContactBox = ({ lang }: ContactBoxProps) => {
  const content = {
    de: {
      title: "Kontakt für Datenschutzanfragen",
      email: "privacy@useadtool.ai",
      address: "Samuel Dusatko, Bahnhofstraße 15a, 85221 Dachau, Germany",
      authority: "Zuständige Aufsichtsbehörde",
      authorityName: "Bayerisches Landesamt für Datenschutzaufsicht (BayLDA)"
    },
    en: {
      title: "Contact for Privacy Inquiries",
      email: "privacy@useadtool.ai",
      address: "Samuel Dusatko, Bahnhofstraße 15a, 85221 Dachau, Germany",
      authority: "Supervisory Authority",
      authorityName: "Bayerisches Landesamt für Datenschutzaufsicht (BayLDA)"
    }
  };

  const t = content[lang];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.5 }}
      className="mt-8 space-y-4"
    >
      {/* Contact Card */}
      <div className="backdrop-blur-xl bg-primary/5 border border-primary/30 rounded-xl p-6 shadow-[0_0_30px_rgba(245,199,106,0.1)]">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-primary/20">
            <Mail className="w-5 h-5 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-primary">{t.title}</h3>
        </div>
        
        <div className="space-y-3 pl-11">
          <a 
            href={`mailto:${t.email}`}
            className="flex items-center gap-2 text-foreground hover:text-primary transition-colors group"
          >
            <span className="font-medium">{t.email}</span>
            <span className="text-xs text-muted-foreground group-hover:text-primary/70">→</span>
          </a>
          
          <div className="flex items-start gap-2 text-muted-foreground">
            <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span className="text-sm">{t.address}</span>
          </div>
        </div>
      </div>

      {/* Authority Card */}
      <div className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 rounded-lg bg-muted/50">
            <Shield className="w-5 h-5 text-cyan-400" />
          </div>
          <h3 className="text-lg font-semibold">{t.authority}</h3>
        </div>
        
        <div className="pl-11 space-y-2">
          <p className="text-foreground font-medium">{t.authorityName}</p>
          <a 
            href="https://www.lda.bayern.de"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            www.lda.bayern.de
            <span>↗</span>
          </a>
        </div>
      </div>
    </motion.div>
  );
};
