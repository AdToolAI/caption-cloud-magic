import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { BlackTieFooter } from "@/components/landing/BlackTieFooter";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { SEO } from "@/components/SEO";
import { getCanonicalUrl } from "@/config/seo";
import { motion } from "framer-motion";
import { LegalHeroHeader } from "@/components/legal/LegalHeroHeader";
import { LanguageToggle } from "@/components/legal/LanguageToggle";
import { PrivacyContent } from "@/components/legal/PrivacyContent";
import { LegalSection } from "@/components/legal/LegalSection";
import { tx } from "@/lib/i18nText";

const BackBreadcrumb = () => (
  <div className="mb-6">
    <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
      <ArrowLeft className="h-4 w-4" />{tx({ de: 'Zurück zur Startseite', en: 'Back to homepage', es: 'Volver al inicio' })}
    </Link>
  </div>
);

const Legal = () => {
  const { page } = useParams<{ page: string }>();
  const { language } = useTranslation();
  const [contentLang, setContentLang] = useState<"de" | "en">("de");
  
  const location = window.location.pathname;
  const actualPage = page || (location === '/privacy' ? 'privacy' : location === '/terms' ? 'terms' : location === '/imprint' ? 'imprint' : null);

  const pageType = actualPage === 'privacy' ? 'privacy' 
    : actualPage === 'terms' ? 'terms' 
    : actualPage === 'avv' ? 'avv' 
    : 'imprint';

  const seoContent = {
    privacy: {
      title: "Datenschutzerklärung | Privacy Policy – AdTool AI",
      description: tx({ de: "DSGVO-konforme Datenschutzerklärung von AdTool AI. Erfahren Sie, wie wir Ihre Daten schützen und verarbeiten.", en: "GDPR-compliant data protection declaration from AdTool AI. Find out how we protect and process your data.", es: "Declaración de protección de datos conforme al RGPD de AdTool AI. Descubra cómo protegemos y procesamos sus datos." })
    },
    terms: {
      title: "Nutzungsbedingungen | Terms of Service – AdTool AI", 
      description: "{tx({ de: 'Allgemeine Nutzungsbedingungen für AdTool AI. Rechtssicher und transparent.', en: 'General Terms of Service for AdTool AI. Legally sound and transparent.', es: 'Términos y condiciones generales de AdTool AI. Legalmente sólidos y transparentes.' })}"
    },
    imprint: {
      title: "Impressum | Legal Notice – AdTool AI",
      description: tx({ de: "Impressum gemäß § 5 TMG für AdTool AI.", en: "Imprint according to § 5 TMG for AdTool AI.", es: "Pie de imprenta según § 5 TMG para AdTool AI." })
    },
    avv: {
      title: "Auftragsverarbeitungsvertrag (AVV) | DPA – AdTool AI",
      description: tx({ de: "DSGVO-konformer Auftragsverarbeitungsvertrag (Art. 28 DSGVO) für die Nutzung von AdTool AI.", en: "GDPR-compliant order processing contract (Art. 28 GDPR) for the use of AdTool AI.", es: "Contrato de procesamiento de pedidos conforme al RGPD (Art. 28 RGPD) para el uso de AdTool AI." })
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
          <main className="flex-1 container max-w-4xl mx-auto px-4 py-12">
            <BackBreadcrumb />
            <LegalHeroHeader type="privacy" lastUpdated="18. Oktober 2025" />
            <LanguageToggle currentLang={contentLang} onToggle={setContentLang} />
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
            >
              <PrivacyContent lang={contentLang} />
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

  if (pageType === 'terms') {
    return (
      <>
        <SEO 
          title={currentSeo.title}
          description={currentSeo.description}
          canonical={getCanonicalUrl('/legal/terms')}
        />
        <div className="min-h-screen flex flex-col bg-background">
          <main className="flex-1 container max-w-4xl mx-auto px-4 py-12">
            <BackBreadcrumb />
            <LegalHeroHeader type="terms" />
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="space-y-4"
            >
              <LegalSection title={tx({ de: '1. Geltungsbereich', en: '1. Scope', es: '1. Ámbito de aplicación' })} icon="scale" defaultOpen={true} index={0}>
                <p>{tx({ de: 'Diese Nutzungsbedingungen gelten für die Nutzung der AdTool AI Plattform und aller damit verbundenen Dienste.', en: 'These Terms of Service apply to the use of the AdTool AI platform and all related services.', es: 'Estos términos de servicio se aplican al uso de la plataforma AdTool AI y todos los servicios relacionados.' })}</p>
              </LegalSection>

              <LegalSection title={tx({ de: '2. Leistungsbeschreibung', en: '2. Service Description', es: '2. Descripción del servicio' })} icon="shield" index={1}>
                <p>{tx({ de: 'AdTool AI bietet eine KI-gestützte Plattform für Social Media Content Creation, Analytics und Scheduling.', en: 'AdTool AI provides an AI-powered platform for social media content creation, analytics, and scheduling.', es: 'AdTool AI ofrece una plataforma impulsada por IA para la creación de contenido en redes sociales, analítica y programación.' })}</p>
              </LegalSection>

              <LegalSection title={tx({ de: '3. Registrierung und Account', en: '3. Registration and Account', es: '3. Registro y cuenta' })} icon="users" index={2}>
                <ul className="list-disc list-inside space-y-2">
                  <li>{tx({ de: 'Für die Nutzung ist eine Registrierung erforderlich', en: 'Registration is required to use the service', es: 'Se requiere registro para usar el servicio' })}</li>
                  <li>{tx({ de: 'Sie sind für die Sicherheit Ihres Accounts verantwortlich', en: 'You are responsible for the security of your account', es: 'Usted es responsable de la seguridad de su cuenta' })}</li>
                  <li>{tx({ de: 'Mindestens 16 Jahre alt für die Nutzung', en: 'Must be at least 16 years old to use the service', es: 'Debe tener al menos 16 años para usar el servicio' })}</li>
                </ul>
              </LegalSection>

              <LegalSection title={tx({ de: '4. Nutzungsrechte', en: '4. Usage Rights', es: '4. Derechos de uso' })} icon="scale" index={3}>
                <ul className="list-disc list-inside space-y-2">
                  <li>{tx({ de: 'Sie erhalten ein nicht-exklusives, nicht übertragbares Nutzungsrecht', en: 'You receive a non-exclusive, non-transferable right of use', es: 'Usted recibe un derecho de uso no exclusivo e intransferible' })}</li>
                  <li>{tx({ de: 'Von der KI generierte Inhalte gehören Ihnen', en: 'AI-generated content belongs to you', es: 'El contenido generado por IA le pertenece' })}</li>
                  <li>{tx({ de: 'Keine Weitergabe von Account-Zugangsdaten', en: 'No sharing of account credentials', es: 'No se permite compartir las credenciales de la cuenta' })}</li>
                </ul>
              </LegalSection>

              <LegalSection title={tx({ de: '5. Zahlungsbedingungen', en: '5. Payment Terms', es: '5. Condiciones de pago' })} icon="database" index={4}>
                <ul className="list-disc list-inside space-y-2">
                  <li>{tx({ de: 'Abonnements werden monatlich oder jährlich abgerechnet', en: 'Subscriptions are billed monthly or annually', es: 'Las suscripciones se facturan mensual o anualmente' })}</li>
                  <li>{tx({ de: 'Zahlungen werden über Stripe abgewickelt', en: 'Payments are processed via Stripe', es: 'Los pagos se procesan a través de Stripe' })}</li>
                  <li>{tx({ de: 'Kündigung jederzeit zum Ende der Abrechnungsperiode', en: 'Cancellation possible at any time at the end of the billing period', es: 'Cancelación posible en cualquier momento al final del período de facturación' })}</li>
                </ul>
              </LegalSection>

              <LegalSection title={tx({ de: '6. Haftungsbeschränkung', en: '6. Limitation of Liability', es: '6. Limitación de responsabilidad' })} icon="alert" index={5}>
                <p>{tx({ de: 'AdTool AI haftet nicht für indirekte Schäden, entgangenen Gewinn oder Datenverlust. Die Haftung ist auf den Wert des bezahlten Abonnements beschränkt.', en: 'AdTool AI is not liable for indirect damages, lost profits, or data loss. Liability is limited to the value of the paid subscription.', es: 'AdTool AI no se responsabiliza por daños indirectos, lucro cesante o pérdida de datos. La responsabilidad se limita al valor de la suscripción pagada.' })}</p>
              </LegalSection>

              <LegalSection title={tx({ de: '7. Kündigung', en: '7. Termination', es: '7. Cancelación' })} icon="users" index={6}>
                <ul className="list-disc list-inside space-y-2">
                  <li>{tx({ de: 'Kündigung jederzeit in den Account-Einstellungen', en: 'Cancellation at any time in the account settings', es: 'Cancelación en cualquier momento en la configuración de la cuenta' })}</li>
                  <li>{tx({ de: 'Bei Verstoß gegen diese Bedingungen: Sofortige Sperrung möglich', en: 'In case of violation of these terms: immediate suspension possible', es: 'En caso de incumplimiento de estos términos: suspensión inmediata posible' })}</li>
                  <li>{tx({ de: 'Nach Kündigung: 30 Tage Datenexport möglich', en: 'After cancellation: 30-day data export window', es: 'Después de la cancelación: exportación de datos posible durante 30 días' })}</li>
                </ul>
              </LegalSection>

              <LegalSection id="section-8" title={tx({ de: '8. Abopreis und Founders-Vorteil', en: '8. Subscription Price and Founders Benefit', es: '8. Precio de suscripción y beneficio Founders' })} icon="alert" index={7}>
                <div className="space-y-3">
                  <p>
                    Es besteht genau ein kostenpflichtiges Abomodell zu
                    <strong className="text-foreground"> € 14,99 pro Monat</strong> (inkl. USt., monatlich kündbar).
                    Auf die Abogebühr wird kein Rabatt gewährt. Der Founders-Vorteil bezieht sich
                    <strong className="text-foreground"> {tx({ de: "ausschließlich auf den Kauf von KI-Credits", en: "exclusively on the purchase of AI credits", es: "exclusivamente en la compra de créditos AI" })}</strong>.
                  </p>
                  <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                    <li>
                      Die ersten <strong className="text-foreground">1.000 Abonnenten</strong> („Founders") erhalten für
                      <strong className="text-foreground"> 24 Monate ab Reservierung des Founders-Platzes 20 % Rabatt</strong>
                      auf jeden Kauf von KI-Credits (Video, Bild, Audio). Der Rabatt wird beim Checkout automatisch angewendet.
                    </li>
                    <li>
                      Die Anzahl der Founders-Plätze ist auf <strong className="text-foreground">1.000</strong> begrenzt.
                      Sind diese vergeben, entfällt der Vorteil für weitere Anmeldungen ohne Vorankündigung.
                    </li>
                    <li>
                      Der Founders-Vorteil ist an ein aktives Abonnement gebunden. Bei Kündigung des Abos oder Löschung
                      des Kontos <strong className="text-foreground">{tx({ de: 'erlischt der Rabatt und der Platz wird freigegeben', en: 'the discount expires and the slot is released', es: 'el descuento caduca y la plaza queda liberada' })}</strong>;
                      ein Wiederaufleben nach erneuter Anmeldung besteht nicht.
                    </li>
                    <li>
                      Der Anbieter behält sich vor, den regulären Abopreis, die Rabattbedingungen, die Slot-Anzahl und die
                      Laufzeit <strong className="text-foreground">{tx({ de: 'für die Zukunft zu ändern, auszusetzen oder zu beenden', en: 'to change, suspend, or terminate for the future', es: 'modificar, suspender o finalizar para el futuro' })}</strong>.
                      Preisänderungen für bestehende Abonnements werden mit angemessener Frist angekündigt; das Sonder­kündigungsrecht bleibt unberührt.
                    </li>
                    <li>
                      Die Aktion gilt <strong className="text-foreground">{tx({ de: "ausschließlich für die Dauer des aktiven Betriebs des Dienstes", en: "exclusively for the duration of the active operation of the service", es: "exclusivamente durante la duración del funcionamiento activo del servicio" })}</strong>.
                      Wird der Dienst eingestellt, erlischt jeder Anspruch auf den Rabatt. Bereits gezahlte
                      Beträge werden anteilig nach geltendem Recht behandelt.
                    </li>
                    <li>
                      Rabatte werden technisch über Stripe automatisch beim Checkout angewendet. Es besteht
                      kein Anspruch auf manuelle Eingabe oder nachträgliche Gewährung eines Rabatts.
                    </li>
                    <li>
                      Es handelt sich um ein freibleibendes Angebot. Maßgeblich für den abgeschlossenen Vertrag sind
                      ausschließlich die im Stripe-Checkout finalisierten Konditionen.
                    </li>
                  </ul>
                </div>
              </LegalSection>

              <LegalSection title={tx({ de: '9. Schlussbestimmungen', en: '9. Final Provisions', es: '9. Disposiciones finales' })} icon="scale" index={8}>
                <ul className="list-disc list-inside space-y-2">
                  <li>Es gilt deutsches Recht</li>
                  <li>Gerichtsstand: München, Deutschland</li>
                  <li>{tx({ de: 'Änderungen werden per E-Mail mitgeteilt', en: 'Changes will be communicated via email', es: 'Los cambios se comunicarán por correo electrónico' })}</li>
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

  if (pageType === 'avv') {
    return (
      <>
        <SEO 
          title={currentSeo.title}
          description={currentSeo.description}
          canonical={getCanonicalUrl('/legal/avv')}
        />
        <div className="min-h-screen flex flex-col bg-background">
          <main className="flex-1 container max-w-4xl mx-auto px-4 py-12">
            <BackBreadcrumb />
            <LegalHeroHeader type="avv" />
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="space-y-4"
            >
              <LegalSection title={tx({ de: '§ 1 Präambel & Definitionen', en: '§ 1 Preamble & Definitions', es: '§ 1 Preámbulo y definiciones' })} icon="scale" defaultOpen={true} index={0}>
                <div className="space-y-3">
                  <p>{tx({ de: 'Dieser Auftragsverarbeitungsvertrag (AVV) gemäß Art. 28 DSGVO wird geschlossen zwischen dem Nutzer der AdTool AI Plattform („Verantwortlicher") und AdTool AI, Samuel Dusatko, Bahnhofstraße 15a, 85221 Dachau („Auftragsverarbeiter").', en: 'This Data Processing Agreement (DPA) pursuant to Art. 28 GDPR is concluded between the user of the AdTool AI platform ("Controller") and AdTool AI, Samuel Dusatko, Bahnhofstraße 15a, 85221 Dachau ("Processor").', es: 'Este contrato de encargo de tratamiento de datos (DPA) conforme al art. 28 del RGPD se celebra entre el usuario de la plataforma AdTool AI ("Responsable") y AdTool AI, Samuel Dusatko, Bahnhofstraße 15a, 85221 Dachau ("Encargado").' })}</p>
                  <p className="font-medium text-foreground">Definitionen:</p>
                  <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
                    <li><strong className="text-foreground">Personenbezogene Daten:</strong> {tx({ de: "Alle Informationen gemäß Art. 4 Nr. 1 DSGVO", en: "All information in accordance with Art. 4 No. 1 GDPR", es: "Toda la información de conformidad con el art. 4 n.º 1 del RGPD" })}</li>
                    <li><strong className="text-foreground">Verarbeitung:</strong> Jeder Vorgang gemäß Art. 4 Nr. 2 DSGVO</li>
                    <li><strong className="text-foreground">Betroffene Person:</strong> {tx({ de: "Identifizierte oder identifizierbare natürliche Person", en: "Identified or identifiable natural person", es: "Persona física identificada o identificable" })}</li>
                  </ul>
                </div>
              </LegalSection>

              <LegalSection title={tx({ de: '§ 2 Gegenstand und Dauer', en: '§ 2 Subject Matter and Duration', es: '§ 2 Objeto y duración' })} icon="clock" index={1}>
                <div className="space-y-3">
                  <p>{tx({ de: 'Der Auftragsverarbeiter verarbeitet personenbezogene Daten im Auftrag des Verantwortlichen im Rahmen der Nutzung der AdTool AI Plattform für Social Media Content Creation und Management.', en: 'The processor processes personal data on behalf of the controller as part of the use of the AdTool AI platform for social media content creation and management.', es: 'El encargado trata datos personales por cuenta del responsable en el marco del uso de la plataforma AdTool AI para la creación y gestión de contenido en redes sociales.' })}</p>
                  <p>{tx({ de: 'Die Dauer der Verarbeitung entspricht der Laufzeit des Nutzungsvertrages. Nach Beendigung werden alle personenbezogenen Daten nach Wahl des Verantwortlichen gelöscht oder zurückgegeben.', en: "The duration of processing corresponds to the term of the usage agreement. Upon termination, all personal data will be deleted or returned at the controller's discretion.", es: 'La duración del tratamiento corresponde a la vigencia del contrato de uso. Tras su finalización, todos los datos personales se eliminarán o devolverán según la elección del responsable.' })}</p>
                </div>
              </LegalSection>

              <LegalSection title={tx({ de: '§ 3 Art und Zweck der Verarbeitung', en: '§ 3 Type and Purpose of Processing', es: '§ 3 Tipo y finalidad del tratamiento' })} icon="database" index={2}>
                <div className="space-y-3">
                  <p className="font-medium text-foreground">Zweck der Verarbeitung:</p>
                  <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
                    <li>Bereitstellung der AdTool AI SaaS-Plattform</li>
                    <li>{tx({ de: "KI-gestützte Content-Generierung und -Optimierung", en: "AI-powered content generation and optimization", es: "Generación y optimización de contenido impulsada por IA" })}</li>
                    <li>{tx({ de: "Social Media Account-Verbindungen und Posting", en: "Social media account connections and posting", es: "Conexiones y publicaciones de cuentas de redes sociales" })}</li>
                    <li>{tx({ de: "Analytics und Performance-Tracking", en: "Analytics and performance tracking", es: "Análisis y seguimiento del rendimiento." })}</li>
                    <li>{tx({ de: "Nutzer-Authentifizierung und Account-Verwaltung", en: "User authentication and account management", es: "Autenticación de usuarios y gestión de cuentas." })}</li>
                  </ul>
                  <p className="font-medium text-foreground mt-4">Art der Verarbeitung:</p>
                  <p className="text-muted-foreground">Erhebung, Speicherung, Nutzung, Übermittlung, Löschung von Daten gemäß den technischen Anforderungen der Plattform.</p>
                </div>
              </LegalSection>

              <LegalSection title={tx({ de: '§ 4 Kategorien betroffener Personen und Daten', en: '§ 4 Categories of Data Subjects and Data', es: '§ 4 Categorías de interesados y datos' })} icon="users" index={3}>
                <div className="space-y-3">
                  <p className="font-medium text-foreground">Kategorien betroffener Personen:</p>
                  <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
                    <li>Nutzer der AdTool AI Plattform</li>
                    <li>{tx({ de: "Follower und Kontakte auf verbundenen Social Media Accounts", en: "Followers and contacts on connected social media accounts", es: "Seguidores y contactos en cuentas de redes sociales conectadas" })}</li>
                    <li>{tx({ de: "Personen, die in hochgeladenen Medien dargestellt werden", en: "People featured in uploaded media", es: "Personas que aparecen en los medios subidos" })}</li>
                  </ul>
                  <p className="font-medium text-foreground mt-4">Kategorien personenbezogener Daten:</p>
                  <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
                    <li>Kontaktdaten (Name, E-Mail)</li>
                    <li>Account-Daten (Benutzername, Passwort-Hash)</li>
                    <li>{tx({ de: "Social Media Account-Tokens und -Metadaten", en: "Social media account tokens and metadata", es: "Tokens y metadatos de cuentas de redes sociales" })}</li>
                    <li>Hochgeladene Medien (Bilder, Videos)</li>
                    <li>{tx({ de: "Nutzungsdaten und Analytics", en: "Usage data and analytics", es: "Datos de uso y análisis" })}</li>
                  </ul>
                </div>
              </LegalSection>

              <LegalSection title={tx({ de: '§ 5 Rechte und Pflichten des Verantwortlichen', en: '§ 5 Rights and Obligations of the Controller', es: '§ 5 Derechos y obligaciones del responsable' })} icon="shield" index={4}>
                <div className="space-y-3">
                  <p>{tx({ de: 'Der Verantwortliche ist für die Rechtmäßigkeit der Datenverarbeitung verantwortlich und hat sicherzustellen, dass:', en: 'The controller is responsible for the lawfulness of data processing and must ensure that:', es: 'El responsable es responsable de la licitud del tratamiento de datos y debe garantizar que:' })}</p>
                  <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
                    <li>{tx({ de: "Die Verarbeitung auf einer Rechtsgrundlage basiert", en: "The processing is based on a legal basis", es: "El procesamiento se basa en una base legal." })}</li>
                    <li>{tx({ de: "Betroffene Personen ordnungsgemäß informiert werden", en: "Those affected are properly informed", es: "Los afectados están debidamente informados" })}</li>
                    <li>{tx({ de: "Anfragen von Betroffenen bearbeitet werden", en: "Inquiries from those affected are processed", es: "Se tramitan las consultas de los afectados" })}</li>
                    <li>{tx({ de: "Hochgeladene Inhalte keine Rechte Dritter verletzen", en: "Uploaded content does not violate the rights of third parties", es: "El contenido subido no viola los derechos de terceros." })}</li>
                  </ul>
                </div>
              </LegalSection>

              <LegalSection title={tx({ de: '§ 6 Pflichten des Auftragsverarbeiters', en: '§ 6 Obligations of the Processor', es: '§ 6 Obligaciones del encargado' })} icon="lock" index={5}>
                <div className="space-y-3">
                  <p>Der Auftragsverarbeiter verpflichtet sich:</p>
                  <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
                    <li>Daten nur gemäß dokumentierten Weisungen zu verarbeiten</li>
                    <li>Zur Vertraulichkeit verpflichtete Mitarbeiter einzusetzen</li>
                    <li>{tx({ de: "Angemessene technische und organisatorische Maßnahmen zu implementieren", en: "Implement appropriate technical and organizational measures", es: "Implementar medidas técnicas y organizativas apropiadas." })}</li>
                    <li>{tx({ de: "Subunternehmer nur mit vorheriger Genehmigung einzusetzen", en: "Only use subcontractors with prior approval", es: "Utilice únicamente subcontratistas con aprobación previa." })}</li>
                    <li>Den Verantwortlichen bei Anfragen Betroffener zu unterstützen</li>
                    <li>Datenschutzverletzungen unverzüglich zu melden</li>
                    <li>{tx({ de: 'Nach Beendigung alle Daten zu löschen oder zurückzugeben', en: 'Delete or return all data after termination', es: 'Eliminar o devolver todos los datos tras la finalización' })}</li>
                  </ul>
                </div>
              </LegalSection>

              <LegalSection title={tx({ de: '§ 7 Technische und organisatorische Maßnahmen (TOMs)', en: '§ 7 Technical and Organizational Measures (TOMs)', es: '§ 7 Medidas técnicas y organizativas (TOM)' })} icon="shield" index={6}>
                <div className="space-y-3">
                  <p>Der Auftragsverarbeiter gewährleistet folgende Maßnahmen gemäß Art. 32 DSGVO:</p>
                  <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
                    <li><strong className="text-foreground">Vertraulichkeit:</strong> Zugriffskontrolle, Verschlüsselung, Pseudonymisierung</li>
                    <li><strong className="text-foreground">Integrität:</strong> Eingabekontrolle, Weitergabekontrolle</li>
                    <li><strong className="text-foreground">Verfügbarkeit:</strong> Backup-Systeme, Disaster Recovery</li>
                    <li><strong className="text-foreground">Belastbarkeit:</strong> Skalierbare Infrastruktur, Monitoring</li>
                    <li><strong className="text-foreground">Wiederherstellung:</strong> Regelmäßige Tests der Wiederherstellungsverfahren</li>
                  </ul>
                  <p className="mt-3 text-primary/80">{tx({ de: 'Die Infrastruktur wird über Supabase (Frankfurt, DE) und Cloudflare bereitgestellt.', en: 'The infrastructure is provided via Supabase (Frankfurt, DE) and Cloudflare.', es: 'La infraestructura se proporciona a través de Supabase (Fráncfort, DE) y Cloudflare.' })}</p>
                </div>
              </LegalSection>

              <LegalSection title={tx({ de: '§ 8 Subunternehmer', en: '§ 8 Subprocessors', es: '§ 8 Subencargados' })} icon="users" index={7}>
                <div className="space-y-3">
                  <p>{tx({ de: "Folgende Subunternehmer werden eingesetzt:", en: "The following subcontractors are used:", es: "Se utilizan los siguientes subcontratistas:" })}</p>
                  <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
                    <li><strong className="text-foreground">Supabase Inc.</strong> – Datenbank, Authentifizierung (EU-Server)</li>
                    <li><strong className="text-foreground">Stripe Inc.</strong> – Zahlungsabwicklung</li>
                    <li><strong className="text-foreground">OpenAI / Google AI</strong> {tx({ de: "– KI-Verarbeitung (mit DPA)", en: "– AI processing (with DPA)", es: "– Procesamiento de IA (con DPA)" })}</li>
                    <li><strong className="text-foreground">AWS (Amazon)</strong> – Video-Rendering (EU-Region)</li>
                    <li><strong className="text-foreground">Resend</strong> – E-Mail-Versand</li>
                  </ul>
                  <p className="mt-3">{tx({ de: 'Eine Erweiterung der Liste wird dem Verantwortlichen vorab mitgeteilt. Widerspruch ist innerhalb von 14 Tagen möglich.', en: 'Any extension of the list will be communicated to the controller in advance. Objection is possible within 14 days.', es: 'Cualquier ampliación de la lista se comunicará previamente al responsable. Es posible presentar objeción en un plazo de 14 días.' })}</p>
                </div>
              </LegalSection>

              <LegalSection title={tx({ de: '§ 9 Rechte der betroffenen Personen', en: '§ 9 Rights of Data Subjects', es: '§ 9 Derechos de los interesados' })} icon="users" index={8}>
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
                  <p className="mt-3">{tx({ de: "Anfragen werden innerhalb von 72 Stunden bearbeitet.", en: "Requests will be processed within 72 hours.", es: "Las solicitudes se procesarán dentro de las 72 horas." })}</p>
                </div>
              </LegalSection>

              <LegalSection title={tx({ de: '§ 10 Beendigung und Löschung', en: '§ 10 Termination and Deletion', es: '§ 10 Finalización y eliminación' })} icon="alert" index={9}>
                <div className="space-y-3">
                  <p>{tx({ de: "Nach Beendigung der Auftragsverarbeitung wird der Auftragsverarbeiter:", en: "After completion of order processing, the processor will:", es: "Una vez finalizado el procesamiento del pedido, el procesador:" })}</p>
                  <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
                    <li>{tx({ de: 'Alle personenbezogenen Daten löschen oder zurückgeben (nach Wahl des Verantwortlichen)', en: "Delete or return all personal data (at the controller's discretion)", es: 'Eliminar o devolver todos los datos personales (a elección del responsable)' })}</li>
                    <li>Bestehende Kopien vernichten</li>
                    <li>Die Löschung schriftlich bestätigen</li>
                  </ul>
                  <p className="mt-3">{tx({ de: 'Gesetzliche Aufbewahrungspflichten bleiben unberührt. Nutzer können ihre Daten jederzeit über die Kontoeinstellungen exportieren.', en: 'Statutory retention obligations remain unaffected. Users can export their data at any time via the account settings.', es: 'Las obligaciones legales de conservación permanecen inalteradas. Los usuarios pueden exportar sus datos en cualquier momento desde la configuración de la cuenta.' })}</p>
                </div>
              </LegalSection>

              <LegalSection title={tx({ de: '§ 11 Haftung und Schadensersatz', en: '§ 11 Liability and Damages', es: '§ 11 Responsabilidad e indemnización' })} icon="scale" index={10}>
                <div className="space-y-3">
                  <p>{tx({ de: 'Die Haftung richtet sich nach Art. 82 DSGVO. Der Auftragsverarbeiter haftet für Schäden, die durch Verstöße gegen die DSGVO oder gegen Weisungen des Verantwortlichen entstehen.', en: "Liability is governed by Art. 82 GDPR. The processor is liable for damages caused by violations of the GDPR or the controller's instructions.", es: 'La responsabilidad se rige por el art. 82 del RGPD. El encargado responde por los daños causados por infracciones del RGPD o de las instrucciones del responsable.' })}</p>
                  <p>{tx({ de: 'Eine Haftung des Auftragsverarbeiters ist ausgeschlossen, wenn er nachweist, dass er in keiner Weise für den Umstand, durch den der Schaden eingetreten ist, verantwortlich ist.', en: "The processor's liability is excluded if it proves that it is in no way responsible for the circumstance that caused the damage.", es: 'La responsabilidad del encargado queda excluida si demuestra que no es responsable en modo alguno de la circunstancia que causó el daño.' })}</p>
                </div>
              </LegalSection>

              <LegalSection title={tx({ de: '§ 12 Schlussbestimmungen', en: '§ 12 Final Provisions', es: '§ 12 Disposiciones finales' })} icon="scale" index={11}>
                <div className="space-y-3">
                  <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
                    <li>Es gilt deutsches Recht</li>
                    <li>{tx({ de: "Gerichtsstand ist München, Deutschland", en: "The place of jurisdiction is Munich, Germany", es: "El lugar de jurisdicción es Munich, Alemania." })}</li>
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
        <main className="flex-1 container max-w-4xl mx-auto px-4 py-12">
          <BackBreadcrumb />
          <LegalHeroHeader type="imprint" />
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="space-y-4"
          >
            <LegalSection title={tx({ de: 'Angaben gemäß § 5 TMG', en: 'Information pursuant to § 5 TMG', es: 'Información conforme al § 5 TMG' })} icon="scale" defaultOpen={true} index={0}>
              <div className="space-y-2">
                <p className="font-semibold text-foreground">AdTool AI</p>
                <p>Samuel Dusatko</p>
                <p>Bahnhofstraße 15a</p>
                <p>85221 Dachau</p>
                <p>Germany</p>
              </div>
            </LegalSection>

            <LegalSection title={tx({ de: 'Kontakt', en: 'Contact', es: 'Contacto' })} icon="mail" index={1}>
              <div className="space-y-2">
                <p><strong className="text-foreground">E-Mail:</strong> support@useadtool.ai</p>
                <p><strong className="text-foreground">Datenschutz:</strong> privacy@useadtool.ai</p>
              </div>
            </LegalSection>

            <LegalSection title={tx({ de: 'Verantwortlich für den Inhalt', en: 'Responsible for content', es: 'Responsable del contenido' })} icon="users" index={2}>
              <div className="space-y-2">
                <p className="font-semibold text-foreground">Samuel Dusatko</p>
                <p>{tx({ de: 'Geschäftsführer', en: 'Managing Director', es: 'Director general' })}</p>
              </div>
            </LegalSection>

            <LegalSection title={tx({ de: 'Streitschlichtung', en: 'Dispute resolution', es: 'Resolución de litigios' })} icon="scale" index={3}>
              <div className="space-y-3">
                <p>{tx({ de: 'Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:', en: 'The European Commission provides a platform for online dispute resolution (ODR):', es: 'La Comisión Europea ofrece una plataforma de resolución de litigios en línea (ODR):' })}</p>
                <a 
                  href="https://ec.europa.eu/consumers/odr" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  ec.europa.eu/consumers/odr <span>↗</span>
                </a>
                <p className="mt-3">{tx({ de: 'Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.', en: 'We are not willing or obligated to participate in dispute resolution proceedings before a consumer arbitration board.', es: 'No estamos dispuestos ni obligados a participar en procedimientos de resolución de litigios ante un organismo de arbitraje de consumo.' })}</p>
              </div>
            </LegalSection>

            <LegalSection title={tx({ de: 'Haftung für Inhalte', en: 'Liability for content', es: 'Responsabilidad por el contenido' })} icon="alert" index={4}>
              <div className="space-y-3">
                <p>{tx({ de: 'Als Diensteanbieter sind wir gemäß § 7 Abs.1 TMG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 TMG sind wir als Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.', en: 'As a service provider, we are responsible for our own content on these pages in accordance with general laws pursuant to Section 7 (1) TMG. However, pursuant to Sections 8 to 10 TMG, we as a service provider are not obligated to monitor transmitted or stored third-party information or to investigate circumstances that indicate illegal activity.', es: 'Como proveedor de servicios, somos responsables de nuestro propio contenido en estas páginas conforme a las leyes generales según el artículo 7 (1) TMG. Sin embargo, según los artículos 8 a 10 TMG, no estamos obligados como proveedor de servicios a supervisar la información de terceros transmitida o almacenada ni a investigar circunstancias que indiquen actividad ilegal.' })}</p>
                <p>{tx({ de: 'Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen nach den allgemeinen Gesetzen bleiben hiervon unberührt. Eine diesbezügliche Haftung ist jedoch erst ab dem Zeitpunkt der Kenntnis einer konkreten Rechtsverletzung möglich. Bei Bekanntwerden von entsprechenden Rechtsverletzungen werden wir diese Inhalte umgehend entfernen.', en: 'Obligations to remove or block the use of information under general laws remain unaffected. However, liability in this regard is only possible from the point in time at which a specific infringement becomes known. Upon becoming aware of any such infringements, we will remove this content immediately.', es: 'Las obligaciones de eliminar o bloquear el uso de información conforme a las leyes generales permanecen inalteradas. No obstante, la responsabilidad al respecto solo es posible a partir del momento en que se tenga conocimiento de una infracción concreta. En cuanto tengamos conocimiento de tales infracciones, eliminaremos este contenido de inmediato.' })}</p>
              </div>
            </LegalSection>

            <LegalSection title={tx({ de: 'Haftung für Links', en: 'Liability for links', es: 'Responsabilidad por enlaces' })} icon="globe" index={5}>
              <div className="space-y-3">
                <p>{tx({ de: 'Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich.', en: 'Our offering contains links to external third-party websites over whose content we have no influence. Therefore, we cannot assume any liability for this third-party content. The respective provider or operator of the linked pages is always responsible for their content.', es: 'Nuestra oferta contiene enlaces a sitios web externos de terceros sobre cuyo contenido no tenemos ninguna influencia. Por ello, no podemos asumir ninguna responsabilidad por dicho contenido ajeno. El respectivo proveedor u operador de las páginas enlazadas es siempre responsable de su contenido.' })}</p>
                <p>{tx({ de: 'Die verlinkten Seiten wurden zum Zeitpunkt der Verlinkung auf mögliche Rechtsverstöße überprüft. Rechtswidrige Inhalte waren zum Zeitpunkt der Verlinkung nicht erkennbar. Eine permanente inhaltliche Kontrolle der verlinkten Seiten ist jedoch ohne konkrete Anhaltspunkte einer Rechtsverletzung nicht zumutbar. Bei Bekanntwerden von Rechtsverletzungen werden wir derartige Links umgehend entfernen.', en: 'The linked pages were checked for possible legal violations at the time of linking. No illegal content was identifiable at the time of linking. However, permanent monitoring of the content of linked pages is not reasonable without concrete evidence of a legal violation. Upon becoming aware of any legal violations, we will remove such links immediately.', es: 'Las páginas enlazadas fueron revisadas en busca de posibles infracciones legales en el momento de establecer el enlace. No se identificó contenido ilegal en ese momento. Sin embargo, no es razonable exigir un control permanente del contenido de las páginas enlazadas sin indicios concretos de una infracción legal. En cuanto tengamos conocimiento de infracciones legales, eliminaremos dichos enlaces de inmediato.' })}</p>
              </div>
            </LegalSection>

            <LegalSection title={tx({ de: 'Urheberrecht', en: 'Copyright', es: 'Derechos de autor' })} icon="lock" index={6}>
              <div className="space-y-3">
                <p>{tx({ de: 'Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers.', en: 'The content and works created by the site operators on these pages are subject to German copyright law. Reproduction, editing, distribution, and any kind of use outside the limits of copyright law require the written consent of the respective author or creator.', es: 'El contenido y las obras creadas por los operadores del sitio en estas páginas están sujetos a la legislación alemana de derechos de autor. La reproducción, edición, distribución y cualquier tipo de uso fuera de los límites de la ley de derechos de autor requieren el consentimiento por escrito del autor o creador respectivo.' })}</p>
                <p>{tx({ de: 'Downloads und Kopien dieser Seite sind nur für den privaten, nicht kommerziellen Gebrauch gestattet. Soweit die Inhalte auf dieser Seite nicht vom Betreiber erstellt wurden, werden die Urheberrechte Dritter beachtet. Insbesondere werden Inhalte Dritter als solche gekennzeichnet. Sollten Sie trotzdem auf eine Urheberrechtsverletzung aufmerksam werden, bitten wir um einen entsprechenden Hinweis.', en: 'Downloads and copies of this page are only permitted for private, non-commercial use. Insofar as the content on this page was not created by the operator, the copyrights of third parties are respected. In particular, third-party content is marked as such. Should you nevertheless become aware of a copyright infringement, please notify us accordingly.', es: 'Las descargas y copias de esta página solo están permitidas para uso privado y no comercial. En la medida en que el contenido de esta página no haya sido creado por el operador, se respetan los derechos de autor de terceros. En particular, el contenido de terceros se identifica como tal. Si a pesar de ello detecta una infracción de derechos de autor, le rogamos que nos lo comunique.' })}</p>
              </div>
            </LegalSection>

            <LegalSection title={tx({ de: 'KI-generierte Inhalte (EU AI Act)', en: 'AI-generated content (EU AI Act)', es: 'Contenido generado por IA (Ley de IA de la UE)' })} icon="shield" index={7}>
              <div className="space-y-3">
                <p>{tx({ de: 'AdTool AI nutzt künstliche Intelligenz zur Unterstützung der Content-Generierung. Gemäß dem EU AI Act (Verordnung 2024/1689) weisen wir darauf hin, dass bestimmte Inhalte auf dieser Plattform durch KI-Systeme erstellt oder unterstützt werden können.', en: 'AdTool AI uses artificial intelligence to support content generation. In accordance with the EU AI Act (Regulation 2024/1689), we point out that certain content on this platform may be created or supported by AI systems.', es: 'AdTool AI utiliza inteligencia artificial para apoyar la generación de contenido. De acuerdo con la Ley de IA de la UE (Reglamento 2024/1689), señalamos que ciertos contenidos de esta plataforma pueden ser creados o asistidos por sistemas de IA.' })}</p>
                <p>{tx({ de: 'Die Nutzer sind für die Prüfung, Anpassung und finale Verwendung aller KI-generierten Inhalte selbst verantwortlich. AdTool AI übernimmt keine Haftung für die Richtigkeit, Vollständigkeit oder Rechtmäßigkeit von KI-generierten Inhalten, die durch Nutzer veröffentlicht werden.', en: 'Users are themselves responsible for reviewing, adapting, and finally using all AI-generated content. AdTool AI assumes no liability for the accuracy, completeness, or legality of AI-generated content published by users.', es: 'Los usuarios son responsables de revisar, adaptar y utilizar finalmente todo el contenido generado por IA. AdTool AI no asume responsabilidad alguna por la exactitud, integridad o legalidad del contenido generado por IA que publiquen los usuarios.' })}</p>
                <p className="text-primary/80 font-medium">{tx({ de: 'Wir empfehlen, alle generierten Inhalte vor der Veröffentlichung auf Richtigkeit und Angemessenheit zu prüfen.', en: 'We recommend reviewing all generated content for accuracy and appropriateness before publishing.', es: 'Recomendamos revisar todo el contenido generado en cuanto a exactitud e idoneidad antes de publicarlo.' })}</p>
              </div>
            </LegalSection>

            <LegalSection title={tx({ de: 'Gewerbliche Schutzrechte / Markenrecht', en: 'Industrial property rights / Trademark law', es: 'Derechos de propiedad industrial / Derecho de marcas' })} icon="scale" index={8}>
              <p>{tx({ de: 'Alle auf dieser Website genannten Marken- und Produktnamen, Logos und Kennzeichen sind Eigentum ihrer jeweiligen Inhaber und unterliegen dem Schutz der jeweils geltenden Marken- und Urheberrechte. Die bloße Nennung bedeutet nicht, dass Marken nicht durch Rechte Dritter geschützt sind. AdTool AI ist eine eingetragene Marke.', en: 'All brand and product names, logos, and trademarks mentioned on this website are the property of their respective owners and are protected under the applicable trademark and copyright laws. Mere mention does not mean that trademarks are not protected by third-party rights. AdTool AI is a registered trademark.', es: 'Todas las marcas y nombres de productos, logotipos y marcas comerciales mencionados en este sitio web son propiedad de sus respectivos titulares y están protegidos por las leyes de marcas y derechos de autor aplicables. La mera mención no significa que las marcas no estén protegidas por derechos de terceros. AdTool AI es una marca registrada.' })}</p>
            </LegalSection>

            <LegalSection title={tx({ de: 'Quellenangaben für Medien', en: 'Media attribution', es: 'Atribución de medios' })} icon="database" index={9}>
              <div className="space-y-3">
                <p>{tx({ de: 'Auf dieser Website verwendete Bilder, Icons und Grafiken stammen aus folgenden lizenzierten Quellen:', en: 'Images, icons, and graphics used on this website originate from the following licensed sources:', es: 'Las imágenes, iconos y gráficos utilizados en este sitio web provienen de las siguientes fuentes con licencia:' })}</p>
                <ul className="list-disc list-inside space-y-1.5 text-muted-foreground">
                  <li>Icons: Lucide Icons (ISC License)</li>
                  <li>Stock-Medien: Unsplash, Pexels (entsprechende Lizenzen)</li>
                  <li>Schriftarten: Google Fonts (Open Font License)</li>
                </ul>
                <p>{tx({ de: 'Die Nutzung erfolgt im Rahmen der jeweiligen Lizenzbedingungen.', en: 'Use is subject to the respective license terms.', es: 'El uso está sujeto a los términos de la licencia correspondiente.' })}</p>
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
