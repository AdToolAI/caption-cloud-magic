import { motion } from "framer-motion";
import { Shield, FileText, Scale, FileCheck } from "lucide-react";

interface LegalHeroHeaderProps {
  type: "privacy" | "terms" | "imprint" | "avv";
  lastUpdated?: string;
}

const iconMap = {
  privacy: Shield,
  terms: FileText,
  imprint: Scale,
  avv: FileCheck,
};

const titleMap = {
  privacy: {
    de: "Datenschutzerklärung",
    en: "Privacy Policy",
    badge: "DSGVO-konform"
  },
  terms: {
    de: "Nutzungsbedingungen",
    en: "Terms of Service",
    badge: "Rechtssicher"
  },
  imprint: {
    de: "Impressum",
    en: "Legal Notice",
    badge: "§ 5 TMG"
  },
  avv: {
    de: "Auftragsverarbeitungsvertrag",
    en: "Data Processing Agreement",
    badge: "Art. 28 DSGVO"
  }
};

export const LegalHeroHeader = ({ type, lastUpdated }: LegalHeroHeaderProps) => {
  const Icon = iconMap[type];
  const titles = titleMap[type];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="relative text-center mb-12"
    >
      {/* Background Glow */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-primary/20 rounded-full blur-[100px] opacity-50" />
      </div>

      {/* Badge */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-md bg-primary/10 border border-primary/30 mb-6"
      >
        <motion.div
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <Icon className="w-4 h-4 text-primary" />
        </motion.div>
        <span className="text-sm font-medium text-primary tracking-wide">
          {titles.badge}
        </span>
      </motion.div>

      {/* Title */}
      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
        className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4"
      >
        <span className="bg-gradient-to-r from-primary via-primary/80 to-purple-400 bg-clip-text text-transparent font-serif">
          {titles.de}
        </span>
      </motion.h1>

      {/* Subtitle */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="text-muted-foreground text-lg"
      >
        {titles.en}
      </motion.p>

      {/* Last Updated Badge */}
      {lastUpdated && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="mt-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 border border-border/50"
        >
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-sm text-muted-foreground">
            Letzte Aktualisierung: {lastUpdated}
          </span>
        </motion.div>
      )}
    </motion.div>
  );
};
