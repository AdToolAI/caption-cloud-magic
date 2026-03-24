import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { BlackTieFooter } from "@/components/landing/BlackTieFooter";
import { Brand } from "@/components/layout/Brand";
import { ArrowLeft } from "lucide-react";
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
  const pageType = actualPage === 'privacy' ? 'privacy' 
    : actualPage === 'terms' ? 'terms' 
    : actualPage === 'avv' ? 'avv' 
    : 'imprint';

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
    },
    avv: {
      title: "Auftragsverarbeitungsvertrag (AVV) | DPA – AdTool AI",
      description: "DSGVO-konformer Auftragsverarbeitungsvertrag (Art. 28 DSGVO) für die Nutzung von AdTool AI."
    }
  };

  const currentSeo = seoContent[pageType as keyof typeof seoContent];

  if (pageType === 'privacy') {
    return (
      <>
        <SEO 
          title={currentSeo.title}
          description={currentSeo.description}
          canonical={getCanonicalUrl('/legal/privacy')}
        />
        <div className="min-h-screen flex flex-col bg-background">
          <nav className="border-b bg-background/95 backdrop-blur sticky top-0 z-50">
            <div className="container flex h-14 items-center gap-4">
              <Brand compact showText />
              <Link to="/" className="ml-auto flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-4 w-4" /> Zurück
              </Link>
            </div>
          </nav>
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
          <BlackTieFooter />
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
          <nav className="border-b bg-background/95 backdrop-blur sticky top-0 z-50">
            <div className="container flex h-14 items-center gap-4">
              <Brand compact showText />
              <Link to="/" className="ml-auto flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-4 w-4" /> Zurück
              </Link>
            </div>
          </nav>
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
          <BlackTieFooter />
        </div>
      </>
    );
  }

  // AVV (Auftragsverarbeitungsvertrag) page
  if (pageType === 'avv') {
    return (
      <>
        <SEO 
          title={currentSeo.title}
          description={currentSeo.description}
          canonical={getCanonicalUrl('/legal/avv')}
        />
        <div className="min-h-screen flex flex-col bg-background">
          <nav className="border-b bg-background/95 backdrop-blur sticky top-0 z-50">
            <div className="container flex h-14 items-center gap-4">
              <Brand compact showText />
              <Link to="/" className="ml-auto flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="h-4 w-4" /> Zurück
              </Link>
            </div>
          </nav>
          <main className="flex-1 container max-w-4xl mx-auto px-4 py-12">
            <LegalHeroHeader type="avv" />
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="space-y-4"
            >
              <LegalSection title="§ 1 Präambel & Definitionen" icon="scale" defaultOpen={true} index={0}>
                <div className="space-y-3">
                  <p>Dieser Auftragsverarbeitungsvertrag (AVV) gemäß Art. 28 DSGVO wird geschlossen zwischen dem Nutzer der AdTool AI Plattform („Verantwortlicher") und AdTool AI, Samuel Dusatko, Bahnhofstraße 15a, 85221 Dachau („Auftragsverarbeiter").</p>
                  <p className="font-medium text-foreground">Definitionen:</p>
                  <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
                    <li><strong className="text-foreground">Personenbezogene Daten:</strong> Alle Informationen gemäß Art. 4 Nr. 1 DSGVO</li>
                    <li><strong className="text-foreground">Verarbeitung:</strong> Jeder Vorgang gemäß Art. 4 Nr. 2 DSGVO</li>
                    <li><strong className="text-foreground">Betroffene Person:</strong> Identifizierte oder identifizierbare natürliche Person</li>
                  </ul>
                </div>
              </LegalSection>

              <LegalSection title="§ 2 Gegenstand und Dauer" icon="clock" index={1}>
                <div className="space-y-3">
                  <p>Der Auftragsverarbeiter verarbeitet personenbezogene Daten im Auftrag des Verantwortlichen im Rahmen der Nutzung der AdTool AI Plattform für Social Media Content Creation und Management.</p>
                  <p>Die Dauer der Verarbeitung entspricht der Laufzeit des Nutzungsvertrages. Nach Beendigung werden alle personenbezogenen Daten nach Wahl des Verantwortlichen gelöscht oder zurückgegeben.</p>
                </div>
              </LegalSection>

              <LegalSection title="§ 3 Art und Zweck der Verarbeitung" icon="database" index={2}>
                <div className="space-y-3">
                  <p className="font-medium text-foreground">Zweck der Verarbeitung:</p>
                  <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
                    <li>Bereitstellung der AdTool AI SaaS-Plattform</li>
                    <li>KI-gestützte Content-Generierung und -Optimierung</li>
                    <li>Social Media Account-Verbindungen und Posting</li>
                    <li>Analytics und Performance-Tracking</li>
                    <li>Nutzer-Authentifizierung und Account-Verwaltung</li>
                  </ul>
                  <p className="font-medium text-foreground mt-4">Art der Verarbeitung:</p>
                  <p className="text-muted-foreground">Erhebung, Speicherung, Nutzung, Übermittlung, Löschung von Daten gemäß den technischen Anforderungen der Plattform.</p>
                </div>
              </LegalSection>

              <LegalSection title="§ 4 Kategorien betroffener Personen und Daten" icon="users" index={3}>
                <div className="space-y-3">
                  <p className="font-medium text-foreground">Kategorien betroffener Personen:</p>
                  <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
                    <li>Nutzer der AdTool AI Plattform</li>
                    <li>Follower und Kontakte auf verbundenen Social Media Accounts</li>
                    <li>Personen, die in hochgeladenen Medien dargestellt werden</li>
                  </ul>
                  <p className="font-medium text-foreground mt-4">Kategorien personenbezogener Daten:</p>
                  <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
                    <li>Kontaktdaten (Name, E-Mail)</li>
                    <li>Account-Daten (Benutzername, Passwort-Hash)</li>
                    <li>Social Media Account-Tokens und -Metadaten</li>
                    <li>Hochgeladene Medien (Bilder, Videos)</li>
                    <li>Nutzungsdaten und Analytics</li>
                  </ul>
                </div>
              </LegalSection>

              <LegalSection title="§ 5 Rechte und Pflichten des Verantwortlichen" icon="shield" index={4}>
                <div className="space-y-3">
                  <p>Der Verantwortliche ist für die Rechtmäßigkeit der Datenverarbeitung verantwortlich und hat sicherzustellen, dass:</p>
                  <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
                    <li>Die Verarbeitung auf einer Rechtsgrundlage basiert</li>
                    <li>Betroffene Personen ordnungsgemäß informiert werden</li>
                    <li>Anfragen von Betroffenen bearbeitet werden</li>
                    <li>Hochgeladene Inhalte keine Rechte Dritter verletzen</li>
                  </ul>
                </div>
              </LegalSection>

              <LegalSection title="§ 6 Pflichten des Auftragsverarbeiters" icon="lock" index={5}>
                <div className="space-y-3">
                  <p>Der Auftragsverarbeiter verpflichtet sich:</p>
                  <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
                    <li>Daten nur gemäß dokumentierten Weisungen zu verarbeiten</li>
                    <li>Zur Vertraulichkeit verpflichtete Mitarbeiter einzusetzen</li>
                    <li>Angemessene technische und organisatorische Maßnahmen zu implementieren</li>
                    <li>Subunternehmer nur mit vorheriger Genehmigung einzusetzen</li>
                    <li>Den Verantwortlichen bei Anfragen Betroffener zu unterstützen</li>
                    <li>Datenschutzverletzungen unverzüglich zu melden</li>
                    <li>Nach Beendigung alle Daten zu löschen oder zurückzugeben</li>
                  </ul>
                </div>
              </LegalSection>

              <LegalSection title="§ 7 Technische und organisatorische Maßnahmen (TOMs)" icon="shield" index={6}>
                <div className="space-y-3">
                  <p>Der Auftragsverarbeiter gewährleistet folgende Maßnahmen gemäß Art. 32 DSGVO:</p>
                  <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
                    <li><strong className="text-foreground">Vertraulichkeit:</strong> Zugriffskontrolle, Verschlüsselung, Pseudonymisierung</li>
                    <li><strong className="text-foreground">Integrität:</strong> Eingabekontrolle, Weitergabekontrolle</li>
                    <li><strong className="text-foreground">Verfügbarkeit:</strong> Backup-Systeme, Disaster Recovery</li>
                    <li><strong className="text-foreground">Belastbarkeit:</strong> Skalierbare Infrastruktur, Monitoring</li>
                    <li><strong className="text-foreground">Wiederherstellung:</strong> Regelmäßige Tests der Wiederherstellungsverfahren</li>
                  </ul>
                  <p className="mt-3 text-primary/80">Die Infrastruktur wird über Supabase (Frankfurt, DE) und Cloudflare bereitgestellt.</p>
                </div>
              </LegalSection>

              <LegalSection title="§ 8 Subunternehmer" icon="users" index={7}>
                <div className="space-y-3">
                  <p>Folgende Subunternehmer werden eingesetzt:</p>
                  <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
                    <li><strong className="text-foreground">Supabase Inc.</strong> – Datenbank, Authentifizierung (EU-Server)</li>
                    <li><strong className="text-foreground">Stripe Inc.</strong> – Zahlungsabwicklung</li>
                    <li><strong className="text-foreground">OpenAI / Google AI</strong> – KI-Verarbeitung (mit DPA)</li>
                    <li><strong className="text-foreground">AWS (Amazon)</strong> – Video-Rendering (EU-Region)</li>
                    <li><strong className="text-foreground">Resend</strong> – E-Mail-Versand</li>
                  </ul>
                  <p className="mt-3">Eine Erweiterung der Liste wird dem Verantwortlichen vorab mitgeteilt. Widerspruch ist innerhalb von 14 Tagen möglich.</p>
                </div>
              </LegalSection>

              <LegalSection title="§ 9 Rechte der betroffenen Personen" icon="users" index={8}>
                <div className="space-y-3">
                  <p>Der Auftragsverarbeiter unterstützt den Verantwortlichen bei der Erfüllung von Betroffenenrechten:</p>
                  <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
                    <li>Auskunftsrecht (Art. 15 DSGVO)</li>
                    <li>Berichtigungsrecht (Art. 16 DSGVO)</li>
                    <li>Löschungsrecht (Art. 17 DSGVO)</li>
                    <li>Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
                    <li>Datenübertragbarkeit (Art. 20 DSGVO)</li>
                    <li>Widerspruchsrecht (Art. 21 DSGVO)</li>
                  </ul>
                  <p className="mt-3">Anfragen werden innerhalb von 72 Stunden bearbeitet.</p>
                </div>
              </LegalSection>

              <LegalSection title="§ 10 Beendigung und Löschung" icon="alert" index={9}>
                <div className="space-y-3">
                  <p>Nach Beendigung der Auftragsverarbeitung wird der Auftragsverarbeiter:</p>
                  <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
                    <li>Alle personenbezogenen Daten löschen oder zurückgeben (nach Wahl des Verantwortlichen)</li>
                    <li>Bestehende Kopien vernichten</li>
                    <li>Die Löschung schriftlich bestätigen</li>
                  </ul>
                  <p className="mt-3">Gesetzliche Aufbewahrungspflichten bleiben unberührt. Nutzer können ihre Daten jederzeit über die Kontoeinstellungen exportieren.</p>
                </div>
              </LegalSection>

              <LegalSection title="§ 11 Haftung und Schadensersatz" icon="scale" index={10}>
                <div className="space-y-3">
                  <p>Die Haftung richtet sich nach Art. 82 DSGVO. Der Auftragsverarbeiter haftet für Schäden, die durch Verstöße gegen die DSGVO oder gegen Weisungen des Verantwortlichen entstehen.</p>
                  <p>Eine Haftung des Auftragsverarbeiters ist ausgeschlossen, wenn er nachweist, dass er in keiner Weise für den Umstand, durch den der Schaden eingetreten ist, verantwortlich ist.</p>
                </div>
              </LegalSection>

              <LegalSection title="§ 12 Schlussbestimmungen" icon="scale" index={11}>
                <div className="space-y-3">
                  <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
                    <li>Es gilt deutsches Recht</li>
                    <li>Gerichtsstand ist München, Deutschland</li>
                    <li>Änderungen bedürfen der Schriftform</li>
                    <li>Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt</li>
                  </ul>
                  <p className="mt-4 font-medium text-foreground">Stand: Dezember 2025</p>
                </div>
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
          <BlackTieFooter />
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
        <nav className="border-b bg-background/95 backdrop-blur sticky top-0 z-50">
          <div className="container flex h-14 items-center gap-4">
            <Brand compact showText />
            <Link to="/" className="ml-auto flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-4 w-4" /> Zurück
            </Link>
          </div>
        </nav>
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
              <div className="space-y-3">
                <p>Als Diensteanbieter sind wir gemäß § 7 Abs.1 TMG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 TMG sind wir als Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.</p>
                <p>Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen nach den allgemeinen Gesetzen bleiben hiervon unberührt. Eine diesbezügliche Haftung ist jedoch erst ab dem Zeitpunkt der Kenntnis einer konkreten Rechtsverletzung möglich. Bei Bekanntwerden von entsprechenden Rechtsverletzungen werden wir diese Inhalte umgehend entfernen.</p>
              </div>
            </LegalSection>

            <LegalSection title="Haftung für Links" icon="globe" index={5}>
              <div className="space-y-3">
                <p>Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich.</p>
                <p>Die verlinkten Seiten wurden zum Zeitpunkt der Verlinkung auf mögliche Rechtsverstöße überprüft. Rechtswidrige Inhalte waren zum Zeitpunkt der Verlinkung nicht erkennbar. Eine permanente inhaltliche Kontrolle der verlinkten Seiten ist jedoch ohne konkrete Anhaltspunkte einer Rechtsverletzung nicht zumutbar. Bei Bekanntwerden von Rechtsverletzungen werden wir derartige Links umgehend entfernen.</p>
              </div>
            </LegalSection>

            <LegalSection title="Urheberrecht" icon="lock" index={6}>
              <div className="space-y-3">
                <p>Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers.</p>
                <p>Downloads und Kopien dieser Seite sind nur für den privaten, nicht kommerziellen Gebrauch gestattet. Soweit die Inhalte auf dieser Seite nicht vom Betreiber erstellt wurden, werden die Urheberrechte Dritter beachtet. Insbesondere werden Inhalte Dritter als solche gekennzeichnet. Sollten Sie trotzdem auf eine Urheberrechtsverletzung aufmerksam werden, bitten wir um einen entsprechenden Hinweis.</p>
              </div>
            </LegalSection>

            <LegalSection title="KI-generierte Inhalte (EU AI Act)" icon="shield" index={7}>
              <div className="space-y-3">
                <p>AdTool AI nutzt künstliche Intelligenz zur Unterstützung der Content-Generierung. Gemäß dem EU AI Act (Verordnung 2024/1689) weisen wir darauf hin, dass bestimmte Inhalte auf dieser Plattform durch KI-Systeme erstellt oder unterstützt werden können.</p>
                <p>Die Nutzer sind für die Prüfung, Anpassung und finale Verwendung aller KI-generierten Inhalte selbst verantwortlich. AdTool AI übernimmt keine Haftung für die Richtigkeit, Vollständigkeit oder Rechtmäßigkeit von KI-generierten Inhalten, die durch Nutzer veröffentlicht werden.</p>
                <p className="text-primary/80 font-medium">Wir empfehlen, alle generierten Inhalte vor der Veröffentlichung auf Richtigkeit und Angemessenheit zu prüfen.</p>
              </div>
            </LegalSection>

            <LegalSection title="Gewerbliche Schutzrechte / Markenrecht" icon="scale" index={8}>
              <p>Alle auf dieser Website genannten Marken- und Produktnamen, Logos und Kennzeichen sind Eigentum ihrer jeweiligen Inhaber und unterliegen dem Schutz der jeweils geltenden Marken- und Urheberrechte. Die bloße Nennung bedeutet nicht, dass Marken nicht durch Rechte Dritter geschützt sind. AdTool AI ist eine eingetragene Marke.</p>
            </LegalSection>

            <LegalSection title="Quellenangaben für Medien" icon="database" index={9}>
              <div className="space-y-3">
                <p>Auf dieser Website verwendete Bilder, Icons und Grafiken stammen aus folgenden lizenzierten Quellen:</p>
                <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
                  <li>Icons: Lucide Icons (ISC License)</li>
                  <li>Stock-Medien: Unsplash, Pexels (entsprechende Lizenzen)</li>
                  <li>Schriftarten: Google Fonts (Open Font License)</li>
                </ul>
                <p>Die Nutzung erfolgt im Rahmen der jeweiligen Lizenzbedingungen.</p>
              </div>
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
        <BlackTieFooter />
      </div>
    </>
  );
};

export default Legal;
