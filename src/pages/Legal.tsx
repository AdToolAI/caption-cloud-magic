import { useState } from "react";
import { useParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useTranslation } from "@/hooks/useTranslation";
import { SEO } from "@/components/SEO";
import { getCanonicalUrl } from "@/config/seo";
import { motion } from "framer-motion";
import { LegalHeroHeader } from "@/components/legal/LegalHeroHeader";
import { LanguageToggle } from "@/components/legal/LanguageToggle";
import { PrivacyContent } from "@/components/legal/PrivacyContent";
import { LegalSection } from "@/components/legal/LegalSection";

const Legal = () => {
  const { page } = useParams<{ page: string }>();
  const { language } = useTranslation();
  const [contentLang, setContentLang] = useState<"de" | "en">("de");
  
  // Support direct routes /privacy and /terms (for TikTok OAuth)
  const location = window.location.pathname;
  const actualPage = page || (location === '/privacy' ? 'privacy' : location === '/terms' ? 'terms' : null);

  // Determine page type
  const pageType = actualPage === 'privacy' ? 'privacy' : actualPage === 'terms' ? 'terms' : 'imprint';

  const seoContent = {
    privacy: {
      title: "Datenschutzerklärung | Privacy Policy – AdTool AI",
      description: "DSGVO-konforme Datenschutzerklärung von AdTool AI. Erfahren Sie, wie wir Ihre Daten schützen und verarbeiten."
    },
    terms: {
      title: "Nutzungsbedingungen | Terms of Service – AdTool AI", 
      description: "Allgemeine Nutzungsbedingungen für AdTool AI. Rechtssicher und transparent."
    },
    imprint: {
      title: "Impressum | Legal Notice – AdTool AI",
      description: "Impressum gemäß § 5 TMG für AdTool AI."
    }
  };

  const currentSeo = seoContent[pageType];

  if (pageType === 'privacy') {
    return (
      <>
        <SEO 
          title={currentSeo.title}
          description={currentSeo.description}
          canonical={getCanonicalUrl('/legal/privacy')}
        />
        <div className="min-h-screen flex flex-col bg-background">
          <Header />
          <main className="flex-1 container max-w-4xl mx-auto px-4 py-12">
            <LegalHeroHeader type="privacy" lastUpdated="18. Oktober 2025" />
            <LanguageToggle currentLang={contentLang} onToggle={setContentLang} />
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
            >
              <PrivacyContent lang={contentLang} />
            </motion.div>

            {/* Footer Note */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8, duration: 0.5 }}
              className="mt-12 text-center text-sm text-muted-foreground"
            >
              © 2025 AdTool AI – All rights reserved.
            </motion.div>
          </main>
          <Footer />
        </div>
      </>
    );
  }

  // Terms and Imprint pages - simplified versions
  if (pageType === 'terms') {
    return (
      <>
        <SEO 
          title={currentSeo.title}
          description={currentSeo.description}
          canonical={getCanonicalUrl('/legal/terms')}
        />
        <div className="min-h-screen flex flex-col bg-background">
          <Header />
          <main className="flex-1 container max-w-4xl mx-auto px-4 py-12">
            <LegalHeroHeader type="terms" />
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="space-y-4"
            >
              <LegalSection title="1. Geltungsbereich" icon="scale" defaultOpen={true} index={0}>
                <p>Diese Nutzungsbedingungen gelten für die Nutzung der AdTool AI Plattform und aller damit verbundenen Dienste.</p>
              </LegalSection>

              <LegalSection title="2. Leistungsbeschreibung" icon="shield" index={1}>
                <p>AdTool AI bietet eine KI-gestützte Plattform für Social Media Content Creation, Analytics und Scheduling.</p>
              </LegalSection>

              <LegalSection title="3. Registrierung und Account" icon="users" index={2}>
                <ul className="list-disc list-inside space-y-2">
                  <li>Für die Nutzung ist eine Registrierung erforderlich</li>
                  <li>Sie sind für die Sicherheit Ihres Accounts verantwortlich</li>
                  <li>Mindestens 16 Jahre alt für die Nutzung</li>
                </ul>
              </LegalSection>

              <LegalSection title="4. Nutzungsrechte" icon="scale" index={3}>
                <ul className="list-disc list-inside space-y-2">
                  <li>Sie erhalten ein nicht-exklusives, nicht übertragbares Nutzungsrecht</li>
                  <li>Von der KI generierte Inhalte gehören Ihnen</li>
                  <li>Keine Weitergabe von Account-Zugangsdaten</li>
                </ul>
              </LegalSection>

              <LegalSection title="5. Zahlungsbedingungen" icon="database" index={4}>
                <ul className="list-disc list-inside space-y-2">
                  <li>Abonnements werden monatlich oder jährlich abgerechnet</li>
                  <li>Zahlungen werden über Stripe abgewickelt</li>
                  <li>Kündigung jederzeit zum Ende der Abrechnungsperiode</li>
                </ul>
              </LegalSection>

              <LegalSection title="6. Haftungsbeschränkung" icon="alert" index={5}>
                <p>AdTool AI haftet nicht für indirekte Schäden, entgangenen Gewinn oder Datenverlust. Die Haftung ist auf den Wert des bezahlten Abonnements beschränkt.</p>
              </LegalSection>

              <LegalSection title="7. Kündigung" icon="users" index={6}>
                <ul className="list-disc list-inside space-y-2">
                  <li>Kündigung jederzeit in den Account-Einstellungen</li>
                  <li>Bei Verstoß gegen diese Bedingungen: Sofortige Sperrung möglich</li>
                  <li>Nach Kündigung: 30 Tage Datenexport möglich</li>
                </ul>
              </LegalSection>

              <LegalSection title="8. Schlussbestimmungen" icon="scale" index={7}>
                <ul className="list-disc list-inside space-y-2">
                  <li>Es gilt deutsches Recht</li>
                  <li>Gerichtsstand: München, Deutschland</li>
                  <li>Änderungen werden per E-Mail mitgeteilt</li>
                </ul>
              </LegalSection>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8, duration: 0.5 }}
              className="mt-12 text-center text-sm text-muted-foreground"
            >
              © 2025 AdTool AI – All rights reserved.
            </motion.div>
          </main>
          <Footer />
        </div>
      </>
    );
  }

  // Imprint page
  return (
    <>
      <SEO 
        title={currentSeo.title}
        description={currentSeo.description}
        canonical={getCanonicalUrl('/legal/imprint')}
      />
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 container max-w-4xl mx-auto px-4 py-12">
          <LegalHeroHeader type="imprint" />
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="space-y-4"
          >
            <LegalSection title="Angaben gemäß § 5 TMG" icon="scale" defaultOpen={true} index={0}>
              <div className="space-y-2">
                <p className="font-semibold text-foreground">AdTool AI</p>
                <p>Samuel Dusatko</p>
                <p>Bahnhofstraße 15a</p>
                <p>85221 Dachau</p>
                <p>Germany</p>
              </div>
            </LegalSection>

            <LegalSection title="Kontakt" icon="mail" index={1}>
              <div className="space-y-2">
                <p><strong className="text-foreground">E-Mail:</strong> support@useadtool.ai</p>
                <p><strong className="text-foreground">Datenschutz:</strong> privacy@useadtool.ai</p>
              </div>
            </LegalSection>

            <LegalSection title="Verantwortlich für den Inhalt" icon="users" index={2}>
              <div className="space-y-2">
                <p className="font-semibold text-foreground">Samuel Dusatko</p>
                <p>Geschäftsführer</p>
              </div>
            </LegalSection>

            <LegalSection title="Streitschlichtung" icon="scale" index={3}>
              <div className="space-y-3">
                <p>Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:</p>
                <a 
                  href="https://ec.europa.eu/consumers/odr" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  ec.europa.eu/consumers/odr <span>↗</span>
                </a>
                <p className="mt-3">Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>
              </div>
            </LegalSection>

            <LegalSection title="Haftung für Inhalte" icon="alert" index={4}>
              <p>Als Diensteanbieter sind wir gemäß § 7 Abs.1 TMG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 TMG sind wir als Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.</p>
            </LegalSection>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.5 }}
            className="mt-12 text-center text-sm text-muted-foreground"
          >
            © 2025 AdTool AI – All rights reserved.
          </motion.div>
        </main>
        <Footer />
      </div>
    </>
  );
};

export default Legal;
